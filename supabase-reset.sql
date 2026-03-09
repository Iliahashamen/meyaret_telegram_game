-- ============================================================
-- MEYARET — Full Reset + Open RLS for direct browser access
-- Paste into Supabase SQL Editor and click RUN.
-- ============================================================

-- 1. Wipe all data (fresh start)
TRUNCATE scores, user_upgrades RESTART IDENTITY CASCADE;
DELETE FROM users;

-- 2. Drop ALL old policies
DROP POLICY IF EXISTS "Public leaderboard read"             ON scores;
DROP POLICY IF EXISTS "Public user read"                    ON users;
DROP POLICY IF EXISTS "Users can view their own data"       ON users;
DROP POLICY IF EXISTS "Users can update their own data"     ON users;
DROP POLICY IF EXISTS "Service role can do everything"      ON users;
DROP POLICY IF EXISTS "anon_all_users"                      ON users;
DROP POLICY IF EXISTS "anon_all_scores"                     ON scores;
DROP POLICY IF EXISTS "anon_all_upgrades"                   ON user_upgrades;

-- 3. Open policies — anon key (browser) can read/write everything
CREATE POLICY "anon_all_users"    ON users         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_scores"   ON scores        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_upgrades" ON user_upgrades FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Grant full access to anon role
GRANT ALL ON users, scores, user_upgrades TO anon, authenticated;
GRANT SELECT ON leaderboard TO anon, authenticated;

-- 5. Allow NULL nickname (means "not set yet" — shows onboarding)
ALTER TABLE users ALTER COLUMN nickname DROP DEFAULT;
ALTER TABLE users ALTER COLUMN nickname DROP NOT NULL;

-- 6. Unique callsigns — NULL is exempt (multiple "not set yet" users are fine)
DROP INDEX IF EXISTS users_nickname_unique_idx;
CREATE UNIQUE INDEX users_nickname_unique_idx ON users(nickname)
  WHERE nickname IS NOT NULL;

-- 7. Fix shmips_earned to support decimals
ALTER TABLE scores
  ALTER COLUMN shmips_earned TYPE NUMERIC(10,2)
  USING shmips_earned::NUMERIC(10,2);

-- Done!
SELECT 'Reset complete. All users cleared. Policies open. Unique callsigns enabled.' AS status;
