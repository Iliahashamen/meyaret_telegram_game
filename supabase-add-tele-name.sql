-- ============================================================
-- MEYARET — Add tele_name column to users table
-- Stores the player's Telegram display name (first_name / username).
-- Safe to run multiple times (IF NOT EXISTS).
-- Paste into Supabase SQL Editor and click RUN.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS tele_name TEXT;

-- Verify
SELECT telegram_id, tele_name, nickname, shmips FROM users ORDER BY nickname;

SELECT 'tele_name column added (or already existed).' AS status;
