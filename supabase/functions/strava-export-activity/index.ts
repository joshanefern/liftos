// deno-lint-ignore-file no-explicit-any
// Edge Function: strava-export-activity
// Creates a manual activity on Strava for a workout the user logged in LiftOS.
//
// The client builds the payload (name / description / start / elapsed) from
// the saved workout log — this function checks the granted scope, posts to
// Strava with a fresh token, then seeds a dismissed captured_sessions row for
// the new activity id so the import path can never bounce the user's own
// workout back at them as a "pending review" (strava-fetch-activities inserts
// with ignoreDuplicates, so the seed row wins).
//
// Typed failures the client is expected to handle:
//   missing_write_scope — token predates activity:write; reconnect required
//   not_connected       — no Strava integration row
//   reconnect_required  — refresh failed / Strava revoked; reconnect required
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getFreshStravaToken } from "../_shared/strava-token.ts";

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

// Strava caps: name is truncated by Strava itself around 100 chars; we bound
// both fields defensively so a malformed client can't ship megabytes.
const NAME_MAX = 140;
const DESCRIPTION_MAX = 5_000;
const MAX_ELAPSED_SECONDS = 24 * 60 * 60;

type UploadSet = {
  exercise_type?: unknown;
  repetitions?: unknown;
  weight?: unknown;
  duration?: unknown;
};

type UploadJson = {
  version?: unknown;
  start_time?: unknown;
  utc_offset?: unknown;
  elapsed_time?: unknown;
  creator?: unknown;
  sets?: UploadSet[];
};

type ExportPayload = {
  name?: unknown;
  description?: unknown;
  description_short?: unknown;
  external_id?: unknown;
  start_date_local?: unknown;
  /** UTC instant of the workout start — used for the dedupe seed row. */
  started_at?: unknown;
  elapsed_time?: unknown;
  /** Per-set JSON body for POST /uploads — the native workout-log path. */
  upload_json?: UploadJson | null;
};

const MAX_UPLOAD_SETS = 500;

/** Minimal structural check — Strava validates the rest. */
const uploadJsonIsUsable = (u: UploadJson | null | undefined): u is UploadJson =>
  !!u &&
  u.version === "1.0" &&
  typeof u.start_time === "string" &&
  typeof u.utc_offset === "number" &&
  typeof u.elapsed_time === "number" &&
  Array.isArray(u.sets) &&
  u.sets.length > 0 &&
  u.sets.length <= MAX_UPLOAD_SETS &&
  u.sets.every((s) => typeof s.exercise_type === "string");

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
      { error: "invalid auth", detail: userError?.message ?? "no user from jwt" },
      401,
    );
  }

  let payload: ExportPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }

  const name =
    typeof payload.name === "string" ? payload.name.trim().slice(0, NAME_MAX) : "";
  const description =
    typeof payload.description === "string"
      ? payload.description.trim().slice(0, DESCRIPTION_MAX)
      : "";
  const startDateLocal =
    typeof payload.start_date_local === "string" ? payload.start_date_local : "";
  const elapsed =
    typeof payload.elapsed_time === "number" &&
    Number.isFinite(payload.elapsed_time)
      ? Math.min(Math.max(Math.round(payload.elapsed_time), 1), MAX_ELAPSED_SECONDS)
      : 0;

  if (!name || !startDateLocal || elapsed <= 0) {
    return json(
      { error: "name, start_date_local and elapsed_time are required" },
      400,
    );
  }
  // ISO-8601 wall-clock time, e.g. "2026-08-16T14:52:54Z" — the client formats
  // the user's local time; Strava reads start_date_local as naive local time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/.test(startDateLocal)) {
    return json({ error: "start_date_local must be ISO 8601" }, 400);
  }

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = await getFreshStravaToken(
    serviceClient,
    user.id,
    STRAVA_CLIENT_ID,
    STRAVA_CLIENT_SECRET,
  );
  if (!token.ok) {
    if (token.reason === "no_integration") {
      return json({ error: "not_connected" }, 404);
    }
    if (token.reason === "refresh_failed") {
      return json({ error: "reconnect_required" }, 401);
    }
    return json({ error: "could not access tokens", detail: token.detail }, 500);
  }

  // Tokens issued before the write-back release carry read scopes only; the
  // scope column is NULL for them (or lacks activity:write for users who
  // unchecked the box on the Strava consent screen).
  if (!token.row.scope || !token.row.scope.includes("activity:write")) {
    return json({ error: "missing_write_scope" }, 403);
  }

  const descriptionShort =
    typeof payload.description_short === "string"
      ? payload.description_short.trim().slice(0, DESCRIPTION_MAX)
      : "";
  const externalId =
    typeof payload.external_id === "string" && /^liftos-[\w-]{1,80}$/.test(payload.external_id)
      ? payload.external_id
      : null;

  let activityId: number | null = null;
  let uploadPending = false;

  // ── Path 1: JSON upload — renders a native per-set workout log + muscle
  // map on Strava. Any rejection falls through to the manual create.
  if (uploadJsonIsUsable(payload.upload_json)) {
    const form = new FormData();
    form.set(
      "file",
      new Blob([JSON.stringify(payload.upload_json)], { type: "application/json" }),
      `${externalId ?? "liftos-workout"}.json`,
    );
    form.set("data_type", "json");
    form.set("sport_type", "WeightTraining");
    form.set("name", name);
    if (descriptionShort) form.set("description", descriptionShort);
    if (externalId) form.set("external_id", externalId);

    const uploadRes = await fetch("https://www.strava.com/api/v3/uploads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.accessToken}` },
      body: form,
    });

    if (uploadRes.status === 401 || uploadRes.status === 403) {
      return json(
        { error: "missing_write_scope", detail: await uploadRes.text() },
        403,
      );
    }
    if (uploadRes.status === 429) {
      return json({ error: "rate_limited" }, 429);
    }
    if (uploadRes.ok) {
      const upload = (await uploadRes.json()) as {
        id_str?: string;
        id?: number;
        activity_id?: number | null;
        error?: string | null;
      };
      const uploadId = upload.id_str ?? String(upload.id ?? "");
      activityId = upload.activity_id ?? null;
      let uploadError = upload.error ?? null;

      // Mean processing time is <2s; poll at 1s as the docs recommend.
      for (let i = 0; i < 8 && !activityId && !uploadError && uploadId; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollRes = await fetch(
          `https://www.strava.com/api/v3/uploads/${uploadId}`,
          { headers: { Authorization: `Bearer ${token.accessToken}` } },
        );
        if (!pollRes.ok) break;
        const poll = (await pollRes.json()) as {
          activity_id?: number | null;
          error?: string | null;
        };
        activityId = poll.activity_id ?? null;
        uploadError = poll.error ?? null;
      }

      if (uploadError) {
        // A retry of an already-posted workout comes back as a duplicate —
        // that IS success, and the id lets us seed the dedupe row.
        const dup = uploadError.match(/duplicate of activity (\d+)/);
        if (dup) {
          activityId = Number(dup[1]);
        }
        // Other processing errors (e.g. a rejected payload) fall through to
        // the manual create below.
      } else if (!activityId) {
        // Still processing after the polling window — the upload will land;
        // the import path skips liftos-* external_ids, so no dedupe risk.
        uploadPending = true;
      }
    }
  }

  // ── Path 2: manual create — no workout log/muscle map, so the long
  // description carries the exercise lines instead.
  if (activityId === null && !uploadPending) {
    const form = new URLSearchParams({
      name,
      sport_type: "WeightTraining",
      start_date_local: startDateLocal,
      elapsed_time: String(elapsed),
    });
    if (description) form.set("description", description);

    const createRes = await fetch("https://www.strava.com/api/v3/activities", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    if (createRes.status === 401 || createRes.status === 403) {
      // Token valid at refresh time but rejected on write — revoked or scope
      // stripped on Strava's side. A reconnect is the only fix.
      return json(
        { error: "missing_write_scope", detail: await createRes.text() },
        403,
      );
    }
    if (createRes.status === 429) {
      return json({ error: "rate_limited" }, 429);
    }
    if (createRes.status === 409) {
      // Time-window overlap with an existing activity (e.g. the same session
      // already on Strava from another source) — treat as already-posted.
      return json({ activity_id: null, already_on_strava: true });
    }
    if (!createRes.ok) {
      return json({ error: `strava create failed: ${await createRes.text()}` }, 502);
    }

    const activity = (await createRes.json()) as { id: number };
    activityId = activity.id;
  }

  if (uploadPending || activityId === null) {
    return json({ activity_id: null, pending: true });
  }

  const activity = { id: activityId };

  // Seed the import-dedupe row. ignoreDuplicates keeps an existing row (e.g.
  // a retry) intact; failure here is non-fatal — worst case the next import
  // shows a pending review the user dismisses once.
  const startedAtUtc =
    typeof payload.started_at === "string" && !Number.isNaN(Date.parse(payload.started_at))
      ? payload.started_at
      : new Date(Date.now() - elapsed * 1000).toISOString();
  const endedAtUtc = new Date(Date.parse(startedAtUtc) + elapsed * 1000).toISOString();
  const { error: seedError } = await serviceClient.from("captured_sessions").upsert(
    {
      user_id: user.id,
      provider: "strava",
      external_id: String(activity.id),
      started_at: startedAtUtc,
      ended_at: endedAtUtc,
      raw_payload: { liftos_writeback: true, name },
      aggregates: { activity_type: "WeightTraining", liftos_writeback: true },
      review_status: "dismissed",
    },
    { onConflict: "user_id,provider,external_id", ignoreDuplicates: true },
  );

  return json({
    activity_id: activity.id,
    dedupe_seeded: !seedError,
  });
});
