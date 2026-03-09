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
// +10 colors, +6 upgrades, +2 planes
export const CATALOG = [
  // Affordable per-run powerups
  { id: 'extra_life',        name: 'Extra Life',      category: 'upgrade', cost: 10,   description: '+1 life for one run',        stackable: true  },
  { id: 'extra_flare',       name: 'Extra Flare',     category: 'upgrade', cost: 5,    description: '+1 flare for one run',       stackable: true  },
  { id: 'shield',            name: 'Shield Module',   category: 'upgrade', cost: 10,   description: 'Absorb one hit in a run',    stackable: false },
  // Longer-term progression
  { id: 'rapid_fire',        name: 'Rapid Fire',      category: 'upgrade', cost: 900,  description: '2x bullet fire rate',        stackable: false },
  { id: 'laser',             name: 'Laser Cannon',    category: 'upgrade', cost: 1700, description: 'Replace bullets with laser',  stackable: false },
  { id: 'power_boost',       name: 'Power Boost',     category: 'upgrade', cost: 1100, description: '+15% bullet damage',         stackable: false },
  { id: 'magnet_field',      name: 'Magnet Field',    category: 'upgrade', cost: 650,  description: 'Slightly pull collectibles', stackable: false },
  { id: 'double_shmips',    name: 'Double Shmips',   category: 'upgrade', cost: 2500, description: '2x $$ per 1000 pts',         stackable: false },
  { id: 'extra_bullet',     name: 'Extra Bullet',    category: 'upgrade', cost: 750,  description: '+1 max bullets',             stackable: false },
  { id: 'quick_reload',     name: 'Quick Reload',    category: 'upgrade', cost: 850,  description: 'Faster cooldown',           stackable: false },
  { id: 'armor_plating',    name: 'Armor Plating',  category: 'upgrade', cost: 1400, description: '1 extra hit absorption',     stackable: false },
  // Skins (17 total — 10 more)
  { id: 'ship_purple',       name: 'Purple Wing',      category: 'skin',  cost: 120,  description: 'Classic purple hull',      color: '#bf5fff' },
  { id: 'ship_cyan',         name: 'Cyan Blade',       category: 'skin',  cost: 120,  description: 'Electric cyan body',       color: '#00ffff' },
  { id: 'ship_orange',       name: 'Orange Inferno',   category: 'skin',  cost: 200,  description: 'Fiery orange shell',       color: '#ff6600' },
  { id: 'ship_pink',         name: 'Neon Pink',        category: 'skin',  cost: 280,  description: 'Hot pink chrome',          color: '#ff00cc' },
  { id: 'ship_red',          name: 'Crimson Rush',     category: 'skin',  cost: 180,  description: 'Deep red hull',            color: '#ff2244' },
  { id: 'ship_blue',         name: 'Azure Strike',     category: 'skin',  cost: 180,  description: 'Cool blue body',            color: '#3388ff' },
  { id: 'ship_green',        name: 'Emerald Edge',    category: 'skin',  cost: 220,  description: 'Green neon trim',           color: '#00ff88' },
  { id: 'ship_yellow',       name: 'Solar Flare',     category: 'skin',  cost: 240,  description: 'Bright yellow',             color: '#ffdd00' },
  { id: 'ship_white',        name: 'Arctic Ghost',    category: 'skin',  cost: 320,  description: 'White chrome',              color: '#eeeeff' },
  { id: 'ship_teal',         name: 'Teal Storm',      category: 'skin',  cost: 190,  description: 'Teal gradient',             color: '#00ddcc' },
  { id: 'ship_violet',       name: 'Violet Pulse',    category: 'skin',  cost: 210,  description: 'Violet glow',                color: '#9944ff' },
  { id: 'ship_coral',        name: 'Coral Blaze',    category: 'skin',  cost: 230,  description: 'Coral orange',               color: '#ff6644' },
  { id: 'ship_lime',         name: 'Lime Zap',        category: 'skin',  cost: 200,  description: 'Electric lime',             color: '#aaff00' },
  { id: 'ship_purple_gold',  name: 'Royal Hunter',     category: 'skin',  cost: 900,  description: 'Purple + gold trim',       color: '#bf5fff', accent: '#ffd700' },
  { id: 'ship_green_purple', name: 'Synthwave Reaper', category: 'skin',  cost: 950,  description: 'Green + purple gradient',  color: '#00ff41', accent: '#bf5fff' },
  { id: 'ship_gold',         name: 'Gold Commander',   category: 'skin',  cost: 2200, description: 'Full gold prestige hull',  color: '#ffd700' },
  { id: 'ship_rainbow',      name: 'Rainbow Ace',      category: 'skin',  cost: 1500, description: 'Prismatic hull',          color: '#ff0077', accent: '#00ffcc' },
  // Planes (4 total — +2)
  { id: 'plane_stealth',     name: 'Stealth Viper',    category: 'plane', cost: 3800, description: '4 lives · 4 flares · Rapid Fire', lives: 4, flares: 4, rapidFire: true },
  { id: 'plane_titan',       name: 'Titan Fortress',   category: 'plane', cost: 7800, description: '6 lives · Shield · Laser',         lives: 6, flares: 2, shield: true, laser: true },
  { id: 'plane_phantom',     name: 'Phantom X',        category: 'plane', cost: 5200, description: '5 lives · 3 flares · Laser',      lives: 5, flares: 3, laser: true },
  { id: 'plane_scout',       name: 'Scout Hawk',      category: 'plane', cost: 2900, description: '4 lives · 2 flares · Rapid Fire', lives: 4, flares: 2, rapidFire: true },
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

// ── Add bonus shmips (e.g. from coin pickups) ───────────────────────────────────
export async function dbAddBonusShmips(telegramId, bonus) {
  const id = String(telegramId);
  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips`);
  const user = rows[0];
  if (!user) return null;
  const newShmips = Math.round((Number(user.shmips) + bonus) * 100) / 100;
  await supa(`users?telegram_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ shmips: newShmips }),
  });
  return { shmips: newShmips };
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

// ── Daily Spin (direct Supabase — no Railway needed) ───────────────────────────
// Wheel segments and rewards MUST match 1:1 — exported for drawSpinWheel
export const SPIN_WHEEL_SEGMENTS = [
  { label: '5 $$',   color: '#00ffcc', rewardIndex: 0 },
  { label: '10 $$',  color: '#00ddaa', rewardIndex: 1 },
  { label: '15 $$',  color: '#00ffcc', rewardIndex: 2 },
  { label: '20 $$',  color: '#ffcc00', rewardIndex: 3 },
  { label: '30 $$',  color: '#ffd700', rewardIndex: 4 },
  { label: '50 $$',  color: '#ffaa00', rewardIndex: 5 },
  { label: '2X 1H',  color: '#ff0077', rewardIndex: 6 },
  { label: '3X 1H',  color: '#ff3399', rewardIndex: 7 },
  { label: 'GOLD',   color: '#ffd700', rewardIndex: 8 },
  { label: 'UPGRD',  color: '#8800ff', rewardIndex: 9 },
];
const SPIN_REWARDS = [
  { id: 'cash_5',   weight: 35, label: '5 $$',   type: 'shmips', value: 5 },
  { id: 'cash_10',  weight: 15, label: '10 $$',  type: 'shmips', value: 10 },
  { id: 'cash_15',  weight: 12, label: '15 $$',  type: 'shmips', value: 15 },
  { id: 'cash_20',  weight: 8,  label: '20 $$',  type: 'shmips', value: 20 },
  { id: 'cash_30',  weight: 4,  label: '30 $$',  type: 'shmips', value: 30 },
  { id: 'cash_50',  weight: 1,  label: '50 $$',  type: 'shmips', value: 50 },
  { id: 'multi_2x', weight: 12, label: '2X 1H',  type: 'multi', multi: 2, duration: 60 },
  { id: 'multi_3x', weight: 4,  label: '3X 1H',  type: 'multi', multi: 3, duration: 60 },
  { id: 'golden',   weight: 2,  label: 'GOLD',   type: 'golden_plane' },
  { id: 'upgrade',  weight: 7,  label: 'UPGRD',  type: 'upgrade' },
];
const SPIN_UPGRADE_POOL = ['extra_life', 'extra_flare', 'rapid_fire', 'laser', 'ship_purple', 'ship_cyan', 'ship_pink'];
const COOLDOWN_MS = 6 * 60 * 60 * 1000;  // 6 hours

function pickSpinReward() {
  const roll = Math.random() * 100;
  let c = 0;
  for (const r of SPIN_REWARDS) {
    c += r.weight;
    if (roll < c) return r;
  }
  return SPIN_REWARDS[0];
}

export async function dbSpinStatus(telegramId) {
  const rows = await supa(`users?telegram_id=eq.${telegramId}&select=last_spin_at`);
  const user = rows[0];
  if (!user?.last_spin_at) return { available: true, remainingMs: 0 };
  const next = new Date(new Date(user.last_spin_at).getTime() + COOLDOWN_MS);
  const now = Date.now();
  return { available: now >= next, remainingMs: Math.max(0, next - now) };
}

export async function dbDoSpin(telegramId) {
  const id = String(telegramId);
  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips,last_spin_at,multiplier_value,multiplier_end`);
  const user = rows[0];
  if (!user) throw new Error('User not found.');

  const now = new Date();
  if (user.last_spin_at) {
    const next = new Date(new Date(user.last_spin_at).getTime() + COOLDOWN_MS);
    if (now < next) throw new Error('Spin not available yet.');
  }

  const reward = pickSpinReward();
  const updates = { last_spin_at: now.toISOString() };
  let grantedUpgrade = null;

  if (reward.type === 'shmips') {
    updates.shmips = Math.round((Number(user.shmips) + reward.value) * 100) / 100;
  } else if (reward.type === 'multi') {
    updates.multiplier_value = reward.multi;
    updates.multiplier_end = new Date(now.getTime() + reward.duration * 60 * 1000).toISOString();
  } else if (reward.type === 'golden_plane') {
    updates.has_golden_plane = true;
  } else if (reward.type === 'upgrade') {
    grantedUpgrade = SPIN_UPGRADE_POOL[Math.floor(Math.random() * SPIN_UPGRADE_POOL.length)];
    const existing = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${grantedUpgrade}&select=quantity`);
    if (existing.length > 0) {
      await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${grantedUpgrade}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
      });
    } else {
      await supa('user_upgrades', {
        method: 'POST',
        body: JSON.stringify({ telegram_id: id, upgrade_id: grantedUpgrade, quantity: 1 }),
      });
    }
  }

  await supa(`users?telegram_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  const updated = await supa(`users?telegram_id=eq.${id}&select=*`);
  return {
    reward: { id: reward.id, label: reward.label, type: reward.type, upgrade: grantedUpgrade, segmentIndex: SPIN_WHEEL_SEGMENTS.findIndex(s => s.label === reward.label) },
    user: updated[0],
  };
}
