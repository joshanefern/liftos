-- ============================================================================
-- Smart workout review v1
--   - wearable_integrations: per-user OAuth connection state per provider
--   - captured_sessions:     one row per third-party activity (e.g. Strava)
--   - workout_logs:          tag source + back-link to a captured session
--   - profiles:              wearable opt-in flag for UX gating
--
-- NOTE on token storage: access_token / refresh_token are TEXT here. The
-- encryption mechanism (pgsodium / Vault / app-level) is still being chosen;
-- the column type does not change regardless of which we land on.
-- ============================================================================


-- ---------- 1. wearable_integrations ----------------------------------------
CREATE TABLE wearable_integrations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        TEXT         NOT NULL CHECK (provider IN ('strava')),
  status          TEXT         NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'revoked')),
  access_token    TEXT         NOT NULL,
  refresh_token   TEXT         NOT NULL,
  expires_at      TIMESTAMPTZ  NOT NULL,
  connected_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_synced_at  TIMESTAMPTZ,
  UNIQUE (user_id, provider)
);

CREATE INDEX wearable_integrations_user_id_idx
  ON wearable_integrations(user_id);

ALTER TABLE wearable_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own integrations"
  ON wearable_integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own integrations"
  ON wearable_integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own integrations"
  ON wearable_integrations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own integrations"
  ON wearable_integrations FOR DELETE USING (auth.uid() = user_id);


-- ---------- 2. captured_sessions --------------------------------------------
CREATE TABLE captured_sessions (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        TEXT         NOT NULL CHECK (provider IN ('strava')),
  external_id     TEXT         NOT NULL,
  started_at      TIMESTAMPTZ  NOT NULL,
  ended_at        TIMESTAMPTZ  NOT NULL,
  raw_payload     JSONB        NOT NULL,
  hr_samples      JSONB,
  motion_samples  JSONB,
  aggregates      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  review_status   TEXT         NOT NULL DEFAULT 'pending'
                  CHECK (review_status IN ('pending', 'reviewed', 'dismissed')),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (provider, external_id)
);

CREATE INDEX captured_sessions_user_status_idx
  ON captured_sessions(user_id, review_status);
CREATE INDEX captured_sessions_user_started_at_idx
  ON captured_sessions(user_id, started_at DESC);

ALTER TABLE captured_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own captured sessions"
  ON captured_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own captured sessions"
  ON captured_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own captured sessions"
  ON captured_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own captured sessions"
  ON captured_sessions FOR DELETE USING (auth.uid() = user_id);


-- ---------- 3. workout_logs (extend) ----------------------------------------
ALTER TABLE workout_logs
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'review')),
  ADD COLUMN captured_session_id UUID
    REFERENCES captured_sessions(id) ON DELETE SET NULL;

CREATE INDEX workout_logs_captured_session_id_idx
  ON workout_logs(captured_session_id);


-- ---------- 4. profiles (extend) --------------------------------------------
ALTER TABLE profiles
  ADD COLUMN wearable_connected BOOLEAN NOT NULL DEFAULT FALSE;
