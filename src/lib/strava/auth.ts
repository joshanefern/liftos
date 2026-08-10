const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as
  | string
  | undefined;

export const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";

export const stravaIsConfigured = (): boolean =>
  typeof STRAVA_CLIENT_ID === "string" && STRAVA_CLIENT_ID.length > 0;

export const getStravaRedirectUri = (): string =>
  `${window.location.origin}/auth/strava/callback`;

export const buildStravaAuthorizeUrl = (state?: string): string => {
  if (!STRAVA_CLIENT_ID) {
    throw new Error("VITE_STRAVA_CLIENT_ID is not configured");
  }
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: getStravaRedirectUri(),
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });
  if (state) params.set("state", state);
  return `${STRAVA_AUTHORIZE_URL}?${params.toString()}`;
};
