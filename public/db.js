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
  { id: 'extra_life',   name: 'Extra Life',   category: 'boost', cost: 15,  description: '+1 life for your next run',    stackable: true },
  { id: 'extra_flare',  name: 'Extra Flare',  category: 'boost', cost: 10,   description: '+1 flare for your next run',   stackable: true },
  { id: 'extra_shield', name: 'Run Shield',   category: 'boost', cost: 15,  description: '1 shield charge for your next run', stackable: true },
  { id: 'extra_rocket', name: 'Run Rocket',   category: 'boost', cost: 20,  description: '+1 rocket for your next run',  stackable: true },
  { id: 'score_x2',     name: 'SCORE x2',     category: 'upgrade', cost: 1425, description: 'All score doubled every run (stacks with x3 for x6)' },
  { id: 'score_x3',     name: 'SCORE x3',     category: 'upgrade', cost: 3800, description: 'All score tripled every run (stacks with x2 for x6)' },

  // ── Upgrades (permanent — always active once owned) ───────────────────────
  { id: 'magen',          name: 'MAGEN',          category: 'upgrade', cost: 608,  description: 'Always start every run with a shield charge' },
  { id: 'pew_pew_15',     name: 'PEW PEW 1.5',    category: 'upgrade', cost: 456,  description: 'Fire rate × 1.5' },
  { id: 'pew_pew_3',      name: 'PEW PEW 3',      category: 'upgrade', cost: 1140, description: 'Fire rate × 3 (stacks with 1.5 for ×4.5)' },
  { id: 'jew_method',     name: 'JEW METHOD',      category: 'upgrade', cost: 684,  description: '$ and ? fly toward you (magnet)' },
  { id: 'kurwa_raketa',   name: 'KURWA RAKETA',    category: 'upgrade', cost: 912,  description: '+2 rockets every run' },
  { id: 'ace_upgrade',    name: 'ACE',             category: 'upgrade', cost: 1368, description: '+1 life each time you destroy a jet' },
  { id: 'zep_zep_zep',    name: 'ZEP ZEP ZEP',    category: 'upgrade', cost: 1064, description: '+1 rocket each time you kill an alien' },
  { id: 'shplit',         name: 'SHPLIT',          category: 'upgrade', cost: 760,  description: 'Shoot 2 parallel lines from both sides' },
  { id: 'tripple_threat', name: 'TRIPPLE THREAT',  category: 'upgrade', cost: 1216, description: 'Shoot in 3 spread directions' },
  { id: 'smart_rocket',   name: 'SMART ROCKET',    category: 'upgrade', cost: 1672, description: 'Blue rocket that searches and kills 5 targets before exploding' },
  { id: 'collector',      name: 'COLLECTOR',       category: 'upgrade', cost: 836,  description: 'Shoot $ or ? to collect them from range' },
  { id: 'hornet_assistant', name: 'HORNET ASSISTANT', category: 'upgrade', cost: 5586, description: 'At 2 lives or less, a friendly jet spawns for 20 sec to help' },
  { id: 'xforce_lavian',  name: 'XFORCE LAVIAN',   category: 'upgrade', cost: 4332, description: 'X button: red lasers kill all for 4 sec (5 min cooldown)' },
  { id: 'rip_n_dip',      name: 'RIP N DIP',       category: 'upgrade', cost: 6666, description: 'Full lives 2 min → 10s countdown. Survive = rainbow fury 8 sec' },
  { id: 'lucky_bstrd',    name: 'LUCKY BSTRD',     category: 'upgrade', cost: 888,  description: '70% chance to survive a hit when at 1 life (max 2 per run)' },

  // ── Thrust colors ────────────────────────────────────────────────────────
  { id: 'thrust_default', name: 'DEFAULT',    category: 'thrust', cost: 0,   description: 'Default orange thrust',   color: '#ff6600' },
  { id: 'thrust_cyan',    name: 'CYAN',      category: 'thrust', cost: 95,  description: 'Cyan thrust glow',       color: '#00ffcc' },
  { id: 'thrust_magenta', name: 'MAGENTA',   category: 'thrust', cost: 95,  description: 'Magenta thrust glow',    color: '#ff0077' },
  { id: 'thrust_green',   name: 'GREEN',     category: 'thrust', cost: 114, description: 'Green thrust glow',      color: '#00ff66' },
  { id: 'thrust_yellow',  name: 'YELLOW',    category: 'thrust', cost: 114, description: 'Yellow thrust glow',     color: '#ffee00' },
  { id: 'thrust_blue',    name: 'BLUE',      category: 'thrust', cost: 133, description: 'Blue thrust glow',      color: '#0088ff' },
  { id: 'thrust_purple',  name: 'PURPLE',    category: 'thrust', cost: 152, description: 'Purple thrust glow',     color: '#aa44ff' },
  { id: 'thrust_aurora',  name: 'AURORA',    category: 'thrust', cost: 228, description: 'Cyan-purple-blue cycling', color: 'aurora' },
  { id: 'thrust_spectrum', name: 'SPECTRUM', category: 'thrust', cost: 266, description: 'Full rainbow cycling',    color: 'spectrum' },

  // ── Bullet shapes ────────────────────────────────────────────────────────
  { id: 'bullet_default', name: 'DEFAULT',    category: 'bullet', cost: 0,   description: 'Standard red bullets',     shape: 'default', color: '#ff2200' },
  { id: 'bullet_hearts',  name: 'HEARTS',    category: 'bullet', cost: 114, description: 'Pink heart-shaped bullets', shape: 'heart',   color: '#ff69b4' },
  { id: 'bullet_stars',   name: 'STARS',     category: 'bullet', cost: 171, description: 'Gold star-shaped bullets', shape: 'star',    color: '#ffd700' },
  { id: 'bullet_diamonds', name: 'DIAMONDS', category: 'bullet', cost: 133, description: 'Cyan diamond bullets',     shape: 'diamond', color: '#00ffee' },
  { id: 'bullet_circles', name: 'CIRCLES',  category: 'bullet', cost: 95,  description: 'Green circular bullets',    shape: 'circle',  color: '#00ff88' },
  { id: 'bullet_aurora',  name: 'AURORA',   category: 'bullet', cost: 209, description: 'Cyan-purple cycling',      shape: 'default', color: 'aurora' },
  { id: 'bullet_spectrum', name: 'SPECTRUM', category: 'bullet', cost: 247, description: 'Rainbow cycling bullets',   shape: 'default', color: 'spectrum' },

  // ── Skins (color palette for any jet) ────────────────────────────────────
  { id: 'skin_breast_cancer', name: 'I SUPPORT BREAST CANCER', category: 'skin', cost: 1,   description: 'Pink hull — fight the fight',         color: '#ff69b4', accent: '#ffffff' },
  { id: 'skin_shemesh',       name: 'SHEMESH',                  category: 'skin', cost: 137, description: 'Blazing sun — deep orange core',      color: '#ff8800', accent: '#ffee00' },
  { id: 'skin_bat_yam',       name: 'BAT YAM',                  category: 'skin', cost: 114, description: 'Ocean blue with teal shimmer',        color: '#0077ff', accent: '#00ffee' },
  { id: 'skin_coffee',        name: 'COFFEE',                   category: 'skin', cost: 152, description: 'Dark roast with cream highlights',     color: '#6b3a1f', accent: '#f5d9a8' },
  { id: 'skin_anavim',        name: 'ANAVIM',                   category: 'skin', cost: 122, description: 'Deep grape with lavender glow',        color: '#7b2fff', accent: '#dd88ff' },
  { id: 'skin_chupapi',       name: 'CHUPAPI',                  category: 'skin', cost: 182, description: 'Wild green with neon yellow',          color: '#00dd44', accent: '#ccff00' },
  { id: 'skin_goldie',        name: 'GOLDIE',                   category: 'skin', cost: 266, description: 'Metallic gold with white chrome',      color: '#ffd700', accent: '#ffffff' },
  { id: 'skin_beast',         name: 'BEAST',                    category: 'skin', cost: 380, description: 'Animated rainbow hull',               color: 'rainbow' },
  { id: 'skin_acid',          name: 'ACID',                     category: 'skin', cost: 456, description: 'Trippy psychedelic glow',             color: 'acid' },
  { id: 'skin_pheonix',       name: 'THE PHEONIX',              category: 'skin', cost: 608, description: 'Purple + gold — rise from the ashes',  color: '#9b59b6', accent: '#ffd700' },
  { id: 'skin_karamba',       name: 'KARAMBA',                  category: 'skin', cost: 319, description: 'Hot coral meets electric orange',      color: '#ff2255', accent: '#ff9900' },
  { id: 'skin_zoink',         name: 'ZOINK',                    category: 'skin', cost: 289, description: 'Glitchy electric cyan-green',          color: '#00eeff', accent: '#00ff88' },
  { id: 'skin_silver_surfer', name: 'SILVER SURFER',            category: 'skin', cost: 342, description: 'Silver-blue chrome with icy glow',    color: '#8ab4d4', accent: '#ddeeff' },
  { id: 'skin_neon_dream',    name: 'NEON DREAM',               category: 'skin', cost: 418, description: 'Vivid magenta with electric mint',    color: '#ff00cc', accent: '#00ffaa' },
  { id: 'skin_desert_storm',  name: 'DESERT STORM',             category: 'skin', cost: 365, description: 'Sandy gold with warm amber glow',     color: '#d4a843', accent: '#ff8844' },
  { id: 'skin_zion',       name: 'ZION',                       category: 'skin', cost: 95, description: 'Blue and white fast flash',            color: 'zion' },
  { id: 'skin_candy',      name: 'CANDY',                      category: 'skin', cost: 190, description: 'Sweet pink and mint combo',           color: '#ff88cc', accent: '#88ffdd' },
  { id: 'skin_aurora',     name: 'AURORA',                     category: 'skin', cost: 247, description: 'Northern lights cyan and purple',       color: '#00ddff', accent: '#aa66ff' },
  { id: 'skin_inferno',    name: 'INFERNO',                  category: 'skin', cost: 266, description: 'Red to orange color-shifting flame',   color: '#ff3300', accent: '#ff9900' },
  { id: 'skin_crimson',    name: 'CRIMSON',                  category: 'skin', cost: 228, description: 'Deep red pulsing glow',                color: '#cc0044', accent: '#ff4466' },

  // ── Jets ─────────────────────────────────────────────────────────────────
  { id: 'plane_hamud',      name: 'HAMUDI',         category: 'plane', cost: 2280,
    description: '3 lives · 2 flares · 2 rockets', lives: 3, flares: 2, rockets: 2 },
  { id: 'plane_walla_yofi', name: 'KILLAJET',        category: 'plane', cost: 4940,
    description: '3 lives · 3 flares · 3 rockets · Shield · ×1.3 fire', lives: 3, flares: 3, rockets: 3, shield: true, fireMult: 1.3 },
  { id: 'plane_very_scary', name: 'VERY SCARY JET',  category: 'plane', cost: 8360,
    description: '4 lives · 4 flares · 4 rockets · 2 Shields · ×1.5 fire', lives: 4, flares: 4, rockets: 4, shield: true, jetShieldBase: 2, fireMult: 1.5 },
  { id: 'plane_negev',      name: 'NEGEV',           category: 'plane', cost: 10773,
    description: '4 lives · 5 flares · 6 rockets · 3 Shields · ×1.7 fire', lives: 4, flares: 5, rockets: 6, shield: true, jetShieldBase: 3, fireMult: 1.7 },
  { id: 'plane_baba_yaga',  name: 'BABA YAGA',       category: 'plane', cost: 24277,
    description: '5 lives · 7 flares · 8 rockets · 4 Shields · ×1.8 fire', lives: 5, flares: 7, rockets: 8, shield: true, jetShieldBase: 4, fireMult: 1.8 },
  { id: 'plane_astrozoinker', name: 'ASTROZOINKER',    category: 'plane', cost: 65550,
    description: '5 lives · 9 flares · 11 rockets · 7 Shields · ×2 fire', lives: 5, flares: 9, rockets: 11, shield: true, jetShieldBase: 7, fireMult: 2 },
];

// ── 4hr Gift reward table (improved rarities, better payouts) ─────────────────────────────
const GIFT_REWARDS = [
  { weight: 45, type: 'shmips',  valueMin: 75,  valueMax: 200 },   // common
  { weight: 15, type: 'shmips',  valueMin: 200, valueMax: 400 },   // uncommon jackpot
  { weight: 14, type: 'skin_grant' },                             // uncommon
  { weight: 10, type: 'bullet_grant' },                           // uncommon
  { weight: 10, type: 'thrust_grant' },                            // uncommon
  { weight: 5,  type: 'upgrade_grant' },                          // rare
  { weight: 1,  type: 'shmips',  valueMin: 500, valueMax: 800 },   // rare jackpot
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

// ── Refund LAZER PEW (removed upgrade) — one-time 2000 $$ refund ─────────────
export async function dbRefundLazerPew(telegramId) {
  const id = String(telegramId);
  try {
    const ups = await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.lazer_pew&select=id,quantity`);
    if (!ups?.length) return null;
    const rows = await supa(`users?telegram_id=eq.${id}&select=shmips`);
    const user = rows[0];
    if (!user) return null;
    const newShmips = Math.round((Number(user.shmips) + 2000) * 100) / 100;
    await supa(`users?telegram_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ shmips: newShmips }) });
    await supa(`user_upgrades?telegram_id=eq.${id}&upgrade_id=eq.lazer_pew`, { method: 'DELETE' });
    return { shmips: newShmips };
  } catch { return null; }
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
  const ownedIds = new Set((upgradeRows || []).map(u => u.upgrade_id));

  if (reward.type === 'shmips') {
    const value = reward.value ?? Math.floor((reward.valueMin ?? 50) + Math.random() * ((reward.valueMax ?? 250) - (reward.valueMin ?? 50) + 1));
    updates.shmips = Math.round((Number(user.shmips) + value) * 100) / 100;
    label = `+${value} $$`;

  } else if (reward.type === 'skin_grant') {
    const allSkins = CATALOG.filter(c => c.category === 'skin');
    const skin = allSkins[Math.floor(Math.random() * allSkins.length)];
    if (ownedIds.has(skin.id)) {
      updates.shmips = Math.round((Number(user.shmips) + skin.cost) * 100) / 100;
      label = `${skin.name} (OWNED) +${skin.cost} $$`;
      type = 'shmips';
    } else {
      label = skin.name;
      await _grantUpgrade(id, skin.id);
    }
  } else if (reward.type === 'bullet_grant') {
    const allBullets = CATALOG.filter(c => c.category === 'bullet' && c.id !== 'bullet_default');
    const unowned = allBullets.filter(b => !ownedIds.has(b.id));
    const bullet = unowned.length > 0 ? unowned[Math.floor(Math.random() * unowned.length)] : allBullets[0];
    if (!bullet || ownedIds.has(bullet.id)) {
      const cost = bullet?.cost ?? 100;
      updates.shmips = Math.round((Number(user.shmips) + cost) * 100) / 100;
      label = `${bullet?.name ?? 'Bullet'} (OWNED) +${cost} $$`;
      type = 'shmips';
    } else {
      label = bullet.name;
      await _grantUpgrade(id, bullet.id);
    }
  } else if (reward.type === 'thrust_grant') {
    const allThrusts = CATALOG.filter(c => c.category === 'thrust' && c.id !== 'thrust_default');
    const unowned = allThrusts.filter(t => !ownedIds.has(t.id));
    const thrust = unowned.length > 0 ? unowned[Math.floor(Math.random() * unowned.length)] : allThrusts[0];
    if (!thrust || ownedIds.has(thrust.id)) {
      const cost = thrust?.cost ?? 95;
      updates.shmips = Math.round((Number(user.shmips) + cost) * 100) / 100;
      label = `${thrust?.name ?? 'Thrust'} (OWNED) +${cost} $$`;
      type = 'shmips';
    } else {
      label = thrust.name;
      await _grantUpgrade(id, thrust.id);
    }
  } else if (reward.type === 'upgrade_grant') {
    const allUpg = CATALOG.filter(c => c.category === 'upgrade');
    const upg = allUpg[Math.floor(Math.random() * allUpg.length)];
    if (ownedIds.has(upg.id)) {
      updates.shmips = Math.round((Number(user.shmips) + upg.cost) * 100) / 100;
      label = `${upg.name} (OWNED) +${upg.cost} $$`;
      type = 'shmips';
    } else {
      label = upg.name;
      await _grantUpgrade(id, upg.id);
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

