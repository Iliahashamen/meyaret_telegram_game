-- ============================================================
-- MEYARET — Full User Wipe
-- Deletes ALL users, scores, upgrades.
-- Players must re-enter callsign and start from scratch.
-- Paste into Supabase SQL Editor and click RUN.
-- ============================================================

-- Temporarily disable RLS so the delete goes through unconditionally
ALTER TABLE user_upgrades DISABLE ROW LEVEL SECURITY;
ALTER TABLE scores        DISABLE ROW LEVEL SECURITY;
ALTER TABLE users         DISABLE ROW LEVEL SECURITY;

-- Wipe everything (FK cascade handles child tables automatically)
DELETE FROM user_upgrades;
DELETE FROM scores;
DELETE FROM users;

-- Re-enable RLS
ALTER TABLE user_upgrades ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;

-- Verify
SELECT COUNT(*) AS users_remaining    FROM users;
SELECT COUNT(*) AS scores_remaining   FROM scores;
SELECT COUNT(*) AS upgrades_remaining FROM user_upgrades;

SELECT 'Full wipe complete. All users, scores, and upgrades deleted.' AS status;
