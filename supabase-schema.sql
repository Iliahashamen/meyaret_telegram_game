-- ============================================================
-- MEYARET — Supabase Database Schema
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
  telegram_id       BIGINT PRIMARY KEY,
  nickname          TEXT NOT NULL DEFAULT 'ACE',
  shmips            INTEGER NOT NULL DEFAULT 0,
  multiplier_value  NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  multiplier_end    TIMESTAMPTZ,
  has_golden_plane  BOOLEAN NOT NULL DEFAULT FALSE,
  last_spin_at      TIMESTAMPTZ,
  total_games       INTEGER NOT NULL DEFAULT 0,
  best_score        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SCORES
CREATE TABLE IF NOT EXISTS scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  score         INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  shmips_earned INTEGER NOT NULL DEFAULT 0,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USER_UPGRADES
CREATE TABLE IF NOT EXISTS user_upgrades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  upgrade_id  TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(telegram_id, upgrade_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_scores_telegram_id ON scores(telegram_id);
CREATE INDEX IF NOT EXISTS idx_scores_score_desc  ON scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_upgrades_telegram  ON user_upgrades(telegram_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upgrades ENABLE ROW LEVEL SECURITY;

-- Public read for leaderboard queries (service_role bypasses RLS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scores' AND policyname = 'Public leaderboard read'
  ) THEN
    CREATE POLICY "Public leaderboard read" ON scores FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Public user read'
  ) THEN
    CREATE POLICY "Public user read" ON users FOR SELECT USING (true);
  END IF;
END $$;

-- ── Leaderboard view (SECURITY INVOKER — no warnings) ────────────────────────
DROP VIEW IF EXISTS leaderboard;

CREATE VIEW leaderboard
  WITH (security_invoker = true)
AS
  SELECT
    u.nickname,
    u.telegram_id,
    MAX(s.score)::INTEGER AS best_score,
    COUNT(s.id)::INTEGER  AS games_played
  FROM users u
  JOIN scores s ON s.telegram_id = u.telegram_id
  GROUP BY u.telegram_id, u.nickname
  ORDER BY best_score DESC
  LIMIT 5;

-- Allow anon + authenticated roles to SELECT leaderboard
GRANT SELECT ON leaderboard TO anon, authenticated;
GRANT SELECT ON users, scores, user_upgrades TO anon, authenticated;

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
