// deno-lint-ignore-file no-explicit-any
// Edge Function: strava-oauth
// Exchanges a Strava authorization `code` for an access/refresh token pair,
// encrypts both via app-side AES-GCM, and upserts the wearable_integrations
// row for the authenticated user.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptStravaToken } from "../_shared/strava-token-crypto.ts";

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

  // `scope` is the granted-scope string Strava appends to the redirect URL
  // (the token-exchange response body does not include it) — the callback
  // page forwards it so we can record what this token can actually do.
  let payload: { code?: string; scope?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  if (!payload.code) {
    return json({ error: "missing code" }, 400);
  }
  const grantedScope =
    typeof payload.scope === "string" && payload.scope.length > 0
      ? payload.scope.slice(0, 200)
      : null;

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

  // Exchange the auth code for tokens
  const tokenRes = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      code: payload.code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return json({ error: `strava token exchange failed: ${text}` }, 400);
  }

  const tokenBody = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let accessEnc: string;
  let refreshEnc: string;
  try {
    accessEnc = await encryptStravaToken(tokenBody.access_token);
    refreshEnc = await encryptStravaToken(tokenBody.refresh_token);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return json({ error: "encryption failed", detail }, 500);
  }

  const { error: upsertError } = await serviceClient
    .from("wearable_integrations")
    .upsert(
      {
        user_id: user.id,
        provider: "strava",
        status: "active",
        access_token: accessEnc,
        refresh_token: refreshEnc,
        expires_at: new Date(tokenBody.expires_at * 1000).toISOString(),
        connected_at: new Date().toISOString(),
        scope: grantedScope,
      },
      { onConflict: "user_id,provider" },
    );

  if (upsertError) return json({ error: upsertError.message }, 500);

  // Mark the profile so the dashboard CTA goes away.
  await serviceClient
    .from("profiles")
    .update({ wearable_connected: true })
    .eq("id", user.id);

  return json({ success: true });
});
