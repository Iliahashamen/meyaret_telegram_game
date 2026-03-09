// ============================================================
// MEYARET — Supabase REST client using plain fetch()
// No CDN dependency — calls the REST API directly.
// ============================================================

const SUPA_URL = 'https://fbcjmniqwqiurssdqnka.supabase.co/rest/v1';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiY2ptbmlxd3FpdXJzc2RxbmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI0MzksImV4cCI6MjA4ODYyODQzOX0.QDC0jN8Zf1JgvmvDVa3h_CD4wPih6Ly2L4kEFK1Q48E';

const HDR = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
};

// Core fetch helper — throws on HTTP error with Supabase error message
async function supa(path, opts = {}) {
  const url = `${SUPA_URL}/${path}`;
  const res = await fetch(url, { ...opts, headers: { ...HDR, ...opts.headers } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = (typeof body === 'object' && (body.message || body.hint || body.error)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

// Store catalog — no server needed
export const CATALOG = [
  // Affordable per-run powerups
  { id: 'extra_life',        name: 'Extra Life',      category: 'upgrade', cost: 80,   description: '+1 life for one run',        stackable: true  },
  { id: 'extra_flare',       name: 'Extra Flare',     category: 'upgrade', cost: 60,   description: '+1 flare for one run',       stackable: true  },
  { id: 'shield',            name: 'Shield Module',   category: 'upgrade', cost: 120,  description: 'Absorb one hit in a run',    stackable: false },
  // Longer-term progression
  { id: 'rapid_fire',        name: 'Rapid Fire',      category: 'upgrade', cost: 900,  description: '2x bullet fire rate',        stackable: false },
  { id: 'laser',             name: 'Laser Cannon',    category: 'upgrade', cost: 1700, description: 'Replace bullets with laser',  stackable: false },
  // Skins
  { id: 'ship_purple',       name: 'Purple Wing',      category: 'skin',  cost: 120,  description: 'Classic purple hull',      color: '#bf5fff' },
  { id: 'ship_cyan',         name: 'Cyan Blade',       category: 'skin',  cost: 120,  description: 'Electric cyan body',       color: '#00ffff' },
  { id: 'ship_orange',       name: 'Orange Inferno',   category: 'skin',  cost: 200,  description: 'Fiery orange shell',       color: '#ff6600' },
  { id: 'ship_pink',         name: 'Neon Pink',        category: 'skin',  cost: 280,  description: 'Hot pink chrome',          color: '#ff00cc' },
  { id: 'ship_purple_gold',  name: 'Royal Hunter',     category: 'skin',  cost: 900,  description: 'Purple + gold trim',       color: '#bf5fff', accent: '#ffd700' },
  { id: 'ship_green_purple', name: 'Synthwave Reaper', category: 'skin',  cost: 950,  description: 'Green + purple gradient',  color: '#00ff41', accent: '#bf5fff' },
  { id: 'ship_gold',         name: 'Gold Commander',   category: 'skin',  cost: 2200, description: 'Full gold prestige hull',  color: '#ffd700' },
  // Planes
  { id: 'plane_stealth',     name: 'Stealth Viper',    category: 'plane', cost: 3800, description: '4 lives · 4 flares · Rapid Fire', lives: 4, flares: 4, rapidFire: true },
  { id: 'plane_titan',       name: 'Titan Fortress',   category: 'plane', cost: 7800, description: '6 lives · Shield · Laser',         lives: 6, flares: 2, shield: true, laser: true },
];

// ── Get or create user ────────────────────────────────────────────────────────
export async function dbGetOrCreateUser(telegramId) {
  const id = String(telegramId);

  // Try to find existing user
  const rows = await supa(`users?telegram_id=eq.${id}&select=*`);

  let user = rows[0] || null;
  let upgrades = [];

  if (!user) {
    // Create new user
    const created = await supa('users?select=*', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ telegram_id: id, nickname: 'ACE', shmips: 0 }),
    });
    user = created[0];
  } else {
    // Fetch upgrades
    const ups = await supa(`user_upgrades?telegram_id=eq.${id}&select=upgrade_id,quantity`);
    upgrades = ups || [];
  }

  const isNew = !user.nickname || user.nickname === 'ACE';
  return { user, upgrades, isNew };
}

// ── Check callsign availability ───────────────────────────────────────────────
export async function dbCheckCallsign(nickname) {
  const clean = nickname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
  if (!clean || clean === 'ACE') return { available: false, clean };
  const rows = await supa(`users?nickname=eq.${encodeURIComponent(clean)}&select=telegram_id`);
  return { available: rows.length === 0, clean };
}

// ── Set or change callsign ────────────────────────────────────────────────────
// Free when current nickname is 'ACE', costs 1000 shmips otherwise
export async function dbSaveCallsign(telegramId, nickname) {
  const id    = String(telegramId);
  const clean = nickname.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 12);
  if (!clean || clean.length < 2) throw new Error('MIN 2 CHARACTERS.');

  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips,nickname`);
  const user = rows[0];
  if (!user) throw new Error('NOT FOUND. OPEN VIA TELEGRAM.');

  const isFirst = !user.nickname || user.nickname === 'ACE';
  if (!isFirst && Number(user.shmips) < 1000) throw new Error('NEED 1,000 SHMIPS TO RENAME.');

  const newShmips = isFirst
    ? Number(user.shmips)
    : Math.round((Number(user.shmips) - 1000) * 100) / 100;

  const updated = await supa(`users?telegram_id=eq.${id}&select=*`, {
    method: 'PATCH',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify({ nickname: clean, shmips: newShmips }),
  });

  return updated[0];
}

// ── Buy store item ────────────────────────────────────────────────────────────
export async function dbBuyItem(telegramId, itemId) {
  const id   = String(telegramId);
  const item = CATALOG.find(c => c.id === itemId);
  if (!item) throw new Error('Item not found.');

  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips`);
  const user = rows[0];
  if (!user) throw new Error('User not found.');
  if (Number(user.shmips) < item.cost) throw new Error(`NOT ENOUGH SHMIPS. NEED ${item.cost}.`);

  if (!item.stackable) {
    const owned = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${itemId}&select=id`);
    if (owned.length > 0) throw new Error('ALREADY OWNED.');
  }

  const newBalance = Math.round((Number(user.shmips) - item.cost) * 100) / 100;

  await supa(`users?telegram_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ shmips: newBalance }),
  });

  // Check if upgrade row exists (for stackable items)
  const existing = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${itemId}&select=quantity`);
  if (existing.length > 0) {
    await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
    });
  } else {
    await supa('user_upgrades', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: id, upgrade_id: itemId, quantity: 1 }),
    });
  }

  return { newBalance, item };
}

// ── Save score ────────────────────────────────────────────────────────────────
export async function dbSaveScore(telegramId, score, level) {
  const id = String(telegramId);
  const shmipsEarned = Math.round((score / 1000) * 100) / 100;

  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips,best_score,total_games`);
  const user = rows[0];
  if (!user) throw new Error('User not found');

  const newShmips = Math.round((Number(user.shmips) + shmipsEarned) * 100) / 100;
  const newBest   = Math.max(Number(user.best_score || 0), score);
  const newGames  = (user.total_games || 0) + 1;

  await supa(`users?telegram_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ shmips: newShmips, best_score: newBest, total_games: newGames }),
  });

  await supa('scores', {
    method: 'POST',
    body: JSON.stringify({ telegram_id: id, score, level, shmips_earned: shmipsEarned }),
  });

  return { totalShmips: newShmips, newBestScore: newBest, shmipsEarned };
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export async function dbGetLeaderboard() {
  try {
    // Leaderboard view (only works if there are scores)
    const rows = await supa('leaderboard?select=nickname,best_score&limit=5');
    return rows || [];
  } catch {
    // Fallback: read directly from users table
    const rows = await supa('users?select=nickname,best_score&order=best_score.desc&limit=5');
    return (rows || []).filter(r => r.best_score > 0);
  }
}

// ── Personal scores ───────────────────────────────────────────────────────────
export async function dbGetMyScores(telegramId) {
  const rows = await supa(
    `scores?telegram_id=eq.${telegramId}&select=score,level,created_at&order=score.desc&limit=5`
  );
  return rows || [];
}

// ── User upgrades ─────────────────────────────────────────────────────────────
export async function dbGetUserUpgrades(telegramId) {
  const rows = await supa(
    `user_upgrades?telegram_id=eq.${telegramId}&select=upgrade_id,quantity`
  );
  return rows || [];
}
