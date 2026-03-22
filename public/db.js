// ============================================================
// MEYARET — Supabase REST client using plain fetch()
// No CDN dependency — calls the REST API directly.
// Keys loaded at runtime from /api/config — never stored in source.
// ============================================================

let SUPA_URL = '';
let SUPA_KEY = '';

/** Avoid infinite “loading…” when Railway / DNS / device network hangs without closing TCP. */
const FETCH_TIMEOUT_MS = 8_000;

async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function _ensureConfig() {
  if (SUPA_URL && SUPA_KEY) return;
  const clean = (s) => String(s ?? '').trim().replace(/\r?\n/g, '');
  if (window._meyaretConfigPromise) {
    const cfg = await window._meyaretConfigPromise;
    if (cfg && cfg.supaUrl && cfg.supaKey) {
      SUPA_URL = clean(cfg.supaUrl);
      SUPA_KEY = clean(cfg.supaKey);
      return;
    }
  }
  const base = (window.MEYARET_API || '').trim();
  let res;
  try {
    res = await fetchWithTimeout(`${base}/api/config`);
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Config request timed out' : (e?.message || 'Config request failed');
    throw new Error(msg);
  }
  if (!res.ok) throw new Error('Config not available');
  const cfg = await res.json();
  SUPA_URL = clean(cfg.supaUrl);
  SUPA_KEY = clean(cfg.supaKey);
  if (!SUPA_URL || !SUPA_KEY) throw new Error('Invalid config from server');
}

// Core fetch helper — throws on HTTP error with Supabase error message
// Retries once on timeout/connection error (helps when Supabase project is waking up)
async function supa(path, opts = {}, retried = false) {
  await _ensureConfig();
  const HDR = {
    'apikey':        SUPA_KEY,
    'Authorization': `Bearer ${SUPA_KEY}`,
    'Content-Type':  'application/json',
  };
  const url = `${SUPA_URL}/${path}`;
  let res;
  try {
    res = await fetchWithTimeout(url, { ...opts, headers: { ...HDR, ...opts.headers } });
  } catch (e) {
    const isRetryable = e?.name === 'AbortError' || /timeout|connection|terminated|failed to fetch/i.test(e?.message || '');
    if (isRetryable && !retried) {
      await new Promise(r => setTimeout(r, 1500));
      return supa(path, opts, true);
    }
    const msg = e?.name === 'AbortError' ? 'Database request timed out' : (e?.message || 'Network error');
    throw new Error(msg);
  }
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
// 4 boosts · 14 upgrades · 19 skins · 4 planes (starter is free/default)
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
  { id: 'thrust_quasar_neon', name: 'QUASAR NEON', category: 'thrust', cost: 198, description: 'Electric cyber-lime core', color: '#39ff14' },
  { id: 'thrust_corona_blush', name: 'CORONA BLUSH', category: 'thrust', cost: 212, description: 'Peach plasma with hot coral rim', color: '#ff9a6b' },

  // ── Bullet shapes ────────────────────────────────────────────────────────
  { id: 'bullet_default', name: 'DEFAULT',    category: 'bullet', cost: 0,   description: 'Standard red bullets',     shape: 'default', color: '#ff2200' },
  { id: 'bullet_hearts',  name: 'HEARTS',    category: 'bullet', cost: 114, description: 'Pink heart-shaped bullets', shape: 'heart',   color: '#ff69b4' },
  { id: 'bullet_stars',   name: 'STARS',     category: 'bullet', cost: 171, description: 'Gold star-shaped bullets', shape: 'star',    color: '#ffd700' },
  { id: 'bullet_diamonds', name: 'DIAMONDS', category: 'bullet', cost: 133, description: 'Cyan diamond bullets',     shape: 'diamond', color: '#00ffee' },
  { id: 'bullet_circles', name: 'CIRCLES',  category: 'bullet', cost: 95,  description: 'Green circular bullets',    shape: 'circle',  color: '#00ff88' },
  { id: 'bullet_aurora',  name: 'AURORA',   category: 'bullet', cost: 209, description: 'Cyan-purple cycling',      shape: 'default', color: 'aurora' },
  { id: 'bullet_spectrum', name: 'SPECTRUM', category: 'bullet', cost: 247, description: 'Rainbow cycling bullets',   shape: 'default', color: 'spectrum' },
  { id: 'bullet_ion_bolt',     name: 'ION BOLT',     category: 'bullet', cost: 224, description: 'Jagged electric ice bolts',     shape: 'bolt',    color: '#66f0ff' },
  { id: 'bullet_comet_shard', name: 'COMET SHARD',  category: 'bullet', cost: 238, description: 'Angled burn-orange comet slugs', shape: 'shard',   color: '#ff5c00' },

  // ── Skins (color palette for any jet) ────────────────────────────────────
  { id: 'skin_chuck_norris',   name: 'THE CHUCK NORRIS',        category: 'skin', cost: 0,   description: 'Before there was space, there was CHUCK NORRIS!', color: '#4a5d23', accent: '#6b4423' },
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
  { id: 'skin_plasma_veil', name: 'PLASMA VEIL',             category: 'skin', cost: 334, description: 'Seafoam core wrapped in violet haze', color: '#00f5d4', accent: '#9b5de5' },
  { id: 'skin_rust_moon',   name: 'RUST MOON',               category: 'skin', cost: 346, description: 'Copper hull with dusty rose reflections', color: '#b5651d', accent: '#e8a0bf' },

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

  // ── Special (888$$, rotated weekly, only in SPECIAL tab) ─────────────────────
  { id: 'skin_cherry_bomb',     name: 'CHERRY BOMB',       category: 'skin', cost: 888, special: true,
    description: 'Pink/purple/red camo with bright heart center', color: '#ff69b4', accent: '#ff0066' },
  { id: 'rocket_skin_yondu',    name: 'YONDU RAKETA',      category: 'rocket_skin', cost: 888, special: true,
    description: 'Smart rocket skin: bright red', color: '#ff2200' },
  { id: 'skin_money',           name: 'MONEY!',            category: 'skin', cost: 888, special: true,
    description: 'Green dollar skin with $ in middle', color: '#00aa44', accent: '#ffffff' },
  { id: 'bullet_shabeng',       name: 'SHABENG',           category: 'bullet', cost: 888, special: true,
    description: 'Green bullets, shape ^', shape: 'arrow', color: '#00cc66' },
  { id: 'thrust_estoy_loco',    name: 'ESTOY LOCO',        category: 'thrust', cost: 888, special: true,
    description: 'Very fast rainbow cycling thrust', color: 'spectrum_fast' },
  { id: 'skin_playa',           name: 'PLAYA',             category: 'skin', cost: 888, special: true,
    description: 'Purple camo with 69 in middle', color: '#8844aa', accent: '#cc88ff' },
  { id: 'rocket_skin_gay',      name: 'GAY ROCKETS',       category: 'rocket_skin', cost: 888, special: true,
    description: 'Rainbow rockets, each a different color', color: 'spectrum' },
  { id: 'skin_scizo',           name: 'SCIZO',             category: 'skin', cost: 888, special: true,
    description: 'Color-changing skin with glitch shake', color: 'scizo' },
  { id: 'skin_neon_phoenix',    name: 'NEON PHOENIX',      category: 'skin', cost: 888, special: true,
    description: 'Electric orange-pink flames', color: '#ff6600', accent: '#ff00aa' },
  { id: 'bullet_void',          name: 'VOID BULLETS',      category: 'bullet', cost: 888, special: true,
    description: 'Dark purple hollow slugs', shape: 'default', color: '#6600aa' },
  { id: 'thrust_sunset',        name: 'SUNSET ROCKET',     category: 'thrust', cost: 888, special: true,
    description: 'Orange-to-purple gradient thrust', color: '#ff6600' },
  { id: 'thrust_arctic',        name: 'ARCTIC THRUST',     category: 'thrust', cost: 888, special: true,
    description: 'Ice-blue frost glow', color: '#88ddff' },
  { id: 'skin_tiger_stripe',    name: 'TIGER STRIPE',      category: 'skin', cost: 888, special: true,
    description: 'Black and orange tiger camo', color: '#333333', accent: '#ff8800' },
  { id: 'bullet_plasma',        name: 'PLASMA BOLTS',      category: 'bullet', cost: 888, special: true,
    description: 'Magenta plasma cores', shape: 'bolt', color: '#ff00aa' },
  { id: 'rocket_skin_inferno',  name: 'INFERNO ROCKET',    category: 'rocket_skin', cost: 888, special: true,
    description: 'Flame-red rocket trail', color: '#ff3300' },
  { id: 'skin_ocean_camo',      name: 'OCEAN CAMO',        category: 'skin', cost: 888, special: true,
    description: 'Deep blue and teal naval camo', color: '#004466', accent: '#00aacc' },
  { id: 'bullet_cherry',        name: 'CHERRY SLUGS',      category: 'bullet', cost: 888, special: true,
    description: 'Cherry-red heart-shaped bullets', shape: 'heart', color: '#cc2244' },
  { id: 'thrust_neon_green',    name: 'NEON GREEN BLAST',  category: 'thrust', cost: 888, special: true,
    description: 'Electric lime thrust', color: '#00ff44' },
  { id: 'skin_digital_camo',    name: 'DIGITAL CAMO',     category: 'skin', cost: 888, special: true,
    description: 'Pixelated green-gray military camo', color: '#556644', accent: '#889966' },
  { id: 'rocket_skin_cyan',     name: 'CYAN ROCKET',       category: 'rocket_skin', cost: 888, special: true,
    description: 'Bright cyan rocket trail', color: '#00ffff' },
  { id: 'bullet_gold_spike',    name: 'GOLD SPIKES',      category: 'bullet', cost: 888, special: true,
    description: 'Gold spike-shaped bullets', shape: 'shard', color: '#ffd700' },
  { id: 'skin_forest_ghost',   name: 'FOREST GHOST',      category: 'skin', cost: 888, special: true,
    description: 'Muted green-brown woodland camo', color: '#3d5c33', accent: '#6b8e4e' },
  { id: 'thrust_magma',         name: 'MAGMA THRUST',      category: 'thrust', cost: 888, special: true,
    description: 'Molten orange-red thrust', color: '#ff4400' },
  { id: 'skin_night_ops',       name: 'NIGHT OPS',        category: 'skin', cost: 888, special: true,
    description: 'Dark navy stealth camo', color: '#1a1a2e', accent: '#4a4a6a' },
  { id: 'bullet_ice_shard',     name: 'ICE SHARDS',       category: 'bullet', cost: 888, special: true,
    description: 'Frozen cyan crystal bullets', shape: 'shard', color: '#66ccff' },
  { id: 'rocket_skin_gold',     name: 'GOLD ROCKET',      category: 'rocket_skin', cost: 888, special: true,
    description: 'Golden rocket trail', color: '#ffd700' },
  { id: 'skin_desert_tan',      name: 'DESERT TAN',       category: 'skin', cost: 888, special: true,
    description: 'Sandy tan desert camo', color: '#c4a574', accent: '#8b7355' },
  { id: 'thrust_electric',      name: 'ELECTRIC PURPLE',  category: 'thrust', cost: 888, special: true,
    description: 'Electric violet thrust', color: '#8800ff' },
  { id: 'bullet_void_diamond',  name: 'VOID DIAMONDS',    category: 'bullet', cost: 888, special: true,
    description: 'Dark diamond bullets', shape: 'diamond', color: '#330044' },
  { id: 'skin_urban_gray',      name: 'URBAN GRAY',       category: 'skin', cost: 888, special: true,
    description: 'Concrete gray urban camo', color: '#6b6b6b', accent: '#9a9a9a' },
  { id: 'rocket_skin_magenta',  name: 'MAGENTA ROCKET',    category: 'rocket_skin', cost: 888, special: true,
    description: 'Hot pink rocket trail', color: '#ff0088' },
];

// Special store: 30 items, 3/week. Week 1: 1,2,4. Weeks 2–10: remaining 27 (no repeat). Week 11+: random 3 from full list.
const SPECIAL_ITEMS = [
  'skin_cherry_bomb', 'rocket_skin_yondu', 'skin_money', 'bullet_shabeng', 'thrust_estoy_loco',
  'skin_playa', 'rocket_skin_gay', 'skin_scizo', 'skin_neon_phoenix', 'bullet_void',
  'thrust_sunset', 'thrust_arctic', 'skin_tiger_stripe', 'bullet_plasma', 'rocket_skin_inferno',
  'skin_ocean_camo', 'bullet_cherry', 'thrust_neon_green', 'skin_digital_camo', 'rocket_skin_cyan',
  'bullet_gold_spike', 'skin_forest_ghost', 'thrust_magma', 'skin_night_ops', 'bullet_ice_shard',
  'rocket_skin_gold', 'skin_desert_tan', 'thrust_electric', 'bullet_void_diamond', 'skin_urban_gray',
  'rocket_skin_magenta',
];

/** Sunday 08:00 UTC — Items 1,2,4 (Cherry Bomb, Yondu, Shabeng) always first until rotation starts. */
const SPECIAL_EPOCH_MS = new Date('2026-01-01T08:00:00Z').getTime();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SUNDAY_8AM_MS = 8 * 60 * 60 * 1000; // 08:00 in ms since midnight

/** Get start of current week: most recent Sunday 08:00 UTC (items run until *next* Sunday 08:00) */
function _getCurrentWeekStart(now) {
  const d = new Date(now);
  const day = d.getUTCDay();
  const msSinceMidnight = (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) * 1000 + d.getUTCMilliseconds();
  let daysBack = day;
  if (day === 0 && msSinceMidnight < SUNDAY_8AM_MS) daysBack = 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - daysBack);
  start.setUTCHours(8, 0, 0, 0);
  return start.getTime();
}

/** Seeded shuffle for deterministic weekly picks (same week = same order for everyone) */
function _seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Get 3 special items for the current week. Week 1: [1,2,4]. Weeks 2–10: 27 remaining, 3/week. Week 11+: random 3 from 30. */
export function getWeeklySpecialItems() {
  const items = SPECIAL_ITEMS.slice(0, 30);
  // Always show Cherry Bomb, Yondu Raketa, Shabeng (items 1, 2, 4) until rotation starts
  const forceFirst = [items[0], items[1], items[3]].map(id => CATALOG.find(c => c.id === id)).filter(Boolean);
  if (forceFirst.length === 3) return forceFirst;

  const now = Date.now();
  const weekStart = _getCurrentWeekStart(now);
  let weekIndex = Math.floor((weekStart - SPECIAL_EPOCH_MS) / WEEK_MS);
  if (weekIndex < 0) weekIndex = 0;

  if (weekIndex === 0) {
    return [items[0], items[1], items[3]].map(id => CATALOG.find(c => c.id === id)).filter(Boolean);
  }
  if (weekIndex >= 1 && weekIndex <= 9) {
    const remaining = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29];
    const shuffled = _seededShuffle(remaining, weekIndex);
    const start = (weekIndex - 1) * 3;
    const indices = shuffled.slice(start, start + 3);
    return indices.map(i => CATALOG.find(c => c.id === items[i])).filter(Boolean);
  }
  const shuffled = _seededShuffle([...Array(30).keys()], weekIndex);
  const indices = shuffled.slice(0, 3);
  return indices.map(i => CATALOG.find(c => c.id === items[i])).filter(Boolean);
}

// ── 4hr Gift reward table (improved rarities, better payouts) ─────────────────────────────
const GIFT_REWARDS = [
  { weight: 45, type: 'shmips',  valueMin: 113, valueMax: 300 },   // common (+50%)
  { weight: 15, type: 'shmips',  valueMin: 300, valueMax: 600 },   // uncommon jackpot (+50%)
  { weight: 14, type: 'skin_grant' },                             // uncommon
  { weight: 10, type: 'bullet_grant' },                           // uncommon
  { weight: 10, type: 'thrust_grant' },                            // uncommon
  { weight: 5,  type: 'upgrade_grant' },                          // rare
  { weight: 1,  type: 'shmips',  valueMin: 750, valueMax: 1200 },   // rare jackpot (+50%)
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

export async function dbGrantUpgrade(telegramId, upgradeId) {
  const id = String(telegramId);
  await _grantUpgrade(id, upgradeId);
  const updated = await supa(`users?telegram_id=eq.${id}&select=*`);
  return updated[0] || null;
}

