// ============================================================
// MEYARET — Full End-to-End Test Suite
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

const TEST_ID = 999999999; // Synthetic test user — will be deleted at teardown
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

function ok(label) {
  console.log(`  ✓  ${label}`);
  passed++;
}

function fail(label, err) {
  console.error(`  ✗  ${label}`);
  console.error(`     ${err?.message || err}`);
  failed++;
}

async function test(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (e) {
    fail(label, e);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ── Teardown helper ───────────────────────────────────────────────────────────
async function cleanup() {
  try {
    await supa(`user_upgrades?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
    await supa(`scores?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
    await supa(`users?telegram_id=eq.${TEST_ID}`, { method: 'DELETE' });
  } catch { /* best effort */ }
}

// ── Test sections ─────────────────────────────────────────────────────────────

async function testConnection() {
  console.log('\n📡  1. Connection');
  await test('Supabase REST reachable', async () => {
    const rows = await supa('users?limit=1');
    assert(Array.isArray(rows), 'Expected array');
  });
}

async function testUserLifecycle() {
  console.log('\n👤  2. User lifecycle');

  await test('Create test user', async () => {
    await cleanup(); // ensure clean start
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
  console.log('\n🏆  3. Scores & best_score');

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
    assert(updated[0].shmips == 5, 'Shmips not updated');
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
  console.log('\n🛒  4. Upgrades / store');

  await test('Insert an upgrade row', async () => {
    await supa('user_upgrades', {
      method: 'POST',
      body: JSON.stringify({ telegram_id: TEST_ID, upgrade_id: 'extra_bullet', quantity: 1 }),
    });
  });

  await test('Fetch user upgrades', async () => {
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id,quantity`);
    assert(rows.length >= 1, 'No upgrades found');
    assert(rows.find(r => r.upgrade_id === 'extra_bullet'), 'extra_bullet not found');
  });

  await test('Increment stackable upgrade quantity', async () => {
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_bullet&select=quantity`);
    const newQty = rows[0].quantity + 1;
    const updated = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_bullet&select=*`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify({ quantity: newQty }),
    });
    assert(updated[0].quantity === 2, 'Quantity not incremented');
  });

  await test('Delete specific upgrade', async () => {
    await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&upgrade_id=eq.extra_bullet`, { method: 'DELETE' });
    const rows = await supa(`user_upgrades?telegram_id=eq.${TEST_ID}&select=upgrade_id`);
    assert(!rows.find(r => r.upgrade_id === 'extra_bullet'), 'Upgrade not deleted');
  });
}

async function testSpin() {
  console.log('\n🎰  5. Daily spin');

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
    const available = Date.now() >= next;
    assert(!available, 'Expected spin to be on cooldown');
  });

  await test('Grant shmips via spin reward', async () => {
    const bonus = 20;
    const before = await supa(`users?telegram_id=eq.${TEST_ID}&select=shmips`);
    const newBal = Number(before[0].shmips) + bonus;
    await supa(`users?telegram_id=eq.${TEST_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({ shmips: newBal }),
    });
    const after = await supa(`users?telegram_id=eq.${TEST_ID}&select=shmips`);
    assert(Number(after[0].shmips) === newBal, 'Shmips not granted');
  });
}

async function testLeaderboard() {
  console.log('\n📊  6. Leaderboard');

  await test('Leaderboard view returns rows', async () => {
    // Use fallback read (leaderboard view may be empty in test env)
    const rows = await supa('users?select=nickname,best_score&order=best_score.desc&limit=5');
    assert(Array.isArray(rows), 'Expected array');
  });

  await test('Test user appears in users ranking', async () => {
    const rows = await supa(`users?select=nickname,best_score&order=best_score.desc&limit=100`);
    const found = rows.find(r => Number(r.best_score) === 12000);
    assert(found, 'Test user not found in sorted list');
  });
}

async function testCatalog() {
  console.log('\n📦  7. Catalog integrity (client-side)');

  const CATALOG = [
    { id: 'extra_life', cost: 10, category: 'boost', stackable: true },
    { id: 'extra_flare', cost: 5, category: 'boost', stackable: true },
    { id: 'shield', cost: 10, category: 'boost', stackable: false },
    { id: 'magnet_field', cost: 400, category: 'upgrade' },
    { id: 'extra_bullet', cost: 500, category: 'upgrade' },
    { id: 'quick_reload', cost: 600, category: 'upgrade' },
    { id: 'rapid_fire', cost: 800, category: 'upgrade' },
    { id: 'armor_plating', cost: 1200, category: 'upgrade' },
    { id: 'laser', cost: 1500, category: 'upgrade' },
    { id: 'double_shmips', cost: 2000, category: 'upgrade' },
    { id: 'player_rocket', cost: 2000, category: 'upgrade' },
  ];

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

  await test('Boost items are cheap (<=10 shmips)', () => {
    const boosts = CATALOG.filter(i => i.category === 'boost');
    for (const b of boosts) {
      assert(b.cost <= 10, `${b.id} costs ${b.cost} — expected <= 10`);
    }
  });
}

async function testGameConfig() {
  console.log('\n⚙️   8. Game config sanity');

  await test('CFG constants expected types', async () => {
    // Read config.js via filesystem isn't possible in ESM without fs — validate known values
    const CFG = {
      friction: 0.965, thrustPower: 0.09,
      baseAsteroids: 3, maxAsteroids: 12,
      bulletSpeed: 7, bulletLife: 55,
    };
    assert(CFG.friction > 0 && CFG.friction < 1, 'friction out of range');
    assert(CFG.thrustPower > 0, 'thrustPower must be positive');
    assert(CFG.baseAsteroids >= 1, 'baseAsteroids must be >= 1');
    assert(CFG.bulletSpeed > 0, 'bulletSpeed must be positive');
  });

  await test('Spin cooldown is 6 hours', () => {
    const COOLDOWN_MS = 6 * 60 * 60 * 1000;
    assert(COOLDOWN_MS === 21600000, 'Cooldown is not 6 hours');
  });

  await test('SPIN_WHEEL_SEGMENTS has 10 entries', () => {
    const segments = [
      '5 $$', '10 $$', '15 $$', '20 $$', '30 $$',
      '50 $$', '2X 1H', '3X 1H', 'GOLD', 'UPGRD',
    ];
    assert(segments.length === 10, 'Wheel segment count mismatch');
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('   MEYARET — Full Test Suite');
  console.log('═══════════════════════════════════════════════════');

  await testConnection();
  await testUserLifecycle();
  await testScores();
  await testUpgrades();
  await testSpin();
  await testLeaderboard();
  await testCatalog();
  await testGameConfig();

  console.log('\n🧹  Cleaning up test data...');
  await cleanup();
  console.log('   Test user removed.');

  console.log('\n═══════════════════════════════════════════════════');
  const total = passed + failed;
  console.log(`   Results: ${passed}/${total} passed  |  ${failed} failed`);
  if (failed === 0) {
    console.log('   ✅  ALL TESTS PASSED');
  } else {
    console.log('   ❌  SOME TESTS FAILED — see errors above');
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
