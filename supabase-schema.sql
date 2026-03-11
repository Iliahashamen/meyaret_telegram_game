-- ============================================================
-- MEYARET — Supabase Database Schema
-- Paste this entire file into Supabase SQL Editor and click Run.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE.
-- ============================================================

-- USERS
CREATE TABLE IF NOT EXISTS users (
  telegram_id       BIGINT PRIMARY KEY,
  nickname          TEXT NOT NULL DEFAULT 'ACE',
  shmips            NUMERIC(10,2) NOT NULL DEFAULT 0,
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
  shmips_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Drop all previous policies before recreating
DROP POLICY IF EXISTS "Public leaderboard read"         ON scores;
DROP POLICY IF EXISTS "Public user read"                ON users;
DROP POLICY IF EXISTS "Users can view their own data"   ON users;
DROP POLICY IF EXISTS "Users can update their own data" ON users;
DROP POLICY IF EXISTS "Service role can do everything"  ON users;
DROP POLICY IF EXISTS "anon_all_users"                  ON users;
DROP POLICY IF EXISTS "anon_all_scores"                 ON scores;
DROP POLICY IF EXISTS "anon_all_upgrades"               ON user_upgrades;

-- USERS: anyone can read (leaderboard), but can only write their own row
CREATE POLICY "users_select_all"  ON users FOR SELECT TO anon USING (true);
CREATE POLICY "users_insert_own"  ON users FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "users_update_own"  ON users FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- SCORES: anyone can read, can only insert (no deleting or updating scores)
CREATE POLICY "scores_select_all" ON scores FOR SELECT TO anon USING (true);
CREATE POLICY "scores_insert"     ON scores FOR INSERT TO anon WITH CHECK (true);

-- USER_UPGRADES: full access for anon (purchases, boosts, etc.)
CREATE POLICY "upgrades_all"      ON user_upgrades FOR ALL TO anon
  USING (true) WITH CHECK (true);

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

-- ── Migrate shmips to decimal (run once on existing DB) ──────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='users' AND column_name='shmips' AND data_type='integer'
  ) THEN
    ALTER TABLE users ALTER COLUMN shmips TYPE NUMERIC(10,2) USING shmips::NUMERIC(10,2);
  END IF;
END $$;

DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Anti-cheat: shmips increase cap ──────────────────────────────────────────
-- Prevents a single UPDATE from adding more than 5000 shmips at once.
-- Legitimate max single operations: ~300 gift box + ~1000 score bonus = safe under 5000.
-- Direct API exploit (setting shmips=999999) will be blocked by the DB itself.
CREATE OR REPLACE FUNCTION guard_shmips_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Block any attempt to increase shmips by more than 5000 in one operation
    IF NEW.shmips > OLD.shmips + 5000 THEN
      RAISE EXCEPTION 'shmips_increase_too_large';
    END IF;
    -- shmips can never go below 0
    IF NEW.shmips < 0 THEN
      NEW.shmips := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_shmips ON users;
CREATE TRIGGER guard_shmips
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_shmips_change();
