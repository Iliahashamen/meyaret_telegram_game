-- ============================================================
-- MEYARET — Full User Wipe
-- Deletes ALL users, scores, upgrades.
-- Players must re-enter callsign and start from scratch.
-- Paste into Supabase SQL Editor and click RUN.
-- ============================================================

-- Wipe all game data (cascades from users)
TRUNCATE user_upgrades RESTART IDENTITY;
TRUNCATE scores RESTART IDENTITY;
DELETE FROM users;

-- Verify
SELECT COUNT(*) AS users_remaining  FROM users;
SELECT COUNT(*) AS scores_remaining FROM scores;
SELECT COUNT(*) AS upgrades_remaining FROM user_upgrades;

SELECT 'Full wipe complete. All users, scores, and upgrades deleted.' AS status;
