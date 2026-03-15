// ============================================================
// MEYARET — Supabase REST client using plain fetch()
// No CDN dependency — calls the REST API directly.
// ============================================================

// ── Supabase connection ───────────────────────────────────────────────────────
// SUPA_KEY is the public "anon" role key — designed by Supabase to be in browser
// code and restricted by Row-Level Security + DB-level triggers on the server.
// The service_role key is NEVER placed here; it lives only in Railway env vars.
const SUPA_URL = 'https://fbcjmniqwqiurssdqnka.supabase.co/rest/v1';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiY2ptbmlxd3FpdXJzc2RxbmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI0MzksImV4cCI6MjA4ODYyODQzOX0.QDC0jN8Zf1JgvmvDVa3h_CD4wPih6Ly2L4kEFK1Q48E';

// Core fetch helper — throws on HTTP error with Supabase error message
async function supa(path, opts = {}) {
  const HDR = {
    'apikey':        SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type':  'application/json',
  };
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

// ── Store Catalog ─────────────────────────────────────────────────────────────
// 4 boosts · 14 upgrades · 17 skins · 4 planes (starter is free/default)
export const CATALOG = [
  // ── Boosts (per-run) ─────────────────────────────────────────────────
  { id: 'extra_life',   name: 'Extra Life',   category: 'boost', cost: 10,  description: '+1 life for your next run',    stackable: true },
  { id: 'extra_flare',  name: 'Extra Flare',  category: 'boost', cost: 5,   description: '+1 flare for your next run',   stackable: true },
  { id: 'extra_shield', name: 'Run Shield',   category: 'boost', cost: 10,  description: '1 shield charge for your next run', stackable: true },
  { id: 'extra_rocket', name: 'Run Rocket',   category: 'boost', cost: 15,  description: '+1 rocket for your next run',  stackable: true },
  { id: 'score_x2',     name: 'SCORE x2',     category: 'upgrade', cost: 1500, description: 'All score doubled every run (stacks with x3 for x6)' },
  { id: 'score_x3',     name: 'SCORE x3',     category: 'upgrade', cost: 4000, description: 'All score tripled every run (stacks with x2 for x6)' },

  // ── Upgrades (permanent — always active once owned) ───────────────────────
  { id: 'magen',          name: 'MAGEN',          category: 'upgrade', cost: 640,  description: 'Always start every run with a shield charge' },
  { id: 'pew_pew_15',     name: 'PEW PEW 1.5',    category: 'upgrade', cost: 480,  description: 'Fire rate × 1.5' },
  { id: 'pew_pew_3',      name: 'PEW PEW 3',      category: 'upgrade', cost: 1200, description: 'Fire rate × 3 (stacks with 1.5 for ×4.5 — does not override)' },
  { id: 'jew_method',     name: 'JEW METHOD',      category: 'upgrade', cost: 720,  description: '$ and ? fly toward you (magnet)' },
  { id: 'kurwa_raketa',   name: 'KURWA RAKETA',    category: 'upgrade', cost: 960,  description: '+2 rockets every run' },
  { id: 'ace_upgrade',    name: 'ACE',             category: 'upgrade', cost: 1440, description: '+1 life each time you destroy a jet' },
  { id: 'zep_zep_zep',    name: 'ZEP ZEP ZEP',    category: 'upgrade', cost: 1120, description: '+1 rocket each time you kill an alien' },
  { id: 'shplit',         name: 'SHPLIT',          category: 'upgrade', cost: 800,  description: 'Shoot 2 parallel lines from both sides' },
  { id: 'tripple_threat', name: 'TRIPPLE THREAT',  category: 'upgrade', cost: 1280, description: 'Shoot in 3 spread directions' },
  { id: 'lazer_pew',      name: 'LAZER PEW',       category: 'upgrade', cost: 1600, description: 'Replace bullets with laser beams' },
  { id: 'smart_rocket',   name: 'SMART ROCKET',    category: 'upgrade', cost: 1760, description: 'Blue rocket that searches and kills 5 targets before exploding' },
  { id: 'collector',      name: 'COLLECTOR',       category: 'upgrade', cost: 880,  description: 'Shoot $ or ? to collect them from range' },
  { id: 'hornet_assistant', name: 'HORNET ASSISTANT', category: 'upgrade', cost: 5880, description: 'At 2 lives or less, a friendly jet spawns for 20 sec to help' },

  // ── Skins (color palette for any jet) ────────────────────────────────────
  { id: 'skin_breast_cancer', name: 'I SUPPORT BREAST CANCER', category: 'skin', cost: 1,   description: 'Pink hull — fight the fight',         color: '#ff69b4', accent: '#ffffff' },
  { id: 'skin_shemesh',       name: 'SHEMESH',                  category: 'skin', cost: 144, description: 'Blazing sun — deep orange core',      color: '#ff8800', accent: '#ffee00' },
  { id: 'skin_bat_yam',       name: 'BAT YAM',                  category: 'skin', cost: 120, description: 'Ocean blue with teal shimmer',        color: '#0077ff', accent: '#00ffee' },
  { id: 'skin_coffee',        name: 'COFFEE',                   category: 'skin', cost: 160, description: 'Dark roast with cream highlights',     color: '#6b3a1f', accent: '#f5d9a8' },
  { id: 'skin_anavim',        name: 'ANAVIM',                   category: 'skin', cost: 128, description: 'Deep grape with lavender glow',        color: '#7b2fff', accent: '#dd88ff' },
  { id: 'skin_chupapi',       name: 'CHUPAPI',                  category: 'skin', cost: 192, description: 'Wild green with neon yellow',          color: '#00dd44', accent: '#ccff00' },
  { id: 'skin_goldie',        name: 'GOLDIE',                   category: 'skin', cost: 280, description: 'Metallic gold with white chrome',      color: '#ffd700', accent: '#ffffff' },
  { id: 'skin_beast',         name: 'BEAST',                    category: 'skin', cost: 400, description: 'Animated rainbow hull',               color: 'rainbow' },
  { id: 'skin_acid',          name: 'ACID',                     category: 'skin', cost: 480, description: 'Trippy psychedelic glow',             color: 'acid' },
  { id: 'skin_pheonix',       name: 'THE PHEONIX',              category: 'skin', cost: 640, description: 'Purple + gold — rise from the ashes',  color: '#9b59b6', accent: '#ffd700' },
  { id: 'skin_karamba',       name: 'KARAMBA',                  category: 'skin', cost: 336, description: 'Hot coral meets electric orange',      color: '#ff2255', accent: '#ff9900' },
  { id: 'skin_zoink',         name: 'ZOINK',                    category: 'skin', cost: 304, description: 'Glitchy electric cyan-green',          color: '#00eeff', accent: '#00ff88' },
  { id: 'skin_silver_surfer', name: 'SILVER SURFER',            category: 'skin', cost: 360, description: 'Silver-blue chrome with icy glow',    color: '#8ab4d4', accent: '#ddeeff' },
  { id: 'skin_neon_dream',    name: 'NEON DREAM',               category: 'skin', cost: 440, description: 'Vivid magenta with electric mint',    color: '#ff00cc', accent: '#00ffaa' },
  { id: 'skin_desert_storm',  name: 'DESERT STORM',             category: 'skin', cost: 384, description: 'Sandy gold with warm amber glow',     color: '#d4a843', accent: '#ff8844' },
  { id: 'skin_zion',       name: 'ZION',                       category: 'skin', cost: 100, description: 'Blue and white fast flash',            color: 'zion' },
  { id: 'skin_candy',      name: 'CANDY',                      category: 'skin', cost: 200, description: 'Sweet pink and mint combo',           color: '#ff88cc', accent: '#88ffdd' },
  { id: 'skin_aurora',     name: 'AURORA',                     category: 'skin', cost: 260, description: 'Northern lights cyan and purple',       color: '#00ddff', accent: '#aa66ff' },

  // ── Jets (4 purchasable — Starter is always available for free) ───────────
  { id: 'plane_hamud',      name: 'HAMUDI',         category: 'plane', cost: 2400,
    description: '3 lives · 2 flares · 2 rockets', lives: 3, flares: 2, rockets: 2 },
  { id: 'plane_walla_yofi', name: 'KILLAJET',        category: 'plane', cost: 5200,
    description: '3 lives · 3 flares · 3 rockets · Shield · ×1.5 fire', lives: 3, flares: 3, rockets: 3, shield: true, rapidFire: true },
  { id: 'plane_very_scary', name: 'VERY SCARY JET',  category: 'plane', cost: 8800,
    description: '4 lives · 4 flares · 4 rockets · 2 Shields', lives: 4, flares: 4, rockets: 4, shield: true, jetShieldBase: 2 },
  { id: 'plane_astrozoinker', name: 'ASTROZOINKER',    category: 'plane', cost: 69000,
    description: '4 lives · 5 shields · 8 rockets — ultimate hybrid', lives: 4, flares: 4, rockets: 8, shield: true },
];

// ── Spin Wheel — 13 segments: shmips 5-30 + one-time boosts, every 6h ────────
// ── Daily Gift reward table ────────────────────────────────────────────────────
const GIFT_REWARDS = [
  { id: 'cash_10',  weight: 28, type: 'shmips',      value: 10 },
  { id: 'cash_20',  weight: 22, type: 'shmips',      value: 20 },
  { id: 'cash_30',  weight: 16, type: 'shmips',      value: 30 },
  { id: 'cash_40',  weight: 8,  type: 'shmips',      value: 40 },
  { id: 'cash_50',  weight: 5,  type: 'shmips',      value: 50 },
  { id: 'cash_100', weight: 3,  type: 'shmips',      value: 100 },
  { id: 'cash_200', weight: 2,  type: 'shmips',      value: 200 },
  { id: 'cash_300', weight: 1,  type: 'shmips',      value: 300 },
  { id: 'boost',    weight: 9,  type: 'boost_grant'             },
  { id: 'skin',     weight: 6,  type: 'skin_grant'              },
];
const COOLDOWN_MS = 4 * 60 * 60 * 1000;  // 4 hours (applies to everyone)

function _pickGiftReward() {
  const total = GIFT_REWARDS.reduce((a, r) => a + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of GIFT_REWARDS) { roll -= r.weight; if (roll < 0) return r; }
  return GIFT_REWARDS[0];
}

// ── Get or create user ────────────────────────────────────────────────────────
export async function dbGetOrCreateUser(telegramId) {
  const id = String(telegramId);

  const rows = await supa(`users?telegram_id=eq.${id}&select=*`);
  let user = rows[0] || null;
  let upgrades = [];

  if (!user) {
    const created = await supa('users?select=*', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ telegram_id: id, nickname: 'ACE', shmips: 0 }),
    });
    user = created[0];
  } else {
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

// ── Consume 1 of a boost (per-run boost deduction) ───────────────────────────
export async function dbConsumeBoost(telegramId, upgradeId) {
  const id = String(telegramId);
  try {
    const rows = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${upgradeId}&select=quantity`);
    if (!rows.length) return;
    const qty = rows[0].quantity;
    if (qty <= 1) {
      await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${upgradeId}`, { method: 'DELETE' });
    } else {
      await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${upgradeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty - 1 }),
      });
    }
  } catch { /* best-effort */ }
}

// ── Add bonus shmips (from coin pickups) ───────────────────────────────────────
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
  const rows = await supa('users?select=nickname,best_score&best_score=gt.0&order=best_score.desc&limit=5');
  return rows || [];
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

// ── Gift status (timer for everyone, no admin bypass) ─────────────────────────
export async function dbGiftStatus(telegramId) {
  const rows = await supa(`users?telegram_id=eq.${String(telegramId)}&select=last_spin_at`);
  const user = rows[0];
  if (!user?.last_spin_at) return { available: true, remainingMs: 0 };
  const next = new Date(user.last_spin_at).getTime() + COOLDOWN_MS;
  const now  = Date.now();
  return { available: now >= next, remainingMs: Math.max(0, next - now) };
}

// ── Open daily gift ────────────────────────────────────────────────────────────
export async function dbOpenGift(telegramId) {
  const id = String(telegramId);
  const [userRows, upgradeRows] = await Promise.all([
    supa(`users?telegram_id=eq.${id}&select=shmips,last_spin_at`),
    supa(`user_upgrades?telegram_id=eq.${id}&select=upgrade_id`),
  ]);
  const user = userRows[0];
  if (!user) throw new Error('User not found.');

  const now = new Date();
  if (user.last_spin_at) {
    const next = new Date(user.last_spin_at).getTime() + COOLDOWN_MS;
    if (now.getTime() < next) {
      const rem = next - now.getTime();
      const h = Math.floor(rem / 3_600_000);
      const m = Math.floor((rem % 3_600_000) / 60_000);
      throw new Error(`GIFT LOCKED — ${h}H ${m}M REMAINING`);
    }
  }

  const reward  = _pickGiftReward();
  const updates = { last_spin_at: now.toISOString() };
  let label = '';
  let type  = reward.type;

  if (reward.type === 'shmips') {
    updates.shmips = Math.round((Number(user.shmips) + reward.value) * 100) / 100;
    label = `+${reward.value} $$`;

  } else if (reward.type === 'boost_grant') {
    const boostPool = ['extra_life', 'extra_flare', 'extra_shield', 'extra_rocket'];
    const grantedId = boostPool[Math.floor(Math.random() * boostPool.length)];
    const item = CATALOG.find(c => c.id === grantedId);
    label = item?.name || grantedId;
    await _grantUpgrade(id, grantedId);

  } else if (reward.type === 'skin_grant') {
    const allSkins  = CATALOG.filter(c => c.category === 'skin');
    const ownedIds  = new Set(upgradeRows.map(u => u.upgrade_id));
    const skin      = allSkins[Math.floor(Math.random() * allSkins.length)];
    if (ownedIds.has(skin.id)) {
      // Already owned — compensate with the skin's cost in shmips
      updates.shmips = Math.round((Number(user.shmips) + skin.cost) * 100) / 100;
      label = `${skin.name} (OWNED) +${skin.cost} $$`;
      type  = 'shmips';
    } else {
      label = skin.name;
      await _grantUpgrade(id, skin.id);
    }
  }

  await supa(`users?telegram_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
  const updated = await supa(`users?telegram_id=eq.${id}&select=*`);
  return { reward: { label, type }, user: updated[0] };
}

async function _grantUpgrade(id, upgradeId) {
  const existing = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${upgradeId}&select=quantity`);
  if (existing.length > 0) {
    await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.${upgradeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: existing[0].quantity + 1 }),
    });
  } else {
    await supa('user_upgrades', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: id, upgrade_id: upgradeId, quantity: 1 }),
    });
  }
}

