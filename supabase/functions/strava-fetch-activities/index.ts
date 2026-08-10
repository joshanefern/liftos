// deno-lint-ignore-file no-explicit-any
// Edge Function: strava-fetch-activities
// Pulls recent activities from the Strava API for the authenticated user and
// writes them to captured_sessions. Refreshes the access token transparently
// if expired. Idempotent on (provider, external_id) — re-runs only upsert.
// Token storage uses app-side AES-GCM (see _shared/strava-token-crypto.ts).
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  decryptStravaToken,
  encryptStravaToken,
} from "../_shared/strava-token-crypto.ts";

const STRAVA_CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID");
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

type IntegrationRow = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  last_synced_at: string | null;
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
};

type Streams = {
  time?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return json({ error: "strava credentials not configured on server" }, 500);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return json({ error: "missing authorization" }, 401);

  const jwt = authHeader.replace(/^Bearer\s+/i, "");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser(jwt);
  if (userError || !user) {
    return json(
      {
        error: "invalid auth",
        detail: userError?.message ?? "no user from jwt",
      },
      401,
    );
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: integration } = await serviceClient
    .from("wearable_integrations")
    .select("id, user_id, access_token, refresh_token, expires_at, last_synced_at")
    .eq("user_id", user.id)
    .eq("provider", "strava")
    .maybeSingle();

  if (!integration) {
    return json({ error: "no strava integration" }, 404);
  }
  const row = integration as IntegrationRow;

  // Decrypt tokens (app-side AES-GCM)
  let currentAccess: string;
  let currentRefresh: string;
  try {
    currentAccess = await decryptStravaToken(row.access_token);
    currentRefresh = await decryptStravaToken(row.refresh_token);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: "could not decrypt tokens", detail }, 500);
  }
  let currentExpiresAt = new Date(row.expires_at).getTime();

  // Refresh if the token is expired or within 60s of expiry
  if (currentExpiresAt < Date.now() + 60_000) {
    const refreshRes = await fetch("https://www.strava.com/api/v3/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        refresh_token: currentRefresh,
        grant_type: "refresh_token",
      }),
    });
    if (!refreshRes.ok) {
      await serviceClient
        .from("wearable_integrations")
        .update({ status: "expired" })
        .eq("id", row.id);
      return json({ error: "refresh failed" }, 401);
    }
    const refreshed = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
    currentAccess = refreshed.access_token;
    currentRefresh = refreshed.refresh_token;
    currentExpiresAt = refreshed.expires_at * 1000;

    let newAccessEnc: string;
    let newRefreshEnc: string;
    try {
      newAccessEnc = await encryptStravaToken(currentAccess);
      newRefreshEnc = await encryptStravaToken(currentRefresh);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return json({ error: "could not re-encrypt refreshed tokens", detail }, 500);
    }

    await serviceClient
      .from("wearable_integrations")
      .update({
        access_token: newAccessEnc,
        refresh_token: newRefreshEnc,
        expires_at: new Date(currentExpiresAt).toISOString(),
        status: "active",
      })
      .eq("id", row.id);
  }

  // Pull activities since the last sync (or 30 days back on first sync)
  const after = row.last_synced_at
    ? Math.floor(new Date(row.last_synced_at).getTime() / 1000)
    : Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  const activitiesRes = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=30`,
    { headers: { Authorization: `Bearer ${currentAccess}` } },
  );
  if (!activitiesRes.ok) {
    return json({ error: `fetch failed: ${await activitiesRes.text()}` }, 502);
  }
  const activities = (await activitiesRes.json()) as StravaActivity[];

  let inserted = 0;
  for (const activity of activities) {
    let hr_samples: Array<{ t: number; bpm: number }> | null = null;
    let motion_samples: Array<{ t: number; intensity: number }> | null = null;

    const streamsRes = await fetch(
      `https://www.strava.com/api/v3/activities/${activity.id}/streams?keys=time,heartrate,cadence&key_by_type=true`,
      { headers: { Authorization: `Bearer ${currentAccess}` } },
    );
    if (streamsRes.ok) {
      const streams = (await streamsRes.json()) as Streams;
      hr_samples = buildHRSamples(streams);
      motion_samples = buildMotionSamples(streams);
    }

    const startedAt = activity.start_date;
    const endedAt = new Date(
      new Date(activity.start_date).getTime() + activity.elapsed_time * 1000,
    ).toISOString();

    const { error: upsertErr } = await serviceClient
      .from("captured_sessions")
      .upsert(
        {
          user_id: user.id,
          provider: "strava",
          external_id: String(activity.id),
          started_at: startedAt,
          ended_at: endedAt,
          raw_payload: activity,
          hr_samples,
          motion_samples,
          aggregates: {
            activity_type: activity.type ?? activity.sport_type ?? null,
            avg_hr: activity.average_heartrate,
            max_hr: activity.max_heartrate,
            duration_s: activity.moving_time,
            distance_m: activity.distance,
            calories: activity.calories,
          },
          review_status: "pending",
        },
        { onConflict: "provider,external_id" },
      );
    if (!upsertErr) inserted++;
  }

  await serviceClient
    .from("wearable_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", row.id);

  return json({ inserted, total_seen: activities.length });
});

const buildHRSamples = (
  streams: Streams,
): Array<{ t: number; bpm: number }> | null => {
  const time = streams.time?.data;
  const hr = streams.heartrate?.data;
  if (!time || !hr || time.length !== hr.length) return null;
  return time.map((t, i) => ({ t, bpm: hr[i] }));
};

const buildMotionSamples = (
  streams: Streams,
): Array<{ t: number; intensity: number }> | null => {
  const time = streams.time?.data;
  const cadence = streams.cadence?.data;
  if (!time || !cadence || time.length !== cadence.length) return null;
  // Cadence (RPM) is a proxy for motion intensity; cap at 90 RPM = 1.0.
  return time.map((t, i) => ({ t, intensity: Math.min(1, cadence[i] / 90) }));
};
