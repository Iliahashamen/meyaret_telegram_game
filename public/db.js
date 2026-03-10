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

// ── Store Catalog ─────────────────────────────────────────────────────────────
// 4 boosts · 12 upgrades · 10 skins · 3 planes (starter is free/default)
export const CATALOG = [
  // ── Boosts (per-run, max 1 applied per game) ─────────────────────────────
  { id: 'extra_life',   name: 'Extra Life',   category: 'boost', cost: 10,  description: '+1 life for one run (max 1/game)',    stackable: true },
  { id: 'extra_flare',  name: 'Extra Flare',  category: 'boost', cost: 5,   description: '+1 flare for one run (max 1/game)',   stackable: true },
  { id: 'extra_shield', name: 'Run Shield',   category: 'boost', cost: 10,  description: '1 shield charge for one run',         stackable: true },
  { id: 'extra_rocket', name: 'Run Rocket',   category: 'boost', cost: 15,  description: '+1 rocket for one run (max 1/game)',  stackable: true },

  // ── Upgrades (permanent — always active once owned) ───────────────────────
  { id: 'magen',          name: 'MAGEN',          category: 'upgrade', cost: 800,  description: 'Always start every run with a shield charge' },
  { id: 'pew_pew_15',     name: 'PEW PEW 1.5',    category: 'upgrade', cost: 600,  description: 'Fire rate × 1.5' },
  { id: 'pew_pew_3',      name: 'PEW PEW 3',      category: 'upgrade', cost: 1500, description: 'Fire rate × 3 (overrides 1.5)' },
  { id: 'jew_method',     name: 'JEW METHOD',      category: 'upgrade', cost: 900,  description: '$ and ? fly toward you (magnet)' },
  { id: 'kurwa_raketa',   name: 'KURWA RAKETA',    category: 'upgrade', cost: 1200, description: '+2 rockets every run' },
  { id: 'ace_upgrade',    name: 'ACE',             category: 'upgrade', cost: 1800, description: '+1 life each time you destroy a jet' },
  { id: 'zep_zep_zep',    name: 'ZEP ZEP ZEP',    category: 'upgrade', cost: 1400, description: '+1 rocket each time you kill an alien' },
  { id: 'shplit',         name: 'SHPLIT',          category: 'upgrade', cost: 1000, description: 'Shoot 2 parallel lines from both sides' },
  { id: 'tripple_threat', name: 'TRIPPLE THREAT',  category: 'upgrade', cost: 1600, description: 'Shoot in 3 spread directions' },
  { id: 'lazer_pew',      name: 'LAZER PEW',       category: 'upgrade', cost: 2000, description: 'Replace bullets with laser beams' },
  { id: 'smart_rocket',   name: 'SMART ROCKET',    category: 'upgrade', cost: 2200, description: 'Your rocket flies until it hits something' },
  { id: 'collector',      name: 'COLLECTOR',       category: 'upgrade', cost: 1100, description: 'Shoot $ or ? to collect them from range' },

  // ── Skins (10 — color palette for any jet) ────────────────────────────────
  { id: 'skin_breast_cancer', name: 'I SUPPORT BREAST CANCER', category: 'skin', cost: 1,   description: 'Pink hull — fight the fight',         color: '#ff69b4', accent: '#ffffff' },
  { id: 'skin_shemesh',       name: 'SHEMESH',                  category: 'skin', cost: 180, description: 'Blazing sun — deep orange core',      color: '#ff8800', accent: '#ffee00' },
  { id: 'skin_bat_yam',       name: 'BAT YAM',                  category: 'skin', cost: 150, description: 'Ocean blue with teal shimmer',        color: '#0077ff', accent: '#00ffee' },
  { id: 'skin_coffee',        name: 'COFFEE',                   category: 'skin', cost: 200, description: 'Dark roast with cream highlights',     color: '#6b3a1f', accent: '#f5d9a8' },
  { id: 'skin_anavim',        name: 'ANAVIM',                   category: 'skin', cost: 160, description: 'Deep grape with lavender glow',        color: '#7b2fff', accent: '#dd88ff' },
  { id: 'skin_chupapi',       name: 'CHUPAPI',                  category: 'skin', cost: 240, description: 'Wild green with neon yellow',          color: '#00dd44', accent: '#ccff00' },
  { id: 'skin_goldie',        name: 'GOLDIE',                   category: 'skin', cost: 350, description: 'Metallic gold with white chrome',      color: '#ffd700', accent: '#ffffff' },
  { id: 'skin_beast',         name: 'BEAST',                    category: 'skin', cost: 500, description: 'Animated rainbow hull',               color: 'rainbow' },
  { id: 'skin_acid',          name: 'ACID',                     category: 'skin', cost: 600, description: 'Trippy psychedelic glow',             color: 'acid' },
  { id: 'skin_pheonix',       name: 'THE PHEONIX',              category: 'skin', cost: 800, description: 'Purple + gold — rise from the ashes',  color: '#9b59b6', accent: '#ffd700' },
  { id: 'skin_karamba',       name: 'KARAMBA',                  category: 'skin', cost: 420, description: 'Hot coral meets electric orange',      color: '#ff2255', accent: '#ff9900' },
  { id: 'skin_zoink',         name: 'ZOINK',                    category: 'skin', cost: 380, description: 'Glitchy electric cyan-green',          color: '#00eeff', accent: '#00ff88' },
  { id: 'skin_silver_surfer', name: 'SILVER SURFER',            category: 'skin', cost: 450, description: 'Silver-blue chrome with icy glow',    color: '#8ab4d4', accent: '#ddeeff' },

  // ── Jets (3 purchasable — Starter is always available for free) ───────────
  { id: 'plane_hamud',      name: 'HAMUDI',         category: 'plane', cost: 3000,
    description: '3 lives · 2 flares · 2 rockets · Wings', lives: 3, flares: 2, rockets: 2 },
  { id: 'plane_walla_yofi', name: 'KILLAJET',        category: 'plane', cost: 6500,
    description: '3 lives · 3 flares · 3 rockets · Shield · ×1.5 fire', lives: 3, flares: 3, rockets: 3, shield: true, rapidFire: true },
  { id: 'plane_very_scary', name: 'VERY SCARY JET',  category: 'plane', cost: 11000,
    description: '4 lives · 3 flares · 4 rockets · Shield', lives: 4, flares: 3, rockets: 4, shield: true },
];

// ── Spin Wheel — 12 segments matching 5×5$$, 3×10$$, 1×25$$, BOOST, SKIN, MAGNTO ──
export const SPIN_WHEEL_SEGMENTS = [
  { label: '5 $$',  color: '#00ffcc', rewardGroup: 'cash_5'  },
  { label: '10 $$', color: '#ffcc00', rewardGroup: 'cash_10' },
  { label: '5 $$',  color: '#00ddaa', rewardGroup: 'cash_5'  },
  { label: '5 $$',  color: '#00ffcc', rewardGroup: 'cash_5'  },
  { label: 'BOOST', color: '#ff0077', rewardGroup: 'boost'   },
  { label: '10 $$', color: '#ffd700', rewardGroup: 'cash_10' },
  { label: '5 $$',  color: '#00ddaa', rewardGroup: 'cash_5'  },
  { label: 'SKIN',  color: '#8800ff', rewardGroup: 'skin'    },
  { label: '5 $$',  color: '#00ffcc', rewardGroup: 'cash_5'  },
  { label: '10 $$', color: '#ffcc00', rewardGroup: 'cash_10' },
  { label: '25 $$', color: '#ff8800', rewardGroup: 'cash_25' },
  { label: 'MAGNTO',color: '#00aaff', rewardGroup: 'magneto' },
];

const SPIN_REWARDS = [
  { id: 'cash_5',  weight: 42, label: '5 $$',  type: 'shmips',       value: 5  },
  { id: 'cash_10', weight: 25, label: '10 $$', type: 'shmips',       value: 10 },
  { id: 'cash_25', weight: 8,  label: '25 $$', type: 'shmips',       value: 25 },
  { id: 'boost',   weight: 10, label: 'BOOST', type: 'boost_grant'              },
  { id: 'skin',    weight: 8,  label: 'SKIN',  type: 'skin_grant'               },
  { id: 'magneto', weight: 7,  label: 'MAGNTO',type: 'upgrade_grant', upgradeId: 'jew_method' },
];
const COOLDOWN_MS = 9 * 60 * 60 * 1000;  // 9 hours

function pickSpinReward() {
  const total = SPIN_REWARDS.reduce((a, r) => a + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of SPIN_REWARDS) {
    roll -= r.weight;
    if (roll < 0) return r;
  }
  return SPIN_REWARDS[0];
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
  try {
    const rows = await supa('leaderboard?select=nickname,best_score&limit=5');
    return rows || [];
  } catch {
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

// ── Spin status ───────────────────────────────────────────────────────────────
export async function dbSpinStatus(telegramId) {
  const rows = await supa(`users?telegram_id=eq.${telegramId}&select=last_spin_at`);
  const user = rows[0];
  if (!user?.last_spin_at) return { available: true, remainingMs: 0 };
  const next = new Date(new Date(user.last_spin_at).getTime() + COOLDOWN_MS);
  const now = Date.now();
  return { available: now >= next, remainingMs: Math.max(0, next - now) };
}

// ── Do Spin (direct Supabase — no Railway needed) ────────────────────────────
export async function dbDoSpin(telegramId) {
  const id = String(telegramId);
  const rows = await supa(`users?telegram_id=eq.${id}&select=shmips,last_spin_at,multiplier_value,multiplier_end`);
  const user = rows[0];
  if (!user) throw new Error('User not found.');

  const now = new Date();
  if (user.last_spin_at) {
    const next = new Date(new Date(user.last_spin_at).getTime() + COOLDOWN_MS);
    if (now < next) {
      const remainMs = next - now;
      const h = Math.floor(remainMs / 3_600_000);
      const m = Math.floor((remainMs % 3_600_000) / 60_000);
      throw new Error(`SHPIN LOCKED — ${h}H ${m}M REMAINING`);
    }
  }

  const reward = pickSpinReward();
  const updates = { last_spin_at: now.toISOString() };
  let grantedLabel = reward.label;
  let grantedUpgrade = null;

  if (reward.type === 'shmips') {
    updates.shmips = Math.round((Number(user.shmips) + reward.value) * 100) / 100;

  } else if (reward.type === 'boost_grant') {
    const boostPool = ['extra_life', 'extra_flare', 'extra_shield', 'extra_rocket'];
    grantedUpgrade = boostPool[Math.floor(Math.random() * boostPool.length)];
    const boostItem = CATALOG.find(c => c.id === grantedUpgrade);
    grantedLabel = `BOOST: ${boostItem?.name || grantedUpgrade}`;
    await _grantUpgrade(id, grantedUpgrade);

  } else if (reward.type === 'skin_grant') {
    const ownedRows = await supa(`user_upgrades?telegram_id=eq.${id}&select=upgrade_id`);
    const ownedIds = ownedRows.map(r => r.upgrade_id);
    const affordableSkins = CATALOG.filter(c => c.category === 'skin' && c.cost < 500);
    const unowned = affordableSkins.filter(s => !ownedIds.includes(s.id));
    const pick = unowned.length > 0
      ? unowned[Math.floor(Math.random() * unowned.length)]
      : affordableSkins[Math.floor(Math.random() * affordableSkins.length)];
    grantedUpgrade = pick.id;
    grantedLabel = `SKIN: ${pick.name}`;
    await _grantUpgrade(id, grantedUpgrade);

  } else if (reward.type === 'upgrade_grant') {
    grantedUpgrade = reward.upgradeId;
    const upItem = CATALOG.find(c => c.id === grantedUpgrade);
    grantedLabel = upItem?.name || grantedUpgrade;
    await _grantUpgrade(id, grantedUpgrade);
  }

  await supa(`users?telegram_id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  // Find a matching segment index (pick randomly if multiple segments share the reward group)
  const matchingIdxs = SPIN_WHEEL_SEGMENTS
    .map((s, i) => ({ ...s, i }))
    .filter(s => s.rewardGroup === reward.id);
  const picked = matchingIdxs.length > 0
    ? matchingIdxs[Math.floor(Math.random() * matchingIdxs.length)]
    : { i: 0 };

  const updated = await supa(`users?telegram_id=eq.${id}&select=*`);
  return {
    reward: {
      id:           reward.id,
      label:        grantedLabel,
      type:         reward.type,
      upgrade:      grantedUpgrade,
      segmentIndex: picked.i,
    },
    user: updated[0],
  };
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

// ── Dev/Admin reset — wipes upgrades, gives 30k shmips, keeps scores ──────────
export async function dbDevReset(telegramId) {
  await supa(`user_upgrades?telegram_id=eq.${telegramId}`, { method: 'DELETE' });
  await supa(`users?telegram_id=eq.${telegramId}`, {
    method: 'PATCH',
    body: JSON.stringify({ shmips: 30000, last_spin_at: null }),
  });
}
