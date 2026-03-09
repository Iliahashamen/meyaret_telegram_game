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

// ── Store catalog (single source of truth, mirrored from server/routes/store.js)
export const CATALOG = [
  // Gameplay Upgrades
  { id: 'extra_life',   name: 'Extra Life',      category: 'upgrade', cost: 500,  description: '+1 life per game',          stackable: true  },
  { id: 'extra_flare',  name: 'Extra Flare',     category: 'upgrade', cost: 300,  description: '+1 flare per game',         stackable: true  },
  { id: 'rapid_fire',   name: 'Rapid Fire',      category: 'upgrade', cost: 800,  description: '2x bullet fire rate',       stackable: false },
  { id: 'laser',        name: 'Laser Cannon',    category: 'upgrade', cost: 1500, description: 'Replaces bullets w/ laser', stackable: false },
  { id: 'shield',       name: 'Shield Module',   category: 'upgrade', cost: 1000, description: 'Absorbs one hit per game',  stackable: false },
  // Ship Skins
  { id: 'ship_purple',       name: 'Purple Wing',      category: 'skin', cost: 5,   description: 'Classic purple hull',     color: '#bf5fff' },
  { id: 'ship_cyan',         name: 'Cyan Blade',       category: 'skin', cost: 5,   description: 'Electric cyan body',      color: '#00ffff' },
  { id: 'ship_orange',       name: 'Orange Inferno',   category: 'skin', cost: 10,  description: 'Fiery orange shell',      color: '#ff6600' },
  { id: 'ship_pink',         name: 'Neon Pink',        category: 'skin', cost: 15,  description: 'Hot pink chrome',         color: '#ff00cc' },
  { id: 'ship_purple_gold',  name: 'Royal Hunter',     category: 'skin', cost: 50,  description: 'Purple + gold trim',      color: '#bf5fff', accent: '#ffd700' },
  { id: 'ship_green_purple', name: 'Synthwave Reaper', category: 'skin', cost: 50,  description: 'Green + purple gradient', color: '#00ff41', accent: '#bf5fff' },
  { id: 'ship_gold',         name: 'Gold Commander',   category: 'skin', cost: 200, description: 'Full gold prestige hull', color: '#ffd700' },
  // Planes
  { id: 'plane_stealth', name: 'Stealth Viper',  category: 'plane', cost: 2000, description: '4 lives · 4 flares · Rapid Fire', lives: 4, flares: 4, rapidFire: true },
  { id: 'plane_titan',   name: 'Titan Fortress', category: 'plane', cost: 5000, description: '6 lives · Shield · Laser',         lives: 6, flares: 2, shield: true, laser: true },
];

// ── Get or create user ────────────────────────────────────────────────────────
// nickname: null = new user (will see onboarding)
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
    // isNew = true when nickname is null (not set yet)
    return { user, upgrades: upgrades || [], isNew: user.nickname === null };
  }

  // First ever visit — create row with null nickname
  const { data: newUser, error: ce } = await supa
    .from('users')
    .insert({ telegram_id: id, nickname: null, shmips: 0 })
    .select()
    .single();

  if (ce) throw ce;
  return { user: newUser, upgrades: [], isNew: true };
}

// ── Check if callsign is available ───────────────────────────────────────────
export async function dbCheckCallsign(nickname) {
  const clean = nickname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const { data } = await supa
    .from('users')
    .select('telegram_id')
    .eq('nickname', clean)
    .maybeSingle();
  return { available: !data, clean };
}

// ── Set callsign for the first time (free) ────────────────────────────────────
export async function dbSetCallsign(telegramId, nickname) {
  const id    = String(telegramId);
  const clean = nickname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!clean || clean.length < 2) throw new Error('MIN 2 CHARACTERS.');

  const { data: updated, error } = await supa
    .from('users')
    .update({ nickname: clean })
    .eq('telegram_id', id)
    .is('nickname', null)   // only allow if nickname is still null
    .select()
    .single();

  if (error) {
    // Unique constraint violation
    if (error.code === '23505') throw new Error('CALLSIGN TAKEN. CHOOSE ANOTHER.');
    throw error;
  }
  if (!updated) throw new Error('CALLSIGN ALREADY SET OR NOT FOUND.');
  return updated;
}

// ── Change callsign (costs 1,000 shmips) ─────────────────────────────────────
export async function dbChangeCallsign(telegramId, newNick) {
  const id    = String(telegramId);
  const clean = newNick.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!clean || clean.length < 2) throw new Error('MIN 2 CHARACTERS.');

  const { data: user } = await supa
    .from('users')
    .select('shmips, nickname')
    .eq('telegram_id', id)
    .single();

  if (!user) throw new Error('User not found.');
  if (Number(user.shmips) < 1000) throw new Error('NEED 1,000 SHMIPS.');

  const newShmips = Math.round((Number(user.shmips) - 1000) * 100) / 100;

  const { data: updated, error } = await supa
    .from('users')
    .update({ nickname: clean, shmips: newShmips })
    .eq('telegram_id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('CALLSIGN TAKEN. CHOOSE ANOTHER.');
    throw error;
  }
  return updated;
}

// ── Buy store item directly via Supabase ─────────────────────────────────────
export async function dbBuyItem(telegramId, itemId) {
  const id   = String(telegramId);
  const item = CATALOG.find(c => c.id === itemId);
  if (!item) throw new Error('Item not found.');

  // Fetch current balance
  const { data: user, error: ue } = await supa
    .from('users')
    .select('shmips')
    .eq('telegram_id', id)
    .single();
  if (ue || !user) throw new Error('User not found.');

  if (Number(user.shmips) < item.cost) {
    throw new Error(`NOT ENOUGH SHMIPS. NEED ${item.cost}.`);
  }

  // Check already owned (for non-stackable)
  if (!item.stackable) {
    const { data: existing } = await supa
      .from('user_upgrades')
      .select('id')
      .eq('telegram_id', id)
      .eq('upgrade_id', itemId)
      .maybeSingle();
    if (existing) throw new Error('ALREADY OWNED.');
  }

  const newBalance = Math.round((Number(user.shmips) - item.cost) * 100) / 100;

  // Deduct shmips
  const { error: de } = await supa
    .from('users')
    .update({ shmips: newBalance })
    .eq('telegram_id', id);
  if (de) throw de;

  // Grant item
  const { data: owned } = await supa
    .from('user_upgrades')
    .select('quantity')
    .eq('telegram_id', id)
    .eq('upgrade_id', itemId)
    .maybeSingle();

  if (owned) {
    await supa
      .from('user_upgrades')
      .update({ quantity: owned.quantity + 1 })
      .eq('telegram_id', id)
      .eq('upgrade_id', itemId);
  } else {
    await supa.from('user_upgrades').insert({ telegram_id: id, upgrade_id: itemId, quantity: 1 });
  }

  return { newBalance, item };
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

// ── User upgrades ─────────────────────────────────────────────────────────────
export async function dbGetUserUpgrades(telegramId) {
  const { data } = await supa
    .from('user_upgrades')
    .select('upgrade_id, quantity')
    .eq('telegram_id', String(telegramId));
  return data || [];
}
