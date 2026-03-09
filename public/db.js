// ============================================================
// MEYARET — Direct Supabase Client
// Bypasses Railway for all core game data operations.
// The anon key is intentionally embedded — it is a public
// API key. Security is enforced by Supabase RLS policies.
// ============================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPA_URL = 'https://fbcjmniqwqiurssqdnka.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiY2ptbmlxd3FpdXJzc2RxbmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI0MzksImV4cCI6MjA4ODYyODQzOX0.QDC0N8Zf1JgvmvDVa3h_CD4wPih6Ly2L4kEFK1Q48E';

export const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false },
});

// ── Get or create user ────────────────────────────────────────────────────────
export async function dbGetOrCreateUser(telegramId) {
  const id = String(telegramId);

  const { data: user, error } = await supa
    .from('users')
    .select('*')
    .eq('telegram_id', id)
    .maybeSingle();

  if (error) throw error;

  if (user) {
    const { data: upgrades } = await supa
      .from('user_upgrades')
      .select('upgrade_id, quantity')
      .eq('telegram_id', id);
    return { user, upgrades: upgrades || [], isNew: false };
  }

  // First visit — create row
  const { data: newUser, error: ce } = await supa
    .from('users')
    .insert({ telegram_id: id, nickname: 'ACE' })
    .select()
    .single();

  if (ce) throw ce;
  return { user: newUser, upgrades: [], isNew: true };
}

// ── Save score at game over ───────────────────────────────────────────────────
export async function dbSaveScore(telegramId, score, level) {
  const id = String(telegramId);
  const shmipsEarned = Math.round((score / 1000) * 100) / 100;

  const { data: user, error } = await supa
    .from('users')
    .select('shmips, best_score, total_games')
    .eq('telegram_id', id)
    .single();

  if (error || !user) throw error || new Error('User not found');

  const newShmips = Math.round((Number(user.shmips) + shmipsEarned) * 100) / 100;
  const newBest   = Math.max(Number(user.best_score || 0), score);
  const newGames  = (user.total_games || 0) + 1;

  await supa.from('users')
    .update({ shmips: newShmips, best_score: newBest, total_games: newGames })
    .eq('telegram_id', id);

  await supa.from('scores')
    .insert({ telegram_id: id, score, level, shmips_earned: shmipsEarned });

  return { totalShmips: newShmips, newBestScore: newBest, shmipsEarned };
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export async function dbGetLeaderboard() {
  const { data } = await supa
    .from('leaderboard')
    .select('nickname, best_score')
    .limit(5);
  return data || [];
}

// ── Change nickname ───────────────────────────────────────────────────────────
export async function dbChangeNickname(telegramId, newNick) {
  const id    = String(telegramId);
  const clean = newNick.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!clean) throw new Error('Invalid nickname.');

  const { data: user } = await supa
    .from('users')
    .select('shmips, nickname')
    .eq('telegram_id', id)
    .single();

  if (!user) throw new Error('User not found.');

  const isFirst   = user.nickname === 'ACE';
  if (!isFirst && Number(user.shmips) < 1000) throw new Error('Need 1,000 Shmips.');

  const newShmips = isFirst
    ? user.shmips
    : Math.round((Number(user.shmips) - 1000) * 100) / 100;

  const { data: updated, error } = await supa
    .from('users')
    .update({ nickname: clean, shmips: newShmips })
    .eq('telegram_id', id)
    .select()
    .single();

  if (error) throw error;
  return updated;
}

// ── Personal best scores ──────────────────────────────────────────────────────
export async function dbGetMyScores(telegramId) {
  const { data } = await supa
    .from('scores')
    .select('score, level, created_at')
    .eq('telegram_id', String(telegramId))
    .order('score', { ascending: false })
    .limit(5);
  return data || [];
}

// ── User upgrades (after spin/store) ─────────────────────────────────────────
export async function dbGetUserUpgrades(telegramId) {
  const { data } = await supa
    .from('user_upgrades')
    .select('upgrade_id, quantity')
    .eq('telegram_id', String(telegramId));
  return data || [];
}
