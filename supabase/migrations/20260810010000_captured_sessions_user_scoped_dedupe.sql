-- Dedupe must be per-user: HKWorkout UUIDs belong to a DEVICE's Health
-- store, not a LiftOS account. With the global (provider, external_id) key,
-- a second account signing in on the same iPhone would silently import
-- nothing for any workout the first account had already captured
-- (ignoreDuplicates no-ops). Strava has the same theoretical exposure when
-- two accounts link the same Strava athlete.
ALTER TABLE captured_sessions
  DROP CONSTRAINT IF EXISTS captured_sessions_provider_external_id_key;
ALTER TABLE captured_sessions
  ADD CONSTRAINT captured_sessions_user_provider_external_id_key
  UNIQUE (user_id, provider, external_id);
