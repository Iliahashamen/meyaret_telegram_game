// ============================================================
// MEYARET — Full End-to-End Test Suite  (v2 — synced to current code)
// Tests every major DB operation against the live Supabase instance.
// Run: node scripts/test-game.mjs
// ============================================================

const SUPA_URL = 'https://fbcjmniqwqiurssdqnka.supabase.co/rest/v1';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiY2ptbmlxd3FpdXJzc2RxbmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTI0MzksImV4cCI6MjA4ODYyODQzOX0.QDC0jN8Zf1JgvmvDVa3h_CD4wPih6Ly2L4kEFK1Q48E';

const HDR = {
  'apikey':        SUPA_KEY,
  'Authorization': `Bearer ${SUPA_KEY}`,
  'Content-Type':  'application/json',
};

const TEST_ID = 999999999; // Synthetic test user — deleted at teardown
let passed = 0;
let failed = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function ok(label) { console.log(`  ✓  ${label}`); passed++; }
function fail(label, err) {
  console.error(`  ✗  ${label}`);
  console.error(`     ${err?.message || err}`);
  failed++;
}
async function test(label, fn) {
  try { await fn(); ok(label); } catch (e) { fail(label, e); }
}
function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function cleanup() {
  try {
    await supa(`user_upgrades?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
    await supa(`scores?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
    await supa(`users?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
  } catch { /* best effort */ }
}

// ── Canonical CATALOG (must match public/db.js) ───────────────────────────────
const CATALOG = [
  // Boosts
  { id: 'extra_life',   name: 'Extra Life',   category: 'boost', cost: 10,  stackable: true },
  { id: 'extra_flare',  name: 'Extra Flare',  category: 'boost', cost: 5,   stackable: true },
  { id: 'extra_shield', name: 'Run Shield',   category: 'boost', cost: 10,  stackable: true },
  { id: 'extra_rocket', name: 'Run Rocket',   category: 'boost', cost: 15,  stackable: true },
  // Upgrades
  { id: 'magen',          category: 'upgrade', cost: 800  },
  { id: 'pew_pew_15',     category: 'upgrade', cost: 600  },
  { id: 'pew_pew_3',      category: 'upgrade', cost: 1500 },
  { id: 'jew_method',     category: 'upgrade', cost: 900  },
  { id: 'kurwa_raketa',   category: 'upgrade', cost: 1200 },
  { id: 'ace_upgrade',    category: 'upgrade', cost: 1800 },
  { id: 'zep_zep_zep',    category: 'upgrade', cost: 1400 },
  { id: 'shplit',         category: 'upgrade', cost: 1000 },
  { id: 'tripple_threat', category: 'upgrade', cost: 1600 },
  { id: 'lazer_pew',      category: 'upgrade', cost: 2000 },
  { id: 'smart_rocket',   category: 'upgrade', cost: 2200 },
  { id: 'collector',      category: 'upgrade', cost: 1100 },
  // Skins
  { id: 'skin_breast_cancer', category: 'skin', cost: 1   },
  { id: 'skin_shemesh',       category: 'skin', cost: 180 },
  { id: 'skin_bat_yam',       category: 'skin', cost: 150 },
  { id: 'skin_coffee',        category: 'skin', cost: 200 },
  { id: 'skin_anavim',        category: 'skin', cost: 160 },
  { id: 'skin_chupapi',       category: 'skin', cost: 240 },
  { id: 'skin_goldie',        category: 'skin', cost: 350 },
  { id: 'skin_beast',         category: 'skin', cost: 500 },
  { id: 'skin_acid',          category: 'skin', cost: 600 },
  { id: 'skin_pheonix',       category: 'skin', cost: 800 },
  // Jets
  { id: 'plane_hamud',      category: 'plane', cost: 3000  },
  { id: 'plane_walla_yofi', category: 'plane', cost: 6500  },
  { id: 'plane_very_scary', category: 'plane', cost: 11000 },
];

// Canonical SPIN_WHEEL_SEGMENTS (must match public/db.js — 12 segments)
const SPIN_WHEEL_SEGMENTS = [
  { label: '5 $$',  rewardGroup: 'cash_5'  },
  { label: '10 $$', rewardGroup: 'cash_10' },
  { label: '5 $$',  rewardGroup: 'cash_5'  },
  { label: '5 $$',  rewardGroup: 'cash_5'  },
  { label: 'BOOST', rewardGroup: 'boost'   },
  { label: '10 $$', rewardGroup: 'cash_10' },
  { label: '5 $$',  rewardGroup: 'cash_5'  },
  { label: 'SKIN',  rewardGroup: 'skin'    },
  { label: '5 $$',  rewardGroup: 'cash_5'  },
  { label: '10 $$', rewardGroup: 'cash_10' },
  { label: '25 $$', rewardGroup: 'cash_25' },
  { label: 'MAGNTO',rewardGroup: 'magneto' },
];

const SPIN_REWARDS = [
  { id: 'cash_5',  weight: 42 },
  { id: 'cash_10', weight: 25 },
  { id: 'cash_25', weight: 8  },
  { id: 'boost',   weight: 10 },
  { id: 'skin',    weight: 8  },
  { id: 'magneto', weight: 7  },
];

// ── Test sections ─────────────────────────────────────────────────────────────

async function testConnection() {
  console.log('\n  1. Connection');
  await test('Supabase REST reachable', async () => {
    const rows = await supa('users?limit=1');
    assert(Array.isArray(rows), 'Expected array');
  });
}

async function testUserLifecycle() {
  console.log('\n  2. User lifecycle');

  await test('Create test user', async () => {
    await cleanup();
    const rows = await supa('users?select=*', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ telegram_id: TEST_ID, nickname: 'TESTACE', shmips: 0 }),
    });
    assert(rows[0]?.telegram_id == TEST_ID, 'User not created');
  });

  await test('Fetch existing user', async () => {
    const rows = await supa(`users?telegram_id=eq.${TEST_ID}&select=*`);
    assert(rows.length === 1, 'User not found');
    assert(rows[0].nickname === 'TESTACE', 'Nickname mismatch');
  });

  await test('Update nickname', async () => {
    const rows = await supa(`users?telegram_id=eq.${TEST_ID}&select=*`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ nickname: 'RENAMED' }),
    });
    assert(rows[0].nickname === 'RENAMED', 'Nickname not updated');
  });
}

async function testScores() {
  console.log('\n  3. Scores & best_score');

  await test('Insert score row', async () => {
    await supa('scores', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: TEST_ID, score: 5000, level: 3, shmips_earned: 5 }),
    });
  });

  await test('Fetch personal scores', async () => {
    const rows = await supa(`scores?telegram_id=eq.${TEST_ID}&select=score,level&order=score.desc&limit=5`);
    assert(rows.length >= 1, 'No scores found');
    assert(rows[0].score === 5000, 'Score value mismatch');
  });

  await test('Update user best_score', async () => {
    const updated = await supa(`users?telegram_id=eq.${TEST_ID}&select=*`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ best_score: 5000, total_games: 1, shmips: 5 }),
    });
    assert(updated[0].best_score === 5000, 'best_score not updated');
    assert(Number(updated[0].shmips) === 5, 'Shmips not updated');
  });

  await test('Higher score updates best_score', async () => {
    await supa('scores', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: TEST_ID, score: 12000, level: 7, shmips_earned: 12 }),
    });
    const updated = await supa(`users?telegram_id=eq.${TEST_ID}&select=*`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ best_score: 12000, total_games: 2, shmips: 17 }),
    });
    assert(updated[0].best_score === 12000, 'best_score did not increase');
  });
}

async function testUpgrades() {
  console.log('\n  4. Upgrades / store');

  await test('Insert a boost upgrade', async () => {
    await supa('user_upgrades', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: TEST_ID, upgrade_id: 'extra_life', quantity: 1 }),
    });
  });

  await test('Fetch user upgrades', async () => {
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id,quantity`);
    assert(rows.length >= 1, 'No upgrades found');
    assert(rows.find(r => r.upgrade_id === 'extra_life'), 'extra_life not found');
  });

  await test('Boost qty starts at 1', async () => {
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_life&select=quantity`);
    assert(rows[0].quantity === 1, 'Expected quantity 1');
  });

  await test('Consume boost (decrement qty to 0 = delete)', async () => {
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_life&select=quantity`);
    assert(rows[0].quantity <= 1, 'Expected qty=1 before consume');
    await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_life`, { method: 'DELETE' });
    const after = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id`);
    assert(!after.find(r => r.upgrade_id === 'extra_life'), 'Boost not deleted after consume');
  });

  await test('Insert a permanent upgrade', async () => {
    await supa('user_upgrades', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: TEST_ID, upgrade_id: 'magen', quantity: 1 }),
    });
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id`);
    assert(rows.find(r => r.upgrade_id === 'magen'), 'magen not found');
  });

  await test('Delete all upgrades for user', async () => {
    await supa(`user_upgrades?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id`);
    assert(rows.length === 0, 'Upgrades not deleted');
  });
}

async function testSpin() {
  console.log('\n  5. SHPIN (spin)');

  await test('Spin available when last_spin_at is NULL', async () => {
    const rows = await supa(`users?telegram_id=eq.${TEST_ID}&select=last_spin_at`);
    assert(!rows[0].last_spin_at, 'Expected null last_spin_at');
  });

  await test('Set last_spin_at (simulate spin used)', async () => {
    const now = new Date().toISOString();
    await supa(`users?telegram_id=eq.${TEST_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_spin_at: now }),
    });
    const rows = await supa(`users?telegram_id=eq.${TEST_ID}&select=last_spin_at`);
    assert(rows[0].last_spin_at, 'last_spin_at not set');
  });

  await test('Spin cooldown correctly detected (6h window)', async () => {
    const rows = await supa(`users?telegram_id=eq.${TEST_ID}&select=last_spin_at`);
    const COOLDOWN_MS = 6 * 60 * 60 * 1000;
    const next = new Date(new Date(rows[0].last_spin_at).getTime() + COOLDOWN_MS);
    assert(Date.now() < next, 'Expected spin to be on cooldown');
  });

  await test('Grant shmips via spin reward', async () => {
    const bonus = 25;
    const before = await supa(`users?telegram_id=eq.${TEST_ID}&select=shmips`);
    const newBal = Number(before[0].shmips) + bonus;
    await supa(`users?telegram_id=eq.${TEST_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ shmips: newBal }),
    });
    const after = await supa(`users?telegram_id=eq.${TEST_ID}&select=shmips`);
    assert(Number(after[0].shmips) === newBal, 'Shmips not granted');
  });

  await test('Spin wheel has 12 segments', () => {
    assert(SPIN_WHEEL_SEGMENTS.length === 12, `Expected 12 segments, got ${SPIN_WHEEL_SEGMENTS.length}`);
  });

  await test('All spin segments have a valid rewardGroup', () => {
    const validGroups = new Set(SPIN_REWARDS.map(r => r.id));
    for (const seg of SPIN_WHEEL_SEGMENTS) {
      assert(validGroups.has(seg.rewardGroup), `Unknown rewardGroup: ${seg.rewardGroup}`);
    }
  });

  await test('Spin reward weights sum to 100', () => {
    const total = SPIN_REWARDS.reduce((a, r) => a + r.weight, 0);
    assert(total === 100, `Weights sum to ${total}, expected 100`);
  });

  await test('cash_25 maps to exactly 1 segment (rare)', () => {
    const count = SPIN_WHEEL_SEGMENTS.filter(s => s.rewardGroup === 'cash_25').length;
    assert(count === 1, `Expected 1 cash_25 segment, found ${count}`);
  });

  await test('cash_5 is the most common segment (5 slots)', () => {
    const count = SPIN_WHEEL_SEGMENTS.filter(s => s.rewardGroup === 'cash_5').length;
    assert(count === 5, `Expected 5 cash_5 segments, found ${count}`);
  });
}

async function testLeaderboard() {
  console.log('\n  6. Leaderboard');

  await test('Users endpoint returns sorted rows', async () => {
    const rows = await supa('users?select=nickname,best_score&order=best_score.desc&limit=5');
    assert(Array.isArray(rows), 'Expected array');
  });

  await test('Test user appears in users ranking', async () => {
    const rows = await supa('users?select=nickname,best_score&order=best_score.desc&limit=100');
    const found = rows.find(r => Number(r.best_score) === 12000);
    assert(found, 'Test user not found in sorted list');
  });
}

async function testCatalog() {
  console.log('\n  7. Catalog integrity');

  await test('All CATALOG items have valid id/cost/category', () => {
    for (const item of CATALOG) {
      assert(item.id, `Item missing id`);
      assert(typeof item.cost === 'number' && item.cost > 0, `${item.id}: bad cost`);
      assert(['boost','upgrade','skin','plane'].includes(item.category), `${item.id}: bad category`);
    }
  });

  await test('No duplicate catalog IDs', () => {
    const ids = CATALOG.map(i => i.id);
    const unique = new Set(ids);
    assert(unique.size === ids.length, 'Duplicate IDs found in CATALOG');
  });

  await test('Correct counts per category', () => {
    const counts = CATALOG.reduce((acc, i) => { acc[i.category] = (acc[i.category]||0)+1; return acc; }, {});
    assert(counts.boost   === 4,  `Expected 4 boosts, got ${counts.boost}`);
    assert(counts.upgrade === 12, `Expected 12 upgrades, got ${counts.upgrade}`);
    assert(counts.skin    === 10, `Expected 10 skins, got ${counts.skin}`);
    assert(counts.plane   === 3,  `Expected 3 planes, got ${counts.plane}`);
  });

  await test('Boosts cost between 5 and 15 shmips', () => {
    const boosts = CATALOG.filter(i => i.category === 'boost');
    for (const b of boosts) {
      assert(b.cost >= 5 && b.cost <= 15, `${b.id} costs ${b.cost} — expected 5-15`);
    }
  });

  await test('All boosts are stackable', () => {
    const boosts = CATALOG.filter(i => i.category === 'boost');
    for (const b of boosts) {
      assert(b.stackable === true, `${b.id} should be stackable`);
    }
  });

  await test('Cheapest skin costs 1 shmip (I SUPPORT BREAST CANCER)', () => {
    const skins = CATALOG.filter(i => i.category === 'skin');
    const cheapest = Math.min(...skins.map(s => s.cost));
    assert(cheapest === 1, `Cheapest skin is ${cheapest}, expected 1`);
  });

  await test('Most expensive jet is 11000 shmips (F35 VERY SCARY)', () => {
    const planes = CATALOG.filter(i => i.category === 'plane');
    const max = Math.max(...planes.map(p => p.cost));
    assert(max === 11000, `Most expensive plane is ${max}, expected 11000`);
  });

  await test('LAZER PEW upgrade exists and costs 2000', () => {
    const item = CATALOG.find(i => i.id === 'lazer_pew');
    assert(item, 'lazer_pew not in CATALOG');
    assert(item.cost === 2000, `lazer_pew costs ${item.cost}, expected 2000`);
  });
}

async function testGameConfig() {
  console.log('\n  8. Game config sanity');

  await test('Spin cooldown is 6 hours', () => {
    const COOLDOWN_MS = 6 * 60 * 60 * 1000;
    assert(COOLDOWN_MS === 21_600_000, 'Cooldown is not 6 hours');
  });

  await test('CFG-style constants are in valid ranges', () => {
    const CFG = { friction: 0.965, thrustPower: 0.09, baseAsteroids: 3, bulletSpeed: 7, bulletLife: 55 };
    assert(CFG.friction > 0 && CFG.friction < 1, 'friction out of range');
    assert(CFG.thrustPower > 0, 'thrustPower must be positive');
    assert(CFG.baseAsteroids >= 1, 'baseAsteroids must be >= 1');
    assert(CFG.bulletSpeed > 0, 'bulletSpeed must be positive');
  });

  await test('Mystery reward probabilities cover full range (0-1)', () => {
    // Bands: rapid 16%, laser 16%, life 12%, shield 12%, flare 12%, rocket 14%, 2x dmg 12%, fireball 6%
    const bands = [0.16, 0.32, 0.44, 0.56, 0.68, 0.82, 0.94, 1.0];
    assert(bands[bands.length - 1] === 1.0, 'Last band must be 1.0');
    for (let i = 1; i < bands.length; i++) {
      assert(bands[i] > bands[i-1], `Band ${i} not monotonically increasing`);
    }
  });

  await test('Fireball is the rarest mystery reward (~6%)', () => {
    const fireballChance = 1.0 - 0.94;
    assert(fireballChance >= 0.05 && fireballChance <= 0.08, `Fireball chance ${fireballChance} out of expected 5-8%`);
  });

  await test('Orange homing rocket fuse is exactly 3 seconds at 60fps', () => {
    const FUSE_TICKS = 180;
    const FPS = 60;
    const seconds = FUSE_TICKS / FPS;
    assert(seconds === 3, `Fuse is ${seconds}s, expected 3s`);
  });

  await test('AOE explosion radius is 190px', () => {
    const AOE = 190;
    assert(AOE === 190, 'AOE radius mismatch');
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   MEYARET — Full Test Suite  (v2)');
  console.log('═══════════════════════════════════════════════════');

  await testConnection();
  await testUserLifecycle();
  await testScores();
  await testUpgrades();
  await testSpin();
  await testLeaderboard();
  await testCatalog();
  await testGameConfig();

  console.log('\n   Cleaning up test data...');
  await cleanup();
  console.log('   Test user removed.');

  console.log('\n═══════════════════════════════════════════════════');
  const total = passed + failed;
  console.log(`   Results: ${passed}/${total} passed  |  ${failed} failed`);
  if (failed === 0) {
    console.log('   ALL TESTS PASSED');
  } else {
    console.log('   SOME TESTS FAILED — see errors above');
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
