-- HealthKit capture v1: the iOS app reads finished workouts from HealthKit
-- and inserts them as captured_sessions itself (RLS already permits a user
-- inserting their own rows — no edge function or tokens involved, so
-- wearable_integrations is untouched).

-- Admit 'healthkit' as a capture provider. The CHECK was created inline, so
-- it carries the default auto-generated name.
ALTER TABLE captured_sessions
  DROP CONSTRAINT IF EXISTS captured_sessions_provider_check;
ALTER TABLE captured_sessions
  ADD CONSTRAINT captured_sessions_provider_check
  CHECK (provider IN ('strava', 'healthkit'));

-- Separate flag from wearable_connected (which the Strava OAuth flow owns):
-- HealthKit has no server-side connect step, so the client sets this after a
-- successful authorization prompt.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS healthkit_connected BOOLEAN NOT NULL DEFAULT FALSE;
