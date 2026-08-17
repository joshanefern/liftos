-- ============================================================================
-- Strava write-back v1
--   - wearable_integrations.scope:    granted OAuth scope string, captured from
--     the authorize redirect (e.g. 'read,activity:read_all,activity:write').
--     NULL on rows connected before this migration — the client treats NULL as
--     "write scope not granted" and offers a reconnect.
--   - wearable_integrations.autopost: the user's "post my workouts to Strava"
--     toggle. Off by default — posting to a social feed is opt-in.
-- ============================================================================

ALTER TABLE wearable_integrations
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS autopost BOOLEAN NOT NULL DEFAULT FALSE;
