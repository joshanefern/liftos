// deno-lint-ignore-file no-explicit-any
// ============================================================================
// Shared Strava integration-row loading + transparent token refresh.
// Used by strava-fetch-activities and strava-export-activity.
//
// The caller hands us a service-role client and a user id; we return a live
// access token (refreshing + re-encrypting if it expires within 60s) plus the
// integration row. Failures are typed so each function can map them onto its
// own HTTP responses.
// ============================================================================
import {
  decryptStravaToken,
  encryptStravaToken,
} from "./strava-token-crypto.ts";

export type StravaIntegrationRow = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  last_synced_at: string | null;
  scope: string | null;
};

export type FreshTokenResult =
  | { ok: true; accessToken: string; row: StravaIntegrationRow }
  | {
      ok: false;
      reason: "no_integration" | "decrypt_failed" | "refresh_failed";
      detail?: string;
    };

/** Load the user's Strava integration and return a non-expired access token,
    refreshing (and persisting re-encrypted tokens) when needed. On refresh
    failure the row is marked expired so the client can surface a reconnect. */
export const getFreshStravaToken = async (
  serviceClient: any,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<FreshTokenResult> => {
  const { data: integration } = await serviceClient
    .from("wearable_integrations")
    .select(
      "id, user_id, access_token, refresh_token, expires_at, last_synced_at, scope",
    )
    .eq("user_id", userId)
    .eq("provider", "strava")
    .maybeSingle();

  if (!integration) return { ok: false, reason: "no_integration" };
  const row = integration as StravaIntegrationRow;

  let currentAccess: string;
  let currentRefresh: string;
  try {
    currentAccess = await decryptStravaToken(row.access_token);
    currentRefresh = await decryptStravaToken(row.refresh_token);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "decrypt_failed", detail };
  }

  const expiresAt = new Date(row.expires_at).getTime();
  if (expiresAt >= Date.now() + 60_000) {
    return { ok: true, accessToken: currentAccess, row };
  }

  const refreshRes = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentRefresh,
      grant_type: "refresh_token",
    }),
  });
  if (!refreshRes.ok) {
    await serviceClient
      .from("wearable_integrations")
      .update({ status: "expired" })
      .eq("id", row.id);
    return { ok: false, reason: "refresh_failed" };
  }

  const refreshed = (await refreshRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };

  let newAccessEnc: string;
  let newRefreshEnc: string;
  try {
    newAccessEnc = await encryptStravaToken(refreshed.access_token);
    newRefreshEnc = await encryptStravaToken(refreshed.refresh_token);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "decrypt_failed", detail };
  }

  await serviceClient
    .from("wearable_integrations")
    .update({
      access_token: newAccessEnc,
      refresh_token: newRefreshEnc,
      expires_at: new Date(refreshed.expires_at * 1000).toISOString(),
      status: "active",
    })
    .eq("id", row.id);

  return { ok: true, accessToken: refreshed.access_token, row };
};
