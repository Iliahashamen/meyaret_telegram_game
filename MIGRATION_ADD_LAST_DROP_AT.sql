-- Run this in Supabase SQL Editor if DROP DA BALL shows "needs DB update"
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_drop_at TIMESTAMPTZ;
