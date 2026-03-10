-- ============================================================
-- MEYARET — Soft Reset
-- Clears shmips, upgrades, spin cooldowns, multipliers.
-- KEEPS: best_score, scores table (history), nicknames.
-- Paste into Supabase SQL Editor and click RUN.
-- ============================================================

-- 1. Reset shmips to 0, clear multiplier, clear spin cooldown
UPDATE users SET
  shmips            = 0,
  multiplier_value  = 1.0,
  multiplier_end    = NULL,
  has_golden_plane  = FALSE,
  last_spin_at      = NULL;

-- 2. Wipe all owned upgrades (store items, skins, planes, boosts)
DELETE FROM user_upgrades;

-- 3. Verify
SELECT
  telegram_id,
  nickname,
  shmips,
  best_score,
  multiplier_value,
  has_golden_plane,
  last_spin_at
FROM users
ORDER BY best_score DESC;

SELECT 'Soft reset complete. Shmips zeroed, upgrades cleared, scores preserved.' AS status;
