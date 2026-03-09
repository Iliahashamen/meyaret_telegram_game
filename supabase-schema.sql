-- ============================================================
-- MEYARET - Supabase Database Schema
-- Run this in your Supabase SQL Editor to set up the database.
-- ============================================================

-- USERS TABLE
-- Stores each player's profile, tied to their Telegram ID.
CREATE TABLE IF NOT EXISTS users (
  telegram_id       BIGINT PRIMARY KEY,
  nickname          TEXT NOT NULL DEFAULT 'ACE',
  shmips            INTEGER NOT NULL DEFAULT 0,
  -- Active multiplier fields
  multiplier_value  NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  multiplier_end    TIMESTAMPTZ,
  -- Golden Plane (expires after one game)
  has_golden_plane  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Daily spin cooldown
  last_spin_at      TIMESTAMPTZ,
  -- Lifetime stats
  total_games       INTEGER NOT NULL DEFAULT 0,
  best_score        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SCORES TABLE
-- Individual game session records.
CREATE TABLE IF NOT EXISTS scores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id   BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  score         INTEGER NOT NULL DEFAULT 0,
  level         INTEGER NOT NULL DEFAULT 1,
  shmips_earned INTEGER NOT NULL DEFAULT 0,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USER_UPGRADES TABLE
-- Tracks all permanent upgrades a player owns.
CREATE TABLE IF NOT EXISTS user_upgrades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  upgrade_id  TEXT NOT NULL,   -- e.g. 'extra_life', 'laser', 'rapid_fire', 'ship_purple'
  quantity    INTEGER NOT NULL DEFAULT 1,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(telegram_id, upgrade_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_scores_telegram_id ON scores(telegram_id);
CREATE INDEX IF NOT EXISTS idx_scores_score_desc  ON scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_upgrades_telegram   ON user_upgrades(telegram_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) - Recommended for production
-- ============================================================
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_upgrades  ENABLE ROW LEVEL SECURITY;

-- Allow server-side service role full access (your backend uses service role key)
-- No client-side direct DB access since the game goes through your Express API.
-- For anon/public reads on leaderboard we create a specific policy:

CREATE POLICY "Public leaderboard read" ON scores
  FOR SELECT USING (true);

CREATE POLICY "Public user read" ON users
  FOR SELECT USING (true);

-- Service role bypasses RLS automatically. ✓

-- ============================================================
-- LEADERBOARD VIEW (Top 5 all-time best scores per user)
-- ============================================================
CREATE OR REPLACE VIEW leaderboard AS
  SELECT
    u.nickname,
    u.telegram_id,
    MAX(s.score) AS best_score,
    COUNT(s.id)  AS games_played
  FROM users u
  JOIN scores s ON s.telegram_id = u.telegram_id
  GROUP BY u.telegram_id, u.nickname
  ORDER BY best_score DESC
  LIMIT 5;

-- ============================================================
-- HELPER: auto-update updated_at on users
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
