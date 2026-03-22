// ============================================================
// MEYARET — Full Game Engine
// Asteroids-style physics, Synthwave aesthetics
// ============================================================
// Bump ?v= when changing db/sounds so Telegram / browsers reload module graph
import { SFX } from './sounds.js?v=1.9.1';
import {
  CATALOG,
  getWeeklySpecialItems,
  dbGetOrCreateUser, dbSaveScore, dbGetLeaderboard,
  dbSaveCallsign, dbCheckCallsign,
  dbGetUserUpgrades, dbBuyItem, dbRefundLazerPew,
  dbGiftStatus, dbOpenGift, dbAddBonusShmips, dbConsumeBoost, dbGrantUpgrade,
} from './db.js?v=1.9.2';

// ── Telegram WebApp Init ──────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.disableVerticalSwipes?.(); }
let TG_USER = tg?.initDataUnsafe?.user || null;
const INIT_DATA = tg?.initData || '';

async function waitForTelegramUser() {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return window.Telegram.WebApp.initDataUnsafe.user;
  }
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 80));
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (u?.id) return u;
  }
  return null;
}

const API_BASE = (typeof window !== 'undefined' && window.MEYARET_API) || '';
let OFFLINE_MODE = false;
let SANDBOX_MODE = false; // MEYARET 2 BETA — only for ADMIN_TELEGRAM_ID

const DEMO_USER = {
  telegram_id: 0,
  nickname: localStorage.getItem('meyaret_callsign') || null,
  shmips: 0, best_score: 0, total_games: 0,
  has_golden_plane: false, multiplier_value: 1.0, multiplier_end: null,
};

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:           '#020008',
  ship:         '#eeeeff',   // default white
  bullet:       '#ff2200',
  laser:        '#00ffcc',
  asteroid:     '#7700ee',
  asteroidFill: '#08001a',
  enemyRed:     '#ff1144',
  enemyYellow:  '#ffee00',
  rocket:       '#ffee00',
  flare:        '#ff6600',
  particle:     '#ffffff',
  golden:       '#ffd700',
  hud:          '#00ffcc',
  hudFlare:     '#ff6600',
  hudLevel:     '#ff0077',
};

// ── Arcade Waves Config (each wave = substantial mini-game) ───────────────────
const ARCADE_WAVES = [
  { jet:'starter', skin:null, thrust:null, bullet:null, upgrades:[], bonus:{ life:0, flare:0, shield:0, rocket:0 },
    rocks:{ small:10, med:3, large:1 }, aliens:0, missiles:0, jets:0, boss:false },
  { jet:'starter', skin:'skin_bat_yam', thrust:'#00ff66', bullet:null, upgrades:['kurwa_raketa','pew_pew_15'],
    rocks:{ small:14, med:4, large:2 }, aliens:2, missiles:0, jets:0, boss:false },
  { jet:'plane_hamud', skin:'skin_coffee', thrust:'#0088ff', bullet:'bullet_stars', upgrades:['pew_pew_15'],
    rocks:{ small:18, med:6, large:3 }, aliens:3, missiles:3, jets:0, boss:false },
  { jet:'plane_walla_yofi', skin:'skin_chupapi', thrust:'#ff0077', bullet:'bullet_diamonds', upgrades:['magen'],
    rocks:{ small:26, med:10, large:5 }, aliens:6, missiles:8, jets:0, boss:false },
  { jet:'plane_walla_yofi', skin:'skin_goldie', thrust:'#aa44ff', bullet:'bullet_hearts', upgrades:['ace_upgrade','shplit'],
    bonus:{ life:0, flare:2, shield:0, rocket:0 }, rocks:{ small:30, med:12, large:6 }, aliens:7, missiles:10, jets:3, boss:false },
  { jet:'plane_negev', skin:'skin_acid', thrust:'#00ffcc', bullet:'bullet_diamonds', upgrades:['ace_upgrade','zep_zep_zep','pew_pew_3'],
    bonus:{ life:0, flare:1, shield:1, rocket:0 }, rocks:{ small:34, med:14, large:7 }, aliens:8, missiles:12, jets:5, boss:false },
  { jet:'plane_baba_yaga', skin:'skin_karamba', thrust:'aurora', bullet:'bullet_aurora', upgrades:['smart_rocket','collector','lucky_bstrd'],
    rocks:{ small:38, med:16, large:8 }, aliens:9, missiles:15, jets:6, boss:false },
  { jet:'plane_baba_yaga', skin:'skin_karamba', thrust:'aurora', bullet:'bullet_aurora', upgrades:['smart_rocket','collector','lucky_bstrd'],
    rocks:{ small:48, med:22, large:12 }, aliens:12, missiles:24, jets:10, boss:false },
  { jet:'plane_astrozoinker', skin:'skin_candy', thrust:'spectrum', bullet:'bullet_spectrum', upgrades:['tripple_threat'],
    bonus:{ life:1, flare:1, shield:1, rocket:1 }, rocks:{ small:60, med:26, large:14 }, aliens:15, missiles:30, jets:13, boss:false },
  { jet:'starter', skin:'skin_acid', thrust:null, bullet:null, upgrades:[], bonus:{ life:0, flare:0, shield:0, rocket:0 }, boss:true }, // troll boss
];
function _arcadeAccumulatedUpgrades(waveNum) {
  if (waveNum >= 10) return [];
  const set = new Set();
  for (let w = 1; w <= waveNum; w++) {
    (ARCADE_WAVES[w - 1].upgrades || []).forEach(id => set.add(id));
  }
  return Array.from(set);
}
function _arcadeWaveArsenal(waveNum) {
  if (waveNum > 10) return null;
  const wc = ARCADE_WAVES[waveNum - 1];
  if (!wc) return null;
  const jetName = wc.jet === 'starter' ? 'STARTER JET' : (CATALOG.find(c => c.id === wc.jet)?.name || wc.jet);
  const skinName = wc.skin ? (CATALOG.find(c => c.id === wc.skin)?.name || wc.skin) : null;
  const upgIds = _arcadeAccumulatedUpgrades(waveNum);
  const upgradeNames = upgIds.map(id => CATALOG.find(c => c.id === id)?.name || id);
  const b = wc.bonus || {};
  const bonusLines = [];
  if (b.life) bonusLines.push(`+${b.life} life`);
  if (b.flare) bonusLines.push(`+${b.flare} flare${b.flare > 1 ? 's' : ''}`);
  if (b.shield) bonusLines.push(`+${b.shield} shield`);
  if (b.rocket) bonusLines.push(`+${b.rocket} rocket`);
  return { jetName, skinName, upgradeNames, bonusLines };
}

// ── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  rotSpeed:     0.044,
  thrustPower:  0.09,
  friction:     0.965,
  bulletSpeed:  7,
  bulletLife:   65,
  laserLife:    55,
  rocketSpeed:  1.6,
  flareRadius:  85,
  asteroidSizes: { large: 38, medium: 19, small: 9 },
  asteroidScores: { large: 20, medium: 50, small: 100 },
  enemyRedScore:    200,
  enemyYellowScore: 1000,
  maxBullets:   6,
  respawnMs:    2400,
  invincibleMs: 3000,
  baseAsteroids: 4,
  maxLivesBase: 5,   // hard cap — 5 lives max
};

// ── Utility ───────────────────────────────────────────────────────────────────
const rng   = (a, b) => a + Math.random() * (b - a);
const rngInt = (a, b) => Math.floor(rng(a, b + 1));
const TAU    = Math.PI * 2;

function wrap(val, lo, hi) {
  const range = hi - lo;
  while (val < lo) val += range;
  while (val >= hi) val -= range;
  return val;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function glow(ctx, color, blur = 12) { ctx.shadowColor = color; ctx.shadowBlur = blur; }

// Rainbow color helpers
function rainbowColor(t, speed = 1) {
  const h = (t * speed * 0.05) % 360;
  return `hsl(${h}, 100%, 60%)`;
}
function auroraColor(t) {
  const h = 180 + (t * 0.4) % 180;
  return `hsl(${h}, 95%, 55%)`;
}
function spectrumColor(t) {
  return rainbowColor(t, 1.6);
}
function _hexToRgba(hex, a) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})`;
}
function acidColor(t) {
  const h = (t * 0.45) % 360;
  const s = 100;
  const l = 50 + 18 * Math.sin(t * 0.25);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
function zionColor(t) {
  // Gentle blue/white pulse — slower cycle, softer blend (less flashy)
  const mix = 0.5 + 0.5 * Math.sin(t * 0.04);
  const r = Math.round(0 + (136 - 0) * mix);
  const g = Math.round(136 + (200 - 136) * mix);
  const b = Math.round(255);
  return `rgb(${r},${g},${b})`;
}
function infernoColor(t) {
  // Red to orange color-shifting flame
  const h = 0 + (30 * (0.5 + 0.5 * Math.sin(t * 0.06)));
  return `hsl(${h}, 100%, 55%)`;
}
function crimsonColor(t) {
  // Deep red pulsing glow
  const pulse = 0.6 + 0.4 * Math.sin(t * 0.08);
  return `hsl(350, 90%, ${Math.round(25 + 15 * pulse)}%)`;
}

// Woodland camo — light tan base, bright lime green, dark olive, black branch shapes (Chuck Norris tribute)
const CAMO = { tan: '#c4a574', lime: '#7cb342', olive: '#4a5d23', black: '#1a1a1a', stroke: '#6b9a3a' };
let _camoPattern = null;
function getCamoPattern(ctx) {
  if (_camoPattern) return _camoPattern;
  const c = document.createElement('canvas');
  c.width = 80; c.height = 80;
  const cx = c.getContext('2d');
  cx.fillStyle = CAMO.tan;
  cx.fillRect(0, 0, 80, 80);
  // Dark olive blobs (mid-sized, interlocking)
  cx.fillStyle = CAMO.olive;
  [[12,8,22,14],[44,4,18,16],[6,44,20,18],[50,36,16,20],[28,24,24,16],[4,28,14,18],[56,52,18,14]].forEach(([x,y,w,h]) => {
    cx.beginPath(); cx.ellipse(x,y,w,h,0.4,0,TAU); cx.fill();
  });
  // Bright lime green blobs (prominent, vibrant)
  cx.fillStyle = CAMO.lime;
  [[8,20,16,12],[36,14,20,14],[20,40,18,16],[52,28,14,18],[30,8,12,14],[4,56,16,12],[48,48,14,16]].forEach(([x,y,w,h]) => {
    cx.beginPath(); cx.ellipse(x,y,w,h,-0.3,0,TAU); cx.fill();
  });
  // Black branch-like elongated shapes (small, jagged contrast)
  cx.fillStyle = CAMO.black;
  [[18,16,6,3],[42,22,4,8],[10,48,5,4],[38,8,3,6],[24,36,6,4],[54,40,4,6],[14,28,4,5],[46,54,5,4]].forEach(([x,y,w,h]) => {
    cx.beginPath(); cx.ellipse(x,y,w,h,0.7,0,TAU); cx.fill();
  });
  _camoPattern = ctx.createPattern(c, 'repeat');
  return _camoPattern;
}

function drawCamoStar(ctx, sz) {
  const r = sz * 0.22;
  const cx = 0, cy = -sz * 0.25;
  ctx.save();
  ctx.translate(cx, cy);
  glow(ctx, '#ffdd00', 10);
  ctx.fillStyle = '#ffdd00';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    const ai = ((i + 0.5) * 72 - 90) * Math.PI / 180;
    ctx.lineTo(Math.cos(ai) * r * 0.45, Math.sin(ai) * r * 0.45);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.shadowBlur = 0;
}

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = C.particle, speed = 3, life = 30) {
    this.x = x; this.y = y;
    this.vx = rng(-speed, speed); this.vy = rng(-speed, speed);
    this.life = life; this.maxLife = life;
    this.color = color; this.radius = rng(1, 3);
  }
  update() { this.x += this.vx; this.y += this.vy; this.vx *= 0.96; this.vy *= 0.96; this.life--; }
  draw(ctx) {
    ctx.globalAlpha = this.life / this.maxLife;
    glow(ctx, this.color, 8);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

function burst(particles, x, y, color, count = 12, speed = 3, life = 30) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color, speed, life));
}

class FloatingText {
  constructor(x, y, text, color = '#ffdd00') {
    // Limit DOM float-text elements to prevent lag
    const existing = document.querySelectorAll('.float-text');
    if (existing.length > 15) existing[0].remove();
    this.el = document.createElement('div');
    this.el.className = 'float-text';
    this.el.textContent = text;
    this.el.style.color = color;
    this.el.style.left = x + 'px';
    this.el.style.top  = y + 'px';
    document.body.appendChild(this.el);
    setTimeout(() => this.el.remove(), 1300);
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor(x, y, upgrades = {}) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;
    this.alive = true;
    this.invincible = false;
    this.invTimer   = 0;
    this.blinkTimer = 0;

    this.jetType = upgrades.jetType || 'starter';

    // Lives — capped at CFG.maxLivesBase for upgrade-based starting lives
    const baseLives = { starter: 2, plane_hamud: 3, plane_walla_yofi: 3, plane_very_scary: 4, plane_negev: 4, plane_baba_yaga: 5, plane_astrozoinker: 5 }[this.jetType] || 2;
    const extraLife = Math.min(upgrades.extra_life || 0, 1); // max 1 boost/game
    this.maxLives = Math.min(baseLives + extraLife, CFG.maxLivesBase);
    this.lives    = this.maxLives;

    // Flares
    const baseFlares = { starter: 1, plane_hamud: 2, plane_walla_yofi: 3, plane_very_scary: 4, plane_negev: 5, plane_baba_yaga: 7, plane_astrozoinker: 9 }[this.jetType] || 1;
    this.maxFlares = baseFlares + Math.min(upgrades.extra_flare || 0, 1);
    this.flares    = this.maxFlares;

    // Shield charges
    // KILLAJET + VERY SCARY JET start with one shield; MAGEN grants an extra backup.
    const jetShieldBase = { plane_astrozoinker: 7, plane_baba_yaga: 4, plane_negev: 3, plane_very_scary: 2, plane_walla_yofi: 1 }[this.jetType] || 0;
    this.shieldCharges = jetShieldBase + (upgrades.magen ? 1 : 0) + Math.min(upgrades.extra_shield || 0, 1);
    this.shieldUp      = false; // must be deployed manually

    // Weapon modes — all stackable
    this.hasLaser  = false; // LAZER PEW removed — only via ? boost now
    this.hasShplit  = !!(upgrades.shplit);
    this.hasTripple = !!(upgrades.tripple_threat);

    // Fire rate — stack both multipliers if both owned (x1.5 * x3 = x4.5)
    const fireMults = { plane_walla_yofi: 1.3, plane_very_scary: 1.5, plane_negev: 1.7, plane_baba_yaga: 1.8, plane_astrozoinker: 2 };
    const mult = fireMults[this.jetType] || 1;
    const baseFireRate = Math.floor(22 / mult);
    let rateDiv = 1;
    if (upgrades.pew_pew_15) rateDiv *= 1.5;
    if (upgrades.pew_pew_3)  rateDiv *= 3;
    this.fireRate = Math.max(Math.floor(baseFireRate / rateDiv), 4);

    // Rockets
    const baseRockets = { starter: 0, plane_hamud: 2, plane_walla_yofi: 3, plane_very_scary: 4, plane_negev: 6, plane_baba_yaga: 8, plane_astrozoinker: 11 }[this.jetType] || 0;
    const extraRocket = Math.min(upgrades.extra_rocket || 0, 1); // max 1 boost/game
    const kurwaBonus  = upgrades.kurwa_raketa ? 2 : 0;
    this.rocketAmmo   = baseRockets + extraRocket + kurwaBonus;
    this.rocketCooldown = 0;
    this.rocketRate   = 90;
    this.smartRocket  = !!(upgrades.smart_rocket);

    // Upgrades for in-game effects
    this.hasMagnet      = !!(upgrades.jew_method);
    this.hasCollector   = !!(upgrades.collector);
    this.hasAce         = !!(upgrades.ace_upgrade);
    this.hasLuckyBstrd  = !!(upgrades.lucky_bstrd);
    this.luckyBstrdUsed = 0;
    this.hasZepZep      = !!(upgrades.zep_zep_zep);
    this.hasHornetAssistant = !!(upgrades.hornet_assistant);

    // Skin
    this.skinId   = upgrades.skinId   || null;
    this.skinColor = upgrades.skin_color  || null;
    this.accent   = upgrades.skin_accent || null;

    // Default colors per jet (skin overrides these)
    const jetDefaults = {
      starter:          '#eeeeff',
      plane_hamud:      '#eeeeff',
      plane_walla_yofi: '#3399ff',
      plane_negev: '#88aa44',
      plane_baba_yaga: '#663399',
      plane_very_scary: '#bb44ff',
      plane_astrozoinker: '#00eeff',
    };
    this.color = this.skinColor || jetDefaults[this.jetType] || '#eeeeff';

    this.golden = !!(upgrades.golden_plane);
    this.radius = this.golden ? 18 : 14;
    this.thrustColor = upgrades.thrustColor || '#ff6600';
    this.bulletShape = upgrades.bulletShape || 'default';
    this.bulletColor = upgrades.bulletColor || '#ff2200';
    this.rocketSkinColor = upgrades.rocketSkinColor || null; // overrides smart rocket blue
    this.fireCooldown = 0;
    this.thrusting    = false;
    this.tempLaserUntil      = 0;
    this.tempPinkBeamUntil   = 0;
    this.tempRapidUntil      = 0;
    this.tempPowerBoostUntil = 0;
    this.tempStarUntil       = 0;
    this.tempMonsterFuelUntil = 0;
    this.tempRamboUntil      = 0;
    this.starShieldLayers    = 0;
    this.fireballReady       = false;
    this.superRaketaReady    = false;
    this.spawnProtection     = 180; // 3 seconds at 60fps — immune to damage on spawn
    this.bobTimer = 0;
  }

  update(keys, W, H) {
    this.bobTimer++;
    if (this.ripFuryActive) this.shieldUp = true; // Rip n Dip: auto red shield
    if (this.spawnProtection > 0) this.spawnProtection--;
    if (this.invincible) {
      this.invTimer--; this.blinkTimer++;
      if (this.invTimer <= 0) this.invincible = false;
    }

    const mf = this.tempMonsterFuelUntil > 0;
    const wheelActive = keys.left || keys.right || (keys.joyActive && (keys.joyMag || 0) > 0.05);
    const mfSpeed = mf && wheelActive; // x3 speed only while using wheel, then back to normal
    const rotMult = mf ? 3 : 1;
    let thrustMult = mfSpeed ? 3 : 1;
    if (keys.ctrl) thrustMult *= 2; // PC: Ctrl = x2 thrust
    if (keys.joyActive && keys.joyAngle !== null) {
      this.angle = keys.joyAngle;
      const boostMult = keys.up ? 3 : 1;
      const power = CFG.thrustPower * (keys.joyMag || 0) * boostMult * thrustMult;
      this.thrusting = keys.up;
      if (power > 0) {
        const tx = Math.cos(keys.joyAngle) * power;
        const ty = Math.sin(keys.joyAngle) * power;
        this.vx += tx; this.vy += ty;
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 0.3) {
          const want = Math.atan2(ty, tx);
          const cur  = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const align = mfSpeed ? 0.8 : 0.25;
          const nang = cur + diff * align;
          this.vx = Math.cos(nang) * spd;
          this.vy = Math.sin(nang) * spd;
        }
      }
    } else {
      if (keys.left)  this.angle -= CFG.rotSpeed * rotMult;
      if (keys.right) this.angle += CFG.rotSpeed * rotMult;
      const thrustOn = keys.up; // PC passes keys.up=true for always-on thrust
      this.thrusting = thrustOn;
      if (thrustOn) {
        this.vx += Math.cos(this.angle) * CFG.thrustPower * thrustMult;
        this.vy += Math.sin(this.angle) * CFG.thrustPower * thrustMult;
      }
    }
    const spd = Math.hypot(this.vx, this.vy);
    const baseMax = this.golden ? 6 : (keys.up ? 5.5 : 3.8);
    const max = mfSpeed ? baseMax * 3 : baseMax;
    if (spd > max) { this.vx = (this.vx / spd) * max; this.vy = (this.vy / spd) * max; }
    const friction = mfSpeed ? 0.98 : CFG.friction;
    this.vx *= friction; this.vy *= friction;
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.rocketCooldown > 0) this.rocketCooldown--;
  }

  _getColor() {
    if (this.golden) return C.golden;
    if (this.skinId === 'skin_beast') return rainbowColor(this.bobTimer, 1);
    if (this.skinId === 'skin_acid')  return acidColor(this.bobTimer);
    if (this.skinId === 'skin_zion')  return zionColor(this.bobTimer);
    if (this.skinId === 'skin_inferno') return infernoColor(this.bobTimer);
    if (this.skinId === 'skin_crimson') return crimsonColor(this.bobTimer);
    if (this.skinId === 'skin_scizo')  return rainbowColor(this.bobTimer, 2.5);
    if (this.skinId === 'skin_chuck_norris') return CAMO.stroke;
    return this.color;
  }

  draw(ctx) {
    if (this.invincible && this.blinkTimer % 6 < 3) return;
    const col = this._getColor();
    const sz  = this.golden ? 18 : 14;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    const glowStr = this.golden ? 20 : (this.skinId === 'skin_silver_surfer' ? 22 : 12);
    glow(ctx, col, glowStr);

    if (this.jetType === 'starter') {
      this._drawStarter(ctx, col, sz);
    } else if (this.jetType === 'plane_hamud') {
      this._drawHamud(ctx, col, sz);
    } else if (this.jetType === 'plane_walla_yofi') {
      this._drawWallaYofi(ctx, col, sz);
    } else if (this.jetType === 'plane_very_scary') {
      this._drawVeryScary(ctx, col, sz);
    } else if (this.jetType === 'plane_astrozoinker') {
      this._drawAstrozoinker(ctx, col, sz);
    } else if (this.jetType === 'plane_negev') {
      this._drawNegev(ctx, col, sz);
    } else if (this.jetType === 'plane_baba_yaga') {
      this._drawBabaYaga(ctx, col, sz);
    } else {
      this._drawStarter(ctx, col, sz);
    }

    // Spawn protection: subtle white blink only (no green level-transition ring)
    if (this.spawnProtection > 0 && Math.floor(this.spawnProtection / 12) % 2 === 0) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, sz + 10, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Shield ring
    if (this.shieldUp) {
      ctx.strokeStyle = '#00aaff';
      glow(ctx, '#00aaff', 16);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, sz + 8, 0, TAU); ctx.stroke();
    }

    // Monster Fuel — auto white glowing shield
    if (this.tempMonsterFuelUntil > 0) {
      const pulse = 0.6 + Math.sin(this.bobTimer * 0.2) * 0.4;
      glow(ctx, '#ffffff', 22 * pulse);
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * pulse})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, sz + 10, 0, TAU); ctx.stroke();
    }

    // Fireball ready — pulsing orange glow on nose
    if (this.fireballReady) {
      const pulse = Math.sin(this.bobTimer * 0.25) * 0.4 + 0.7;
      glow(ctx, '#ff6600', 22 * pulse);
      ctx.fillStyle = `rgba(255,100,0,${0.5 * pulse})`;
      ctx.beginPath(); ctx.arc(0, -sz, 8, 0, TAU); ctx.fill();
    }

    if (this.isStarOverdrive) {
      const starPulse = 0.6 + Math.sin(this.bobTimer * 0.25) * 0.4;
      glow(ctx, '#33ff88', 30 * starPulse);
      ctx.strokeStyle = `rgba(50,255,140,${0.65 + 0.25 * starPulse})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, sz + 11, 0, TAU); ctx.stroke();
      if (this.starShieldLayers > 0) {
        ctx.strokeStyle = `rgba(130,255,190,${0.55 + 0.25 * starPulse})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.arc(0, 0, sz + 17, 0, TAU); ctx.stroke();
      }
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  _drawStarter(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth   = this.golden ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.55, sz * 0.6);
    ctx.lineTo(0, sz * 0.3);
    ctx.lineTo(-sz * 0.55, sz * 0.6);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    // Accent crossbar + tip dot
    glow(ctx, accentCol, 8);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.38, sz * 0.15); ctx.lineTo(sz * 0.38, sz * 0.15);
    ctx.stroke();
    ctx.fillStyle = accentCol;
    ctx.beginPath(); ctx.arc(0, -sz * 0.7, sz * 0.08, 0, Math.PI * 2); ctx.fill();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawHamud(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    // Body
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.45, sz * 0.3);
    ctx.lineTo(0, sz * 0.2);
    ctx.lineTo(-sz * 0.45, sz * 0.3);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    // Wings — accent colored
    glow(ctx, accentCol, 10);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.45, sz * 0.3);
    ctx.lineTo(-sz * 1.1, sz * 0.5);
    ctx.lineTo(-sz * 0.5, sz * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sz * 0.45, sz * 0.3);
    ctx.lineTo(sz * 1.1, sz * 0.5);
    ctx.lineTo(sz * 0.5, sz * 0.6);
    ctx.stroke();
    // Cockpit stripe in main color
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.35, 0); ctx.lineTo(sz * 0.35, 0);
    ctx.stroke();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawWallaYofi(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    // Sleeker fuselage
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.1);
    ctx.lineTo(sz * 0.35, sz * 0.1);
    ctx.lineTo(sz * 0.5, sz * 0.6);
    ctx.lineTo(0, sz * 0.35);
    ctx.lineTo(-sz * 0.5, sz * 0.6);
    ctx.lineTo(-sz * 0.35, sz * 0.1);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    // Delta wings — accent colored
    glow(ctx, accentCol, 10);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.35, sz * 0.1);
    ctx.lineTo(-sz * 1.2, sz * 0.45);
    ctx.lineTo(-sz * 0.5, sz * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sz * 0.35, sz * 0.1);
    ctx.lineTo(sz * 1.2, sz * 0.45);
    ctx.lineTo(sz * 0.5, sz * 0.6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Glowing cockpit
    const glowColor = accentCol;
    ctx.fillStyle = `${glowColor}55`;
    glow(ctx, glowColor, 14);
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.35, sz * 0.2, sz * 0.3, 0, 0, TAU); ctx.fill();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawVeryScary(ctx, col, sz) {
    const camo = this.skinId === 'skin_chuck_norris';
    const purp = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : purp;

    // Engine glow aura
    glow(ctx, purp, 22);
    ctx.strokeStyle = purp + '44'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, sz * 0.3, sz * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Delta-body fill
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.05);
    ctx.lineTo(sz * 0.55, sz * 0.35);
    ctx.lineTo(0, sz * 0.55);
    ctx.lineTo(-sz * 0.55, sz * 0.35);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); } else { ctx.fillStyle = purp + '22'; ctx.fill(); }

    // Main fuselage outline
    glow(ctx, purp, 14);
    ctx.strokeStyle = purp; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.05);
    ctx.lineTo(sz * 0.55, sz * 0.35);
    ctx.lineTo(sz * 0.22, sz * 0.6);
    ctx.lineTo(0, sz * 0.45);
    ctx.lineTo(-sz * 0.22, sz * 0.6);
    ctx.lineTo(-sz * 0.55, sz * 0.35);
    ctx.closePath(); ctx.stroke();

    // Spine line
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff66';
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.05); ctx.lineTo(0, sz * 0.45);
    ctx.stroke();

    // Swept delta wings (very wide)
    glow(ctx, purp, 10);
    ctx.strokeStyle = purp; ctx.lineWidth = 1.8;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.55, sz * 0.35);
      ctx.lineTo(side * sz * 1.55, sz * 0.65);
      ctx.lineTo(side * sz * 1.1,  sz * 0.85);
      ctx.lineTo(side * sz * 0.22, sz * 0.6);
      ctx.closePath(); ctx.stroke();
      // Canard fins at front
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.18, -sz * 0.5);
      ctx.lineTo(side * sz * 0.7, -sz * 0.05);
      ctx.lineTo(side * sz * 0.55, sz * 0.1);
      ctx.closePath(); ctx.stroke();
    });

    // Missile pods under wings
    glow(ctx, '#ff4488', 14);
    ctx.strokeStyle = '#ff4488'; ctx.lineWidth = 1.2;
    [-1, 1].forEach(side => {
      const wx = side * sz * 1.0, wy = sz * 0.55;
      // missile body
      ctx.beginPath();
      ctx.moveTo(wx, wy - sz * 0.22);
      ctx.lineTo(wx + side * sz * 0.08, wy + sz * 0.14);
      ctx.lineTo(wx - side * sz * 0.06, wy + sz * 0.14);
      ctx.closePath(); ctx.stroke();
      // missile glow tip
      glow(ctx, '#ff8800', 8);
      ctx.fillStyle = '#ff440088';
      ctx.beginPath(); ctx.arc(wx, wy - sz * 0.22, sz * 0.05, 0, Math.PI * 2); ctx.fill();
    });

    // Cockpit glow
    glow(ctx, '#aaffff', 10);
    ctx.fillStyle = '#aaffff33';
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.55, sz * 0.12, sz * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#aaffff88'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.55, sz * 0.12, sz * 0.2, 0, 0, Math.PI * 2); ctx.stroke();

    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, purp, sz);
  }

  _drawAstrozoinker(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    // Hybrid: sharp starter nose, hamud wings, walla body lines, scary angular fins — intimidating
    glow(ctx, strokeCol, 20);
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2.2;
    // Sharp pointed nose (starter-inspired, more aggressive)
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.15);
    ctx.lineTo(sz * 0.5, sz * 0.25);
    ctx.lineTo(sz * 0.25, sz * 0.55);
    ctx.lineTo(0, sz * 0.35);
    ctx.lineTo(-sz * 0.25, sz * 0.55);
    ctx.lineTo(-sz * 0.5, sz * 0.25);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    // Widened swept wings (hamud + very scary hybrid)
    glow(ctx, accentCol, 12);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.8;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.5, sz * 0.25);
      ctx.lineTo(side * sz * 1.4, sz * 0.7);
      ctx.lineTo(side * sz * 1.0, sz * 0.9);
      ctx.lineTo(side * sz * 0.25, sz * 0.55);
      ctx.closePath();
      if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
      ctx.stroke();
      // Canard spike (scary)
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.2, -sz * 0.6);
      ctx.lineTo(side * sz * 0.65, sz * 0.05);
      ctx.lineTo(side * sz * 0.5, sz * 0.2);
      ctx.closePath();
      ctx.stroke();
    });
    // Spine + crossbar (starter + walla)
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.15); ctx.lineTo(0, sz * 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-sz * 0.35, sz * 0.1); ctx.lineTo(sz * 0.35, sz * 0.1);
    ctx.stroke();
    // Cockpit glow
    glow(ctx, accentCol, 12);
    ctx.fillStyle = accentCol + '44';
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.4, sz * 0.14, sz * 0.22, 0, 0, TAU); ctx.fill();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawNegev(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    glow(ctx, strokeCol, 16);
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.05);
    ctx.lineTo(sz * 0.48, sz * 0.35);
    ctx.lineTo(sz * 0.3, sz * 0.6);
    ctx.lineTo(0, sz * 0.4);
    ctx.lineTo(-sz * 0.3, sz * 0.6);
    ctx.lineTo(-sz * 0.48, sz * 0.35);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    glow(ctx, accentCol, 10);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.6;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.48, sz * 0.35);
      ctx.lineTo(side * sz * 1.25, sz * 0.6);
      ctx.lineTo(side * sz * 0.85, sz * 0.75);
      ctx.lineTo(side * sz * 0.3, sz * 0.6);
      ctx.closePath();
      if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
      ctx.stroke();
    });
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -sz * 1.05); ctx.lineTo(0, sz * 0.4); ctx.stroke();
    glow(ctx, accentCol, 8);
    ctx.fillStyle = accentCol + '44';
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.45, sz * 0.15, sz * 0.24, 0, 0, TAU); ctx.fill();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawBabaYaga(ctx, col, sz) {
    const ac = this.accent || col;
    const camo = this.skinId === 'skin_chuck_norris';
    const strokeCol = camo ? CAMO.stroke : col;
    const accentCol = camo ? CAMO.olive : ac;
    glow(ctx, strokeCol, 24);
    ctx.strokeStyle = strokeCol; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.2);
    ctx.lineTo(sz * 0.55, sz * 0.3);
    ctx.lineTo(sz * 0.35, sz * 0.65);
    ctx.lineTo(0, sz * 0.5);
    ctx.lineTo(-sz * 0.35, sz * 0.65);
    ctx.lineTo(-sz * 0.55, sz * 0.3);
    ctx.closePath();
    if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
    ctx.stroke();
    glow(ctx, accentCol, 14);
    ctx.strokeStyle = accentCol; ctx.lineWidth = 1.9;
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.55, sz * 0.3);
      ctx.lineTo(side * sz * 1.5, sz * 0.7);
      ctx.lineTo(side * sz * 1.15, sz * 0.95);
      ctx.lineTo(side * sz * 0.35, sz * 0.65);
      ctx.closePath();
      if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * sz * 0.2, -sz * 0.65);
      ctx.lineTo(side * sz * 0.72, sz * 0);
      ctx.lineTo(side * sz * 0.55, sz * 0.15);
      ctx.closePath();
      if (camo) { ctx.fillStyle = getCamoPattern(ctx); ctx.fill(); }
      ctx.stroke();
    });
    ctx.strokeStyle = camo ? (CAMO.olive + '88') : '#ff666688'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -sz * 1.2); ctx.lineTo(0, sz * 0.5); ctx.stroke();
    glow(ctx, camo ? accentCol : '#ff8888', 12);
    ctx.fillStyle = camo ? (accentCol + '33') : '#ff666633';
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.55, sz * 0.16, sz * 0.26, 0, 0, TAU); ctx.fill();
    if (camo) drawCamoStar(ctx, sz);
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawFlame(ctx, col, sz) {
    if (!this.thrusting) return;
    const flameSz = rng(6, 10);
    let flameCol = this.thrustColor || (this.golden ? C.golden : '#ff6600');
    if (flameCol === 'aurora') flameCol = auroraColor(this.bobTimer);
    else if (flameCol === 'spectrum') flameCol = spectrumColor(this.bobTimer);
    else if (flameCol === 'spectrum_fast') flameCol = spectrumColor(this.bobTimer * 3);
    ctx.strokeStyle = this.golden ? C.golden : flameCol;
    glow(ctx, flameCol, 16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.25, sz * 0.55);
    ctx.lineTo(0, sz * 0.55 + flameSz);
    ctx.lineTo(sz * 0.25, sz * 0.55);
    ctx.stroke();
  }

  canFire() { return this.fireCooldown <= 0; }
  get isStarOverdrive() { return this.tempStarUntil > 0; }
  get effectiveLaser() { return this.tempLaserUntil > 0 || this.tempPinkBeamUntil > 0; }
  get isPinkBeam()    { return this.tempPinkBeamUntil > 0; }
  get effectiveFireRate() {
    if (this.ripFuryActive) return Math.max(Math.floor(this.fireRate / 3), 2);
    if (this.isStarOverdrive) return Math.max(Math.floor(this.fireRate / 2), 2);
    if (this.tempRapidUntil > 0) return Math.max(Math.floor(this.fireRate / 3), 2);
    if (this.tempMonsterFuelUntil > 0) return Math.max(Math.floor(this.fireRate / 3), 2);
    return this.fireRate;
  }

  fire(bullets, fireballs, megaRaketas) {
    if (!this.canFire()) return;
    // Super Raketa — fires a green rocket that splits into 6 homing minis
    if (this.superRaketaReady && megaRaketas) {
      this.superRaketaReady = false;
      this.fireCooldown = 20;
      const nose = { x: this.x + Math.cos(this.angle) * 20, y: this.y + Math.sin(this.angle) * 20 };
      const sr = new MegaRaketa(nose.x, nose.y, this.angle, true); // green rocket, 6 minis
      megaRaketas.push(sr);
      SFX.rocketFire();
      return;
    }
    // Fireball overrides everything — consume it on next shot
    if (this.fireballReady) {
      this.fireballReady = false;
      this.fireCooldown = 20;
      const nose = { x: this.x + Math.cos(this.angle) * 20, y: this.y + Math.sin(this.angle) * 20 };
      if (fireballs) fireballs.push(new Fireball(nose.x, nose.y, this.angle));
      SFX.rocketFire();
      return;
    }
    this.fireCooldown = this.effectiveFireRate;
    const nose = { x: this.x + Math.cos(this.angle) * 16, y: this.y + Math.sin(this.angle) * 16 };
    // Star overdrive: MEGA RAKETA — big rocket that splits into 7 mini homing rockets
    // Override cooldown so rockets fire ~once per second regardless of fire upgrades
    if (this.isStarOverdrive && megaRaketas) {
      this.fireCooldown = Math.max(this.fireRate, 55);
      megaRaketas.push(new MegaRaketa(nose.x, nose.y, this.angle));
      SFX.rocketFire();
      return;
    }

    if (this.effectiveLaser) {
      const pink = this.isPinkBeam;
      let laserColor = this.isStarOverdrive ? '#b45cff' : (this.tempMonsterFuelUntil > 0 ? '#ffffff' : (this.bulletColor || null));
      if (laserColor === 'aurora') laserColor = auroraColor(this.bobTimer);
      else if (laserColor === 'spectrum') laserColor = spectrumColor(this.bobTimer);
      else if (laserColor === 'spectrum_fast') laserColor = spectrumColor(this.bobTimer * 3);
    if (this.hasTripple && this.hasShplit) {
      // laser + triple + shplit: 6 pink/laser beams
      [-0.22, 0, 0.22].forEach(spread => {
        const perp = (this.angle + spread) + Math.PI / 2;
        const ox = Math.cos(perp) * 9, oy = Math.sin(perp) * 9;
        bullets.push(new Laser(nose.x + ox, nose.y + oy, this.angle + spread, pink, laserColor));
        bullets.push(new Laser(nose.x - ox, nose.y - oy, this.angle + spread, pink, laserColor));
      });
    } else if (this.hasTripple) {
      [-0.22, 0, 0.22].forEach(spread =>
        bullets.push(new Laser(nose.x, nose.y, this.angle + spread, pink, laserColor)));
    } else if (this.hasShplit) {
      const perp = this.angle + Math.PI / 2;
      const ox = Math.cos(perp) * 10, oy = Math.sin(perp) * 10;
      bullets.push(new Laser(nose.x + ox, nose.y + oy, this.angle, pink, laserColor));
      bullets.push(new Laser(nose.x - ox, nose.y - oy, this.angle, pink, laserColor));
    } else {
      bullets.push(new Laser(nose.x, nose.y, this.angle, pink, laserColor));
    }
    SFX.laser();
    return;
  }

    let bcol = this.ripFuryActive ? rainbowColor(this.bobTimer, 3) : (this.tempMonsterFuelUntil > 0 ? '#ffffff' : this.bulletColor);
    if (bcol === 'aurora') bcol = auroraColor(this.bobTimer);
    else if (bcol === 'spectrum') bcol = spectrumColor(this.bobTimer);
    else if (bcol === 'spectrum_fast') bcol = spectrumColor(this.bobTimer * 3);
    if (this.hasTripple && this.hasShplit) {
      // shplit + triple = 6 bullets: 2 parallel per direction
      [-0.22, 0, 0.22].forEach(spread => {
        const perp = (this.angle + spread) + Math.PI / 2;
        const ox = Math.cos(perp) * 8, oy = Math.sin(perp) * 8;
        bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle + spread, this.golden, bcol, this.bulletShape));
        bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle + spread, this.golden, bcol, this.bulletShape));
      });
      SFX.shoot();
    } else if (this.hasTripple) {
      [-0.22, 0, 0.22].forEach(spread =>
        bullets.push(new Bullet(nose.x, nose.y, this.angle + spread, this.golden, bcol, this.bulletShape)));
      SFX.shoot();
    } else if (this.hasShplit) {
      const perp = this.angle + Math.PI / 2;
      const ox = Math.cos(perp) * 10, oy = Math.sin(perp) * 10;
      bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle, this.golden, bcol, this.bulletShape));
      bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle, this.golden, bcol, this.bulletShape));
      SFX.shoot();
    } else {
      bullets.push(new Bullet(nose.x, nose.y, this.angle, this.golden, bcol, this.bulletShape));
      SFX.shoot();
    }
  }

  fireRocket(bullets, forceSalvo = false) {
    if (this.rocketAmmo <= 0) {
      new FloatingText(this.x, this.y - 30, 'NO ROCKETS!', '#ff4444');
      return false;
    }
    if (!forceSalvo && this.rocketCooldown > 0) return false;
    this.rocketAmmo--;
    this.rocketCooldown = forceSalvo ? 0 : this.rocketRate;
    const nose = { x: this.x + Math.cos(this.angle) * 16, y: this.y + Math.sin(this.angle) * 16 };
    bullets.push(new PlayerRocket(nose.x, nose.y, this.angle, this.smartRocket, false, this.rocketSkinColor));
    SFX.rocketFire();
    return true;
  }

  deployShield() {
    if (this.shieldCharges <= 0) {
      new FloatingText(this.x, this.y - 30, 'NO SHIELD!', '#ff4444');
      return;
    }
    if (this.shieldUp) return; // already up
    this.shieldCharges--;
    this.shieldUp = true;
    SFX.mysteryPickup();
    _updateShieldHUD(this.shieldCharges);
  }

  useFlare(rockets, particles, orangeRockets) {
    if (this.flares <= 0) {
      new FloatingText(this.x, this.y - 30, 'NO FLARES!', '#ff6600');
      return;
    }
    this.flares--;
    SFX.flare();
    for (let i = rockets.length - 1; i >= 0; i--) {
      burst(particles, rockets[i].x, rockets[i].y, C.flare, 10, 4);
      rockets.splice(i, 1);
    }
    // Flare also deflects orange homing rockets — glitter animation
    if (orangeRockets) {
      for (let i = orangeRockets.length - 1; i >= 0; i--) {
        orangeRockets[i].deflect(particles);
        orangeRockets.splice(i, 1);
      }
    }
  }

  hit(particles) {
    if (this.invincible || this.spawnProtection > 0) return false;
    if (this.tempMonsterFuelUntil > 0) return false; // Monster Fuel white shield absorbs hit
    if (this.starShieldLayers > 0) {
      this.starShieldLayers--;
      this.invincible = true;
      this.invTimer = 50;
      burst(particles, this.x, this.y, '#33ff88', 16, 3, 22);
      return false;
    }
    if (this.shieldUp) {
      this.shieldUp = false;
      this.invincible = true;
      this.invTimer = 60;
      SFX.shieldBreak();
      return false;
    }
    burst(particles, this.x, this.y, this.golden ? C.golden : this.color, 20, 4, 40);
    if (this.lives === 1 && this.hasLuckyBstrd && this.luckyBstrdUsed < 2 && Math.random() < 0.7) {
      this.luckyBstrdUsed++;
      new FloatingText(this.x, this.y - 30, 'LUCKY!', '#ffcc00');
      this.invincible = true;
      this.invTimer  = Math.floor(CFG.invincibleMs / 16);
      this.blinkTimer = 0;
      this.vx = 0; this.vy = 0;
      return false;
    }
    this.lives--;
    SFX.playerHit();
    if (this.lives <= 0) { this.alive = false; return true; }
    this.invincible = true;
    this.invTimer   = Math.floor(CFG.invincibleMs / 16);
    this.blinkTimer = 0;
    this.vx = 0; this.vy = 0;
    return false;
  }

}

// ── FriendlyJet (HORNET ASSISTANT) — invincible wingman for 20 sec ────────────
class FriendlyJet {
  constructor(x, y, ship) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = Math.atan2(ship.y - y, ship.x - x); // same convention as Ship: forward = (cos,sin)
    this.timer = 20 * 60; // 20 seconds at 60fps
    this.fireCooldown = 0;
    this.fireRate = Math.floor(22 / 6); // 6x fire rate
    this.rocketCooldown = 0;
    this.rocketRate = 60 * 1.5; // 1.5 sec between rockets
    this.skinId = ship.skinId || null;
    this.skinColor = ship.skinColor || ship.color;
    this.accent = ship.accent || '#ffffff';
    this.radius = 14;
    this.ship = ship;
    this.bobTimer = 0;
  }
  _nearestTarget(g) {
    let best = null; let bestD = 9999;
    const check = (arr) => {
      if (!arr) return;
      arr.forEach(t => {
        const d = dist(this, t);
        if (d < bestD && d < 400) { bestD = d; best = t; }
      });
    };
    check(g.asteroids);
    check(g.redFighters);
    check(g.yellowAliens);
    check(g.orangeRockets);
    return best;
  }
  update(g) {
    this.timer--;
    if (this.timer <= 0) return;
    this.bobTimer++;
    // Move toward player fast — strong wingman
    const dx = g.ship.x - this.x, dy = g.ship.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const wantDist = 80;
    if (d > wantDist + 15) {
      const pull = 0.18 * Math.min(1, (d - wantDist) / 60);
      this.vx += (dx / d) * pull;
      this.vy += (dy / d) * pull;
    } else if (d < wantDist - 15) {
      this.vx -= (dx / d) * 0.08;
      this.vy -= (dy / d) * 0.08;
    }
    this.vx *= 0.96; this.vy *= 0.96;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > 6.5) { this.vx = (this.vx / spd) * 6.5; this.vy = (this.vy / spd) * 6.5; }
    this.x = wrap(this.x + this.vx, 0, g.W);
    this.y = wrap(this.y + this.vy, 0, g.H);
    // Face nearest target (or player) — same angle convention as Ship: forward = (cos(angle), sin(angle))
    const t = this._nearestTarget(g);
    const tx = t ? t.x : g.ship.x, ty = t ? t.y : g.ship.y;
    this.angle = Math.atan2(ty - this.y, tx - this.x);
    // Double cannons — 4 bullets (2 pairs), 4x fire rate
    if (this.fireCooldown > 0) this.fireCooldown--;
    else if (t) {
      const nose = { x: this.x + Math.cos(this.angle) * 12, y: this.y + Math.sin(this.angle) * 12 };
      const perp = this.angle + Math.PI / 2;
      const ox = Math.cos(perp) * 10, oy = Math.sin(perp) * 10;
      const spread = 0.08;
      g.bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle - spread, true));
      g.bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle + spread, true));
      g.bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle - spread, true));
      g.bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle + spread, true));
      this.fireCooldown = this.fireRate;
    }
    // Rockets every 1.5 sec — fire 2 at once (homing)
    if (this.rocketCooldown > 0) this.rocketCooldown--;
    else {
      const nose = { x: this.x + Math.cos(this.angle) * 14, y: this.y + Math.sin(this.angle) * 14 };
      const spread = 0.15;
      g.playerRockets.push(new PlayerRocket(nose.x, nose.y, this.angle - spread, false));
      g.playerRockets.push(new PlayerRocket(nose.x, nose.y, this.angle + spread, false));
      this.rocketCooldown = this.rocketRate;
    }
  }
  draw(ctx) {
    if (this.timer <= 0) return;
    const col = this.skinId === 'skin_zion' ? zionColor(this.bobTimer) : this.skinColor;
    const ac = this.accent;
    const sz = this.radius;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2); // same as Ship: nose points (cos(angle), sin(angle))
    glow(ctx, col, 14);
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.55, sz * 0.6);
    ctx.lineTo(0, sz * 0.3);
    ctx.lineTo(-sz * 0.55, sz * 0.6);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = ac; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.38, sz * 0.15); ctx.lineTo(sz * 0.38, sz * 0.15);
    ctx.stroke();
    ctx.fillStyle = ac;
    ctx.beginPath(); ctx.arc(0, -sz * 0.7, sz * 0.08, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
  get dead() { return this.timer <= 0; }
}

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, golden = false, customColor = null, shape = 'default') {
    this.x = x; this.y = y;
    const spd = CFG.bulletSpeed + (golden ? 3 : 0);
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.life = CFG.bulletLife;
    this.golden = golden;
    this.customColor = customColor;
    this.shape = shape;
    this.radius = 3;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    const col = this.golden ? C.golden : (this.customColor || C.bullet);
    glow(ctx, col, 10);
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.shape === 'heart') {
      ctx.beginPath();
      ctx.moveTo(0, this.radius * 0.3);
      ctx.bezierCurveTo(0, -this.radius, this.radius * 2, -this.radius * 0.5, 0, this.radius);
      ctx.bezierCurveTo(-this.radius * 2, -this.radius * 0.5, 0, -this.radius, 0, this.radius * 0.3);
      ctx.fill();
    } else if (this.shape === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU / 5) - Math.PI / 2;
        const r = i % 2 === 0 ? this.radius * 1.4 : this.radius * 0.6;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    } else if (this.shape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.2);
      ctx.lineTo(this.radius, 0);
      ctx.lineTo(0, this.radius * 1.2);
      ctx.lineTo(-this.radius, 0);
      ctx.closePath(); ctx.fill();
    } else if (this.shape === 'bolt') {
      ctx.beginPath();
      ctx.moveTo(this.radius * 0.2, -this.radius * 1.3);
      ctx.lineTo(this.radius * 1.1, -this.radius * 0.2);
      ctx.lineTo(this.radius * 0.15, -this.radius * 0.15);
      ctx.lineTo(-this.radius * 0.4, this.radius * 1.25);
      ctx.lineTo(-this.radius * 0.9, this.radius * 0.35);
      ctx.lineTo(-this.radius * 0.15, this.radius * 0.1);
      ctx.closePath(); ctx.fill();
    } else if (this.shape === 'shard') {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.45);
      ctx.lineTo(this.radius * 1.05, this.radius * 0.35);
      ctx.lineTo(this.radius * 0.45, this.radius * 0.9);
      ctx.lineTo(-this.radius * 0.35, this.radius * 1.0);
      ctx.lineTo(-this.radius * 0.85, -this.radius * 0.25);
      ctx.closePath(); ctx.fill();
    } else if (this.shape === 'arrow') {
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.2);
      ctx.lineTo(this.radius * 0.8, this.radius * 0.8);
      ctx.lineTo(this.radius * 0.3, this.radius * 0.3);
      ctx.lineTo(this.radius * 0.3, this.radius * 1.2);
      ctx.lineTo(-this.radius * 0.3, this.radius * 1.2);
      ctx.lineTo(-this.radius * 0.3, this.radius * 0.3);
      ctx.lineTo(-this.radius * 0.8, this.radius * 0.8);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Laser ─────────────────────────────────────────────────────────────────────
class Laser {
  constructor(x, y, angle, pink = false, customColor = null) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.pink  = pink;
    this.customColor = customColor;
    this.len   = pink ? 160 : 80;
    this.life  = pink ? Math.floor(CFG.laserLife * 1.8) : CFG.laserLife;
    this.vx    = Math.cos(angle) * (pink ? 20 : 14);
    this.vy    = Math.sin(angle) * (pink ? 20 : 14);
    this.radius = pink ? 6 : (customColor ? 3 : 4);
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    const col = this.pink ? '#ff00ee' : (this.customColor || C.laser);
    const width = this.pink ? 6 : (this.customColor ? 2.5 : 3);
    glow(ctx, col, this.pink ? 22 : (this.customColor ? 10 : 16));
    ctx.strokeStyle = col; ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(this.angle) * this.len, this.y - Math.sin(this.angle) * this.len);
    ctx.stroke();
    if (this.pink) {
      // outer bloom — toned down
      glow(ctx, '#ff88ff', 10);
      ctx.strokeStyle = '#ff88ff28'; ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - Math.cos(this.angle) * this.len, this.y - Math.sin(this.angle) * this.len);
      ctx.stroke();
      // inner white core
      glow(ctx, '#ffffff', 6);
      ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - Math.cos(this.angle) * this.len * 0.7, this.y - Math.sin(this.angle) * this.len * 0.7);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Fireball ──────────────────────────────────────────────────────────────────
class Fireball {
  constructor(x, y, angle) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 3.5;
    this.vy = Math.sin(angle) * 3.5;
    this.angle = angle;
    this.life   = 60; // 1 second fuse
    this.radius = 22;
    this.pulse  = 0;
    this.dead   = false;
    this.exploded = false;
  }
  update(W, H) {
    this.pulse++;
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
    if (this.life <= 0 && !this.exploded) this.exploded = true;
  }
  draw(ctx) {
    const pct  = 1 - this.life / 60;
    const r    = this.radius * (1 + Math.sin(this.pulse * 0.35) * 0.12);
    ctx.save();
    // Outer aura
    glow(ctx, '#ff4400', 36 + pct * 20);
    // Gradient ball
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    grad.addColorStop(0,   '#ffffff');
    grad.addColorStop(0.25,'#ffff88');
    grad.addColorStop(0.6, '#ff6600');
    grad.addColorStop(1,   'rgba(255,30,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(this.x, this.y, r * 1.6, 0, TAU); ctx.fill();
    // Fuse ring grows red as detonation nears
    ctx.beginPath(); ctx.arc(this.x, this.y, r + 6 + pct * 14, 0, TAU);
    ctx.strokeStyle = `rgba(255,${Math.floor(180 - pct * 180)},0,${0.3 + pct * 0.6})`;
    ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
class Asteroid {
  constructor(x, y, size = 'large', angle = null, level = 1) {
    this.x = x; this.y = y;
    this.size = size;
    this.level = level;
    this.radius = CFG.asteroidSizes[size];
    const speedMult = 0.65 + Math.min(level - 1, 15) * 0.035;
    const baseSpd = size === 'large' ? rng(0.40, 0.80) : size === 'medium' ? rng(0.70, 1.20) : rng(1.10, 1.80);
    const spd = baseSpd * speedMult;
    const ang = angle !== null ? angle : rng(0, TAU);
    this.vx = Math.cos(ang) * spd;
    this.vy = Math.sin(ang) * spd;
    this.rotSpeed = rng(-0.02, 0.02);
    this.rotation = rng(0, TAU);
    this.points = this._genPoints();
    this.score = CFG.asteroidScores[size];
  }
  _genPoints() {
    const n = rngInt(6, 9), pts = [];
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i;
      const d = rng(this.radius * 0.6, this.radius);
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    return pts;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.rotation += this.rotSpeed;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
    glow(ctx, C.asteroid, 10);
    ctx.strokeStyle = C.asteroid; ctx.fillStyle = C.asteroidFill; ctx.lineWidth = 1.5;
    ctx.beginPath();
    this.points.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
  split(particles) {
    burst(particles, this.x, this.y, C.asteroid, 8, 2.5, 25);
    if (this.size === 'large')  { SFX.explodeLarge(); return [new Asteroid(this.x, this.y, 'medium', null, this.level), new Asteroid(this.x, this.y, 'medium', null, this.level)]; }
    if (this.size === 'medium') { SFX.explodeMed();   return [new Asteroid(this.x, this.y, 'small', null, this.level),  new Asteroid(this.x, this.y, 'small', null, this.level)];  }
    SFX.explodeSmall();
    return [];
  }
}

// ── Red Fighter ───────────────────────────────────────────────────────────────
class RedFighter {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = 0;
    this.speed  = 1.2;
    this.shootTimer = 0;
    this.shootRate  = 70;   // frames between each shot
    this._totalShots = 0;
    this._maxShots   = 6;   // fire 6 shots total then flee
    this._fleeing    = false;
    this.health = 3;
    this.radius = 14;
    this.bobTimer = 0;
    this.dead = false;
  }
  update(ship, bullets, W, H, _particles) {
    this.bobTimer++;

    if (this._fleeing) {
      // Accelerate away from player and fly off-screen
      const awayAng = Math.atan2(this.y - ship.y, this.x - ship.x);
      this.vx += Math.cos(awayAng) * 0.22;
      this.vy += Math.sin(awayAng) * 0.22;
      const spd = Math.hypot(this.vx, this.vy);
      const maxSpd = 4.0;
      if (spd > maxSpd) { this.vx = (this.vx / spd) * maxSpd; this.vy = (this.vy / spd) * maxSpd; }
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < -100 || this.x > W + 100 || this.y < -100 || this.y > H + 100) {
        this.dead = true;
      }
      return;
    }

    const dx = ship.x - this.x, dy = ship.y - this.y;
    this.angle = Math.atan2(dy, dx);
    this.vx += Math.cos(this.angle) * 0.13;
    this.vy += Math.sin(this.angle) * 0.13;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > this.speed) { this.vx = (this.vx / spd) * this.speed; this.vy = (this.vy / spd) * this.speed; }
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);

    if (this._totalShots >= this._maxShots) {
      this._fleeing = true;
      new FloatingText(this.x, this.y - 24, 'JET FLEEING!', '#ff8888');
      return;
    }

    this.shootTimer++;
    if (this.shootTimer >= this.shootRate) {
      this.shootTimer = 0;
      this._totalShots++;
      const nose = { x: this.x + Math.cos(this.angle) * 18, y: this.y + Math.sin(this.angle) * 18 };
      bullets.push(new EnemyBullet(nose.x, nose.y, this.angle, '#ff3333'));
      SFX.enemyShoot();
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y); ctx.rotate(this.angle + Math.PI / 2);
    glow(ctx, C.enemyRed, 14);
    ctx.strokeStyle = C.enemyRed; ctx.fillStyle = '#110000'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -16); ctx.lineTo(10, 8); ctx.lineTo(5, 2);
    ctx.lineTo(0, 10); ctx.lineTo(-5, 2); ctx.lineTo(-10, 8);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = `rgba(255,80,0,${0.4 + 0.3 * Math.sin(this.bobTimer * 0.2)})`;
    ctx.beginPath(); ctx.arc(0, 9, 4, 0, TAU); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  }
  hit(particles) {
    burst(particles, this.x, this.y, C.enemyRed, 8, 3, 20);
    this.health--;
    if (this.health <= 0) SFX.enemyDie();
    return this.health <= 0;
  }
}

// ── Yellow Alien ──────────────────────────────────────────────────────────────
class YellowAlien {
  constructor(x, y) {
    this.x = x; this.y = y;
    const ang = rng(0, TAU);
    this.vx = Math.cos(ang) * rng(1.4, 2.4);
    this.vy = Math.sin(ang) * rng(1.4, 2.4);
    this.angle = 0;
    this.swoops = 0; this.health = 1; // one-shot
    this.radius = 16; this.bobTimer = 0;
    this.dead = false;
  }
  update(_bullets, W, H, _particles) {
    this.bobTimer++;
    this.x += this.vx; this.y += this.vy;
    // Wrap horizontally (counts as a swoop)
    if (this.x < -20) { this.x = W + 20; this.swoops++; }
    if (this.x > W + 20) { this.x = -20; this.swoops++; }
    // Bounce vertically — use Math.abs to avoid rapid re-trigger at edges
    if (this.y < 40)      { this.y = 40;      this.vy =  Math.abs(this.vy); }
    if (this.y > H - 40)  { this.y = H - 40;  this.vy = -Math.abs(this.vy); }
    // Soft horizontal push away from near-edge zones (while still on screen)
    if (this.x > 0 && this.x < W) {
      if (this.x < 60)     this.vx =  Math.abs(this.vx);
      if (this.x > W - 60) this.vx = -Math.abs(this.vx);
    }
    // aliens stay until killed — no auto-expiry
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.bobTimer * 0.04) * 4);
    glow(ctx, '#00ff66', 16);
    ctx.strokeStyle = '#00ff66'; ctx.fillStyle = '#110f00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -5, 10, 7, 0, Math.PI, TAU); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const lx = (i - 2) * 7;
      const on = Math.floor(this.bobTimer / 8 + i) % 2 === 0;
      ctx.fillStyle = on ? '#00ff66' : '#005522';
      ctx.beginPath(); ctx.arc(lx, 1, 2, 0, TAU); ctx.fill();
    }
    ctx.restore(); ctx.shadowBlur = 0;
  }
  hit(particles) {
    burst(particles, this.x, this.y, C.enemyYellow, 8, 3, 20);
    this.health--;
    if (this.health <= 0) SFX.enemyDie();
    return this.health <= 0;
  }
}

// ── Enemy Bullet ──────────────────────────────────────────────────────────────
class EnemyBullet {
  constructor(x, y, angle, color = '#ff3333') {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 4.2; this.vy = Math.sin(angle) * 4.2;
    this.life = 70; this.color = color; this.radius = 4;
  }
  update(W, H) { this.x = wrap(this.x + this.vx, 0, W); this.y = wrap(this.y + this.vy, 0, H); this.life--; }
  draw(ctx) {
    glow(ctx, this.color, 10);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Coin Pickup ───────────────────────────────────────────────────────────────
class CoinPickup {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 12; this.life = 300; }
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
    ctx.globalAlpha = pulse;
    glow(ctx, '#ffdd00', 14);
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.fillStyle = '#332200'; ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('$', this.x, this.y + 1);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Mystery Pickup ────────────────────────────────────────────────────────────
class MysteryPickup {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 14; this.life = 420; }
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.01) * 0.25 + 0.75;
    ctx.globalAlpha = pulse;
    glow(ctx, '#aa00ff', 16);
    ctx.fillStyle = '#220033';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#aa00ff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#ff00ff'; ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', this.x, this.y + 1);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Monster Fuel Pickup (energy drink — x3 speed + white shield 10 sec) ──────
class MonsterFuelPickup {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 18; this.life = 300; }
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.012) * 0.3 + 0.75;
    ctx.globalAlpha = pulse;
    glow(ctx, '#ffffff', 24);
    glow(ctx, '#e8e8ff', 18);
    // Retro energy-drink can shape (Monster-style, no logo): tall slim can, glowing white
    const w = 10, h = 22;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    // Can body — rounded rect (slim vertical)
    const r = 3, x = -w, y = -h * 0.4, bw = w * 2, bh = h;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bw - r, y);
    ctx.arcTo(x + bw, y, x + bw, y + r, r);
    ctx.lineTo(x + bw, y + bh - r);
    ctx.arcTo(x + bw, y + bh, x + bw - r, y + bh, r);
    ctx.lineTo(x + r, y + bh);
    ctx.arcTo(x, y + bh, x, y + bh - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.fill();
    ctx.stroke();
    // Lid/top — trapezoid cap
    ctx.beginPath();
    ctx.moveTo(-w * 0.7, -h * 0.4);
    ctx.lineTo(w * 0.7, -h * 0.4);
    ctx.lineTo(w * 0.5, -h * 0.55);
    ctx.lineTo(-w * 0.5, -h * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Center stripe (retro accent)
    ctx.fillStyle = 'rgba(200,220,255,0.6)';
    ctx.fillRect(-2, -h * 0.35, 4, h * 0.7);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Green Star Booster Pickup ─────────────────────────────────────────────────
class GreenStarPickup {
  constructor(x, y) { this.x = x; this.y = y; this.radius = 15; this.life = 180; } // 3 sec
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.015) * 0.3 + 0.75;
    ctx.globalAlpha = pulse;
    glow(ctx, '#33ff88', 26);
    ctx.fillStyle = '#113322';
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#44ff99'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#55ff99';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('*', this.x, this.y + 1);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Enemy Rocket ──────────────────────────────────────────────────────────────
class Rocket {
  constructor(x, y, angle) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * CFG.rocketSpeed;
    this.vy = Math.sin(angle) * CFG.rocketSpeed;
    this.angle = angle; this.life = 180; this.radius = 5; // 3-second max life
    this.tailTimer = 0; this._expired = false;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--; this.tailTimer++;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle + Math.PI / 2);
    glow(ctx, C.rocket, 14); ctx.strokeStyle = C.rocket; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#ff6600'; glow(ctx, '#ff6600', 10);
    ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(0, 4 + rng(4, 8)); ctx.lineTo(2, 4); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
  get dead() {
    if (this.life <= 0 && !this._expired) { this._expired = true; SFX.rocketExplode(); }
    return this.life <= 0;
  }
}

// ── Player Rocket ─────────────────────────────────────────────────────────────
class PlayerRocket {
  constructor(x, y, angle, smart = false, mini = false, rocketSkinColor = null) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.smart = smart;
    this.mini  = mini;
    this.rocketSkinColor = rocketSkinColor; // overrides smart rocket blue when set
    this.isPlayerRocket = true;
    this._dead = false;
    this._kills    = 0;
    this._cooldown = 0;

    if (mini) {
      // Mini rockets from MegaRaketa split — fast, small, single proximity detonation
      this.speed      = 4.2;
      this.proximityR = 24;
      this.blastR     = 32;
      this._maxKills  = 1;
      this.radius     = 3;
      this.life       = 260;
    } else {
      this.speed = 3.2;
      // Normal: home to 1 target → proximity fuse → small blast (may catch nearby targets)
      // Smart:  direct-hit pierce → no blast per kill, big final explosion on 5th kill
      this.proximityR = smart ? 0   : 32;  // normal detonates at 32px proximity
      this.blastR     = smart ? 110 : 52;  // normal small blast, smart huge final blast
      this._maxKills  = smart ? 5 : 1;     // normal: 1 detonation then done
      this.radius     = 5;
      this.life       = 420;
    }
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
  }

  destroy() { this._dead = true; }

  // Normal rocket: called after each proximity detonation
  afterDetonate() {
    this._kills++;
    this._cooldown = 40;
    if (this._kills >= this._maxKills) {
      this._dead = true;
    } else {
      this.life = Math.max(this.life, 240);
    }
  }

  // Smart rocket: called on direct hit of each target
  // Returns true when it should finally explode (5th kill)
  smartHit() {
    this._kills++;
    this._cooldown = 18; // brief pause so it doesn't multi-hit same target
    this.life = Math.max(this.life, 240);
    return this._kills >= this._maxKills; // true = time to detonate
  }

  get readyToDetonate() { return !this._dead && this._cooldown <= 0; }

  update(W, H, targets = [], ship = null, rocketIndex = 0) {
    if (this._cooldown > 0) this._cooldown--;

    // Pick target: smart rockets each get a different target (by threat rank); normal rockets all chase highest threat
    if (targets.length > 0 && ship) {
      const sorted = [...targets].sort((a, b) => _rocketThreatScore(b, ship) - _rocketThreatScore(a, ship));
      const idx = this.smart ? (rocketIndex % sorted.length) : 0;
      const bestTarget = sorted[idx] || null;
      if (bestTarget) {
        const ta = Math.atan2(bestTarget.y - this.y, bestTarget.x - this.x);
        let da = ta - this.angle;
        while (da >  Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        this.angle += da * 0.09; // responsive turning
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
      }
    } else if (targets.length > 0) {
      // Fallback: nearest target if ship not available
      const sorted = [...targets].sort((a, b) => dist(this, a) - dist(this, b));
      const idx = this.smart ? (rocketIndex % sorted.length) : 0;
      const nearest = sorted[idx] || null;
      if (nearest) {
        const ta = Math.atan2(nearest.y - this.y, nearest.x - this.x);
        let da = ta - this.angle;
        while (da >  Math.PI) da -= TAU;
        while (da < -Math.PI) da += TAU;
        this.angle += da * 0.09;
        this.vx = Math.cos(this.angle) * this.speed;
        this.vy = Math.sin(this.angle) * this.speed;
      }
    }
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }

  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle + Math.PI / 2);
    const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 75);
    if (this.mini) {
      const col = this._fromSuperRaketa ? '#00ff44' : '#ff2200';
      ctx.shadowColor = col; ctx.shadowBlur = 10 * pulse;
      ctx.strokeStyle = this._fromSuperRaketa ? '#00ff88' : '#ff3300'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(2,3); ctx.lineTo(-2,3); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = this._fromSuperRaketa ? '#66ffaa' : '#ffaa00';
      ctx.beginPath(); ctx.moveTo(-1,3); ctx.lineTo(0, 3+rng(2,6)); ctx.lineTo(1,3); ctx.stroke();
    } else {
      const baseCol = this.smart && this.rocketSkinColor
        ? (typeof this.rocketSkinColor === 'string' && this.rocketSkinColor.startsWith('#')
            ? this.rocketSkinColor
            : this.rocketSkinColor === 'spectrum'
              ? spectrumColor(Date.now() / 80)
              : this.rocketSkinColor === 'aurora'
                ? auroraColor(Date.now() / 80)
                : '#0077ff')
        : this.smart ? '#0077ff' : '#ff6600';
      const col  = this.smart && this.rocketSkinColor ? baseCol : (this.smart ? '#0077ff' : '#ff6600');
      const col2 = this.smart && this.rocketSkinColor ? baseCol : (this.smart ? '#44aaff' : '#ff8800');
      const col3 = this.smart && this.rocketSkinColor ? baseCol : (this.smart ? '#aaddff' : '#ffee00');
      ctx.shadowColor = col; ctx.shadowBlur = 32 * pulse;
      let r;
      if (this.smart && this.rocketSkinColor) {
        r = (baseCol.startsWith('#') ? _hexToRgba(baseCol, 0.38 * pulse) : baseCol);
      } else {
        r = this.smart ? `rgba(0,119,255,${0.38 * pulse})` : `rgba(255,110,0,${0.35 * pulse})`;
      }
      ctx.strokeStyle = r;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.stroke();
      glow(ctx, col, 18); ctx.strokeStyle = col2; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.stroke();
      ctx.strokeStyle = col3; glow(ctx, col3, 12);
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(0, 4 + rng(4, 9)); ctx.lineTo(2, 4); ctx.stroke();
    }
    ctx.restore(); ctx.shadowBlur = 0;
  }

  get dead() { return this.life <= 0 || this._dead; }
}

// ── MegaRaketa (star-overdrive special weapon) ────────────────────────────────
// A big red rocket that flies straight for ~0.75 s then bursts into 7 mini homing rockets.
class MegaRaketa {
  constructor(x, y, angle, isSuper = false) {
    this.x = x; this.y = y;
    this.angle = angle;
    this._isSuperRaketa = isSuper;
    this.speed = 3.0;
    this.vx = Math.cos(angle) * this.speed;
    this.vy = Math.sin(angle) * this.speed;
    this.radius = 10;
    this.life   = isSuper ? 60 : 50; // super: 1 sec, normal: ~0.83 s
    this.dead   = false;
    this.isMegaRaketa = true;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
    if (this.life <= 0) this.dead = true; // game loop handles split on death
  }
  draw(ctx) {
    const green = this._isSuperRaketa;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    const p = 0.7 + 0.3 * Math.sin(Date.now() / 45);
    ctx.shadowColor = green ? '#00ff44' : '#ff2200'; ctx.shadowBlur = 34 * p;
    ctx.strokeStyle = green ? `rgba(0,255,80,${0.45*p})` : `rgba(255,60,0,${0.45 * p})`; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(7,9); ctx.lineTo(-7,9); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = green ? '#00ff44' : '#ff3300'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(7,9); ctx.lineTo(-7,9); ctx.closePath(); ctx.stroke();
    ctx.shadowColor = green ? '#ccff00' : '#ffaa00'; ctx.shadowBlur = 12;
    ctx.strokeStyle = green ? '#ccff00' : '#ffcc00'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(7,9); ctx.lineTo(-7,9); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = green ? '#00ff88' : '#ff8800';
    ctx.beginPath(); ctx.moveTo(-4,9); ctx.lineTo(0, 9 + rng(10,20)); ctx.lineTo(4,9); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

// ── Orange Homing Rocket (enemy) ──────────────────────────────────────────────
class OrangeHomingRocket {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 1.8;
    this.lifeTimer = 0;
    this.fuseTime = 300; // 5 seconds
    this.radius = 9;
    this.dead = false;
    this._exploded = false;
  }
  update(ship, W, H, particles) {
    this.lifeTimer++;
    // Home toward player
    const dx = ship.x - this.x;
    const dy = ship.y - this.y;
    const targetAngle = Math.atan2(dy, dx);
    let da = targetAngle - this.angle;
    while (da >  Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    this.angle += da * 0.05;
    this.vx = Math.cos(this.angle) * this.speed;
    this.vy = Math.sin(this.angle) * this.speed;
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    // Fuse expired → explode
    if (this.lifeTimer >= this.fuseTime) this._explode(particles);
  }
  _explode(particles) {
    if (this._exploded) return;
    this._exploded = true;
    burst(particles, this.x, this.y, '#ff7700', 26, 5, 45);
    SFX.rocketExplode();
    this.dead = true;
  }
  // Called when killed by flare — glitter burst then die
  deflect(particles) {
    if (this._exploded) return;
    this._exploded = true;
    const col = ['#ffee00','#ffcc00','#ffffaa','#ff8800'][Math.floor(Math.random() * 4)];
    burst(particles, this.x, this.y, col, 20, 4, 28);
    this.dead = true;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    // Body
    glow(ctx, '#ff7700', 20);
    ctx.fillStyle = '#331100'; ctx.strokeStyle = '#ff7700'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Fuse ring (grows red as fuse runs down)
    const pct = this.lifeTimer / this.fuseTime;
    ctx.beginPath(); ctx.arc(0, 0, 7 + pct * 7, 0, TAU);
    ctx.strokeStyle = `rgba(255,${Math.floor(120 - pct*120)},0,${0.35 + pct * 0.55})`;
    ctx.lineWidth = 1.5; ctx.stroke();
    // Flame
    glow(ctx, '#ff4400', 12);
    ctx.strokeStyle = '#ff4400'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(0, 6 + rng(5, 11)); ctx.lineTo(3, 6); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
}

// ── Arcade Wave 10 Boss (big gold alien, easy, troll) ─────────────────────────
class BigBossAlien {
  constructor(x, y, W, opts = {}) {
    this.x = x; this.y = y;
    this.W = W;
    this.vx = opts.vx ?? 0.3;
    this.vy = opts.vy ?? 0.4;
    this.health = Math.max(1, Number(opts.health ?? 6));
    this.maxHealth = this.health;
    this.radius = 48; this.bobTimer = 0;
    this.dead = false;
    this.shootTimer = 0;
    this.shootRate = Math.max(18, Math.floor(opts.shootRate ?? 90));
    this.rocketRate = Math.max(45, Math.floor(opts.rocketRate ?? 170));
    this.rocketTimer = 0;
    this.canShootRockets = !!opts.canShootRockets;
    this.color = opts.color ?? '#ffd700';
    this.elite = !!opts.elite; // red+green glow, beefier
    this.redCalm = !!opts.redCalm; // red glowing, no shooting, easy
    /** 'single' | 'split' (2) | 'triple' (3-spread) */
    this.bulletSpread = opts.bulletSpread || 'single';
    this.spawnIFrames = Math.max(0, Math.floor(opts.spawnIFrames ?? 0));
  }
  _bossFireVolley(enemyBullets, ship) {
    const base = Math.atan2(ship.y - this.y, ship.x - this.x);
    const push = (a) => { enemyBullets.push(new EnemyBullet(this.x, this.y, a, '#ffaa00')); };
    if (this.bulletSpread === 'triple') {
      const s = 0.32;
      push(base - s); push(base); push(base + s);
    } else if (this.bulletSpread === 'split') {
      const s = 0.14;
      push(base - s); push(base + s);
    } else {
      push(base);
    }
  }
  update(ship, enemyBullets, W, H, orangeRockets = null) {
    this.bobTimer++;
    if (this.spawnIFrames > 0) this.spawnIFrames--;
    this.x += this.vx; this.y += this.vy;
    if (this.x < 80) { this.x = 80; this.vx = Math.abs(this.vx); }
    if (this.x > W - 80) { this.x = W - 80; this.vx = -Math.abs(this.vx); }
    if (this.y < 60) { this.y = 60; this.vy = Math.abs(this.vy); }
    if (this.y > H - 80) { this.y = H - 80; this.vy = -Math.abs(this.vy); }
    this.shootTimer++;
    if (this.shootTimer >= this.shootRate) {
      this.shootTimer = 0;
      this._bossFireVolley(enemyBullets, ship);
    }
    if (this.canShootRockets && orangeRockets) {
      this.rocketTimer++;
      if (this.rocketTimer >= this.rocketRate) {
        this.rocketTimer = 0;
        orangeRockets.push(new OrangeHomingRocket(this.x, this.y));
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.bobTimer * 0.03) * 6);
    if (this.redCalm) {
      glow(ctx, '#ff2200', 32);
      glow(ctx, '#ff6666', 20);
    } else if (this.elite) {
      glow(ctx, '#ff0000', 28);
      glow(ctx, '#00ff44', 20);
    } else {
      glow(ctx, this.color, 24);
    }
    ctx.strokeStyle = this.color; ctx.fillStyle = '#332200'; ctx.lineWidth = 3;
    ctx.scale(2.2, 2.2);
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -4, 9, 6, 0, Math.PI, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
    const barW = 60; const barH = 6;
    ctx.fillStyle = '#222'; ctx.fillRect(this.x - barW/2, this.y - this.radius - 18, barW, barH);
    ctx.fillStyle = this.health > 2 ? '#ffd700' : '#ff4444';
    ctx.fillRect(this.x - barW/2, this.y - this.radius - 18, barW * (this.health / this.maxHealth), barH);
  }
  hit(particles, dmg = 1) {
    if (this.spawnIFrames > 0) {
      burst(particles, this.x, this.y, '#ffffff', 4, 2, 12);
      return false;
    }
    burst(particles, this.x, this.y, this.color, 12, 4, 30);
    this.health -= Math.max(0.05, Number(dmg) || 0);
    if (this.health <= 0) SFX.enemyDie();
    return this.health <= 0;
  }
}

/** Random spawn position along screen edges (top/right/bottom/left) */
function _randomBossSpawnPos(W, H) {
  const edge = rngInt(0, 3);
  if (edge === 0) return { x: rng(80, W - 80), y: -40 };
  if (edge === 1) return { x: W + 40, y: rng(80, H - 80) };
  if (edge === 2) return { x: rng(80, W - 80), y: H + 40 };
  return { x: -40, y: rng(80, H - 80) };
}

/** Survival & Bossman: tiers easy 1–5, med 6–9, hard 10–13, impossible 14–19, 20+ brutal */
function buildScaledBossOpts(bossIndexDefeated) {
  const n = bossIndexDefeated;
  const bossNum = n + 1;
  const STRONG = 1.65;
  let health = 5 * Math.pow(1.22, n) * STRONG;
  let fireMult = 1 + (0.18 * n);
  const canShootRockets = n >= 1;
  let shootRate = Math.max(14, Math.floor(78 / fireMult));
  let rocketRate = Math.max(45, Math.floor((155 - n * 7) / STRONG));
  let vx = (0.26 + n * 0.012) * STRONG;
  let vy = (0.36 + n * 0.012) * STRONG;
  let elite = false;
  if (bossNum >= 20) {
    health *= 2.6;
    shootRate = Math.max(6, Math.floor(shootRate / 1.8));
    rocketRate = Math.max(20, Math.floor(rocketRate / 1.8));
    vx *= 1.5;
    vy *= 1.5;
    elite = true;
  } else if (bossNum >= 14) {
    health *= 1.85;
    shootRate = Math.max(8, Math.floor(shootRate / 1.4));
    rocketRate = Math.max(28, Math.floor(rocketRate / 1.4));
    vx *= 1.28;
    vy *= 1.28;
    elite = true;
  } else if (bossNum >= 10) {
    health *= 1.55;
    shootRate = Math.max(10, Math.floor(shootRate / 1.25));
    rocketRate = Math.max(35, Math.floor(rocketRate / 1.25));
    vx *= 1.15;
    vy *= 1.15;
  } else if (bossNum >= 6) {
    health *= 1.25;
    shootRate = Math.max(12, Math.floor(shootRate / 1.1));
    rocketRate = Math.max(40, Math.floor(rocketRate / 1.1));
    vx *= 1.08;
    vy *= 1.08;
  }
  return {
    health,
    shootRate: Math.max(6, shootRate),
    canShootRockets,
    rocketRate: Math.max(22, rocketRate),
    vx,
    vy,
    elite,
  };
}

// ── Background ────────────────────────────────────────────────────────────────
const STARS_BG  = Array.from({ length: 55 }, (_, i) => ({ x: (i*173+31)%1000, y: (i*271+97)%1000,  r: 0.35, phase: i*0.37 }));
const STARS_MID = Array.from({ length: 28 }, (_, i) => ({ x: (i*229+61)%1000, y: (i*347+113)%1000, r: i%5===0?1.1:0.7, phase: i*0.61, tint: i%4===0?'#c4aaff':'#ffffff' }));
const STARS_FG  = Array.from({ length: 7  }, (_, i) => ({ x: (i*397+211)%1000, y: (i*503+89)%1000,  r: 1.6, phase: i*1.1 }));

function drawGrid(ctx, W, H, tick) {
  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W*.5, H*.4, 0, W*.5, H*.4, Math.max(W,H)*.9);
  bg.addColorStop(0,'#08001a'); bg.addColorStop(0.5,'#040010'); bg.addColorStop(1,'#020008');
  ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
  const neb = ctx.createRadialGradient(W*.8,H*.15,0,W*.8,H*.15,W*.5);
  neb.addColorStop(0,'rgba(180,0,80,0.055)'); neb.addColorStop(0.5,'rgba(100,0,50,0.02)'); neb.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = neb; ctx.fillRect(0,0,W,H);
  const neb2 = ctx.createRadialGradient(W*.1,H*.85,0,W*.1,H*.85,W*.45);
  neb2.addColorStop(0,'rgba(0,200,160,0.045)'); neb2.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle = neb2; ctx.fillRect(0,0,W,H);
  for (const s of STARS_BG) {
    ctx.globalAlpha = (Math.sin(tick*.008+s.phase)*.15+.85)*.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc((s.x/1000)*W,(s.y/1000)*H,s.r,0,TAU); ctx.fill();
  }
  for (const s of STARS_MID) {
    ctx.globalAlpha = (Math.sin(tick*.011+s.phase)*.25+.75)*(s.r>1?0.55:0.38);
    ctx.fillStyle = s.tint||'#ffffff';
    ctx.beginPath(); ctx.arc((s.x/1000)*W,(s.y/1000)*H,s.r,0,TAU); ctx.fill();
  }
  for (const s of STARS_FG) {
    const sx=(s.x/1000)*W, sy=(s.y/1000)*H;
    ctx.globalAlpha=(Math.sin(tick*.016+s.phase)*.35+.65)*.85;
    ctx.shadowBlur=10; ctx.shadowColor='#ffffff'; ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.arc(sx,sy,s.r,0,TAU); ctx.fill();
  }
  ctx.globalAlpha=1; ctx.shadowBlur=0;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD(ctx, W, H, { score, lives, maxLives, flares, multiplier, multiplierEndMs, rocketAmmo, shieldCharges, scoreX2, ripFuryActive, warnings, xforceCooldownSec, ripCountdownSec, arcadeWave, bossmanKills }) {
  const FONT = '"Press Start 2P", "Courier New", monospace';
  const s = 1;
  const glowCap = (b) => Math.min(b * s, 14); // cap blur to reduce lag

  // Build ordered warning list
  // warnings: { jets, rockets, aliens, asteroids, overdrive, monsterFuel, lowLife }
  const warnLines = [];
  if (warnings?.overdrive)   warnLines.push({ text: 'BEAST MODE',      col: '#33ff88' });
  if (warnings?.monsterFuel) warnLines.push({ text: 'MONSTER FUEL',    col: '#ffffff' });
  if (warnings?.jets)       warnLines.push({ text: 'JET INCOMING',    col: '#ff3333' });
  if (warnings?.rockets)    warnLines.push({ text: 'ROCKET INCOMING', col: '#ff6600' });
  if (warnings?.aliens)     warnLines.push({ text: 'ALIENS!',         col: '#ffee00' });
  if (warnings?.asteroids)  warnLines.push({ text: 'ASTEROID STORM',  col: '#ff8800' });
  if (warnings?.lowLife)    warnLines.push({ text: 'LOW LIFE!',       col: '#ff1111' });

  const panelW = Math.round(168 * s), panelH = Math.round((74 + warnLines.length * 15 + (warnLines.length > 0 ? 4 : 0)) * s);
  ctx.globalAlpha = 0.52;
  ctx.fillStyle = '#080016';
  roundRect(ctx, 6, 6, panelW, panelH, 0); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00ffcc2a'; ctx.lineWidth = s;
  roundRect(ctx, 6, 6, panelW, panelH, 0); ctx.stroke();

  ctx.textAlign = 'left';

  // ── SCORE or WAVE (arcade) or BOSSES KILLED (bossman) ──
  const topValue = bossmanKills != null ? String(bossmanKills) : arcadeWave ? String(arcadeWave) : score.toLocaleString();
  ctx.font = `${Math.round(7 * s)}px ${FONT}`; glow(ctx, C.hud, glowCap(4));
  ctx.fillStyle = '#00ffcc55';
  ctx.fillText(bossmanKills != null ? 'BOSSES' : arcadeWave ? 'WAVE' : 'SCORE', 14, 20 * s);
  ctx.font = `${Math.round(15 * s)}px ${FONT}`; glow(ctx, C.hud, glowCap(8));
  ctx.fillStyle = C.hud;
  ctx.fillText(topValue, 14, 42 * s);
  if (scoreX2 && scoreX2 > 1 && !arcadeWave && bossmanKills == null) {
    ctx.font = `${Math.round(7 * s)}px ${FONT}`; ctx.fillStyle = '#ffee00'; glow(ctx, '#ffee00', glowCap(6));
    const mult = ripFuryActive ? scoreX2 * 10 : scoreX2;
    ctx.fillText(`x${mult}`, 6 + panelW - 28, 20 * s);
  }

  // ── LIVES ──
  const MAX_TRI = 5, lifeBaseY = 63 * s, triStartX = 62 * s, triStep = 14 * s;
  ctx.font = `${Math.round(7 * s)}px ${FONT}`; glow(ctx, C.hud, glowCap(5));
  ctx.fillStyle = '#00ffcc88';
  ctx.fillText('LIFE :', 14, lifeBaseY);
  for (let i = 0; i < MAX_TRI; i++) {
    const lx = triStartX + i * triStep;
    const alive = i < lives;
    ctx.fillStyle   = alive ? '#44ccff' : '#111133';
    ctx.shadowBlur  = alive ? glowCap(8) : 0;
    ctx.shadowColor = '#44ccff';
    ctx.beginPath();
    ctx.moveTo(lx + 5 * s, lifeBaseY - 8 * s);
    ctx.lineTo(lx + 11 * s, lifeBaseY + 2 * s);
    ctx.lineTo(lx, lifeBaseY + 2 * s);
    ctx.closePath(); ctx.fill();
    if (!alive) {
      ctx.strokeStyle = '#222255'; ctx.lineWidth = s;
      ctx.beginPath();
      ctx.moveTo(lx + 5 * s, lifeBaseY - 8 * s);
      ctx.lineTo(lx + 11 * s, lifeBaseY + 2 * s);
      ctx.lineTo(lx, lifeBaseY + 2 * s);
      ctx.closePath(); ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  // ── WARNINGS ──
  const pulse = 0.55 + 0.45 * Math.sin(Date.now() / 240);
  let wy = 78 * s;
  for (const w of warnLines) {
    ctx.font = `${Math.round(7 * s)}px ${FONT}`;
    ctx.globalAlpha = w.col === '#33ff88' ? 0.85 : pulse;
    glow(ctx, w.col, glowCap(10));
    ctx.fillStyle = w.col;
    ctx.fillText(w.text, 14, wy);
    ctx.globalAlpha = 1;
    wy += 15 * s;
  }

  ctx.shadowBlur = 0; ctx.globalAlpha = 1;

  // ── RIGHT-SIDE COUNTERS ──
  const dimAlpha = 0.32, rightX = W - 14 * s;
  ctx.font = `${Math.round(8 * s)}px ${FONT}`;
  ctx.textAlign = 'right';

  ctx.globalAlpha = flares > 0 ? 1 : dimAlpha;
  ctx.fillStyle = C.hudFlare; glow(ctx, C.hudFlare, flares > 0 ? glowCap(6) : 2);
  ctx.fillText(`FLARE ${flares}`, rightX, 24 * s);

  ctx.globalAlpha = rocketAmmo > 0 ? 1 : dimAlpha;
  ctx.fillStyle = '#ffaa00'; glow(ctx, '#ffaa00', rocketAmmo > 0 ? glowCap(6) : 2);
  ctx.fillText(`ROCKET ${rocketAmmo}`, rightX, 42 * s);

  ctx.globalAlpha = shieldCharges > 0 ? 1 : dimAlpha;
  ctx.fillStyle = '#00aaff'; glow(ctx, '#00aaff', shieldCharges > 0 ? glowCap(6) : 2);
  ctx.fillText(`SHLD ${shieldCharges}`, rightX, 60 * s);

  if (xforceCooldownSec !== undefined) {
    ctx.globalAlpha = (xforceCooldownSec === 0 || xforceCooldownSec === -1) ? 1 : dimAlpha;
    const isReady = xforceCooldownSec === 0;
    const isActive = xforceCooldownSec === -1;
    ctx.fillStyle = isActive ? '#ff00ff' : (isReady ? '#ff4444' : '#666666');
    glow(ctx, ctx.fillStyle, (isReady || isActive) ? glowCap(6) : 2);
    ctx.fillText(isActive ? 'X ACTIVE' : (isReady ? 'X READY' : `X ${xforceCooldownSec}s`), rightX, 96 * s);
  }
  if (ripCountdownSec !== undefined && ripCountdownSec > 0) {
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ff00ff';
    glow(ctx, '#ff00ff', glowCap(8));
    ctx.font = `${Math.round(10 * s)}px ${FONT}`;
    ctx.fillText('GET READY FOR RIP N DIP', W / 2, H / 2 - 16);
    ctx.font = `${Math.round(12 * s)}px ${FONT}`;
    ctx.fillText(`- ${ripCountdownSec} SECONDS -`, W / 2, H / 2 + 8);
    ctx.textAlign = 'right';
  }

  ctx.globalAlpha = 1;

  if (multiplier > 1 && !arcadeWave) {
    const remainMs  = Math.max(0, (multiplierEndMs || 0) - Date.now());
    const remainMin = Math.floor(remainMs / 60000);
    const remainSec = Math.floor((remainMs % 60000) / 1000);
    const timeStr   = remainMs > 0 ? `${String(remainMin).padStart(2,'0')}:${String(remainSec).padStart(2,'0')}` : '';
    const mp = 0.7 + 0.3 * Math.sin(Date.now() / 350);
    ctx.globalAlpha = mp;
    ctx.font = `${Math.round(9 * s)}px ${FONT}`; ctx.fillStyle = '#ffee00'; glow(ctx, '#ffee00', glowCap(10));
    ctx.fillText(`${multiplier}x BONUS`, rightX, 78 * s);
    if (timeStr) {
      ctx.font = `${Math.round(7 * s)}px ${FONT}`; ctx.fillStyle = '#ffcc44'; glow(ctx, '#ffcc44', glowCap(4));
      ctx.fillText(timeStr, rightX, 91 * s);
    }
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'left'; ctx.shadowBlur = 0; ctx.lineWidth = 1;
}

// Shield HUD DOM element updater (for mobile shield button)
function _updateShieldHUD(charges) {
  const btn = document.getElementById('ctrl-shield');
  if (btn) {
    btn.textContent = `SHLD ${charges}`;
    btn.style.opacity = charges > 0 ? '1' : '0.35';
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

async function _animateStarOpen(starNum, starEl, wrap) {
  if (!starEl) return;
  starEl.classList.add('star-explode');
  SFX.rocketExplode && SFX.rocketExplode();
  if (wrap) _spawnStarBurst(wrap, starEl);
  await new Promise(r => setTimeout(r, 550));
}

function _spawnStarBurst(wrap, starEl) {
  if (!wrap || !starEl) return;
  const rect = starEl.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const ox = rect.left - wrapRect.left + rect.width / 2;
  const oy = rect.top - wrapRect.top + rect.height / 2;
  const colors = ['#ffdd00', '#ffee00', '#aa00ff', '#6600cc'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'star-burst-particle';
    const angle = (i / 20) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 25 + Math.random() * 45;
    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    p.style.setProperty('--tx', `${tx}px`);
    p.style.setProperty('--ty', `${ty}px`);
    p.style.background = colors[i % colors.length];
    p.style.left = `${ox}px`;
    p.style.top = `${oy}px`;
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

// ── Case Reel (CS:GO style) ───────────────────────────────────────────────────
// ── Gift box animation helpers ─────────────────────────────────────────────────
function _spawnGiftSparks(container, type) {
  const palettes = {
    skin_grant:    ['#cc44ff', '#ff44ff', '#aa00ff'],
    bullet_grant:  ['#00aaff', '#0088ff', '#00ccff'],
    thrust_grant:  ['#ff6600', '#ffaa00', '#ffee00'],
    upgrade_grant: ['#ffd700', '#ffcc00', '#ffaa00'],
    shmips:        ['#ffee00', '#00ffcc', '#ffcc00'],
  };
  const cols = palettes[type] || palettes.shmips;
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('div');
    el.className = 'gift-spark';
    const angle = (i / 16) * Math.PI * 2;
    const d = 40 + Math.random() * 55;
    el.style.setProperty('--dx', `${Math.cos(angle) * d}px`);
    el.style.setProperty('--dy', `${Math.sin(angle) * d}px`);
    el.style.background = cols[i % cols.length];
    el.style.boxShadow  = `0 0 8px ${cols[i % cols.length]}`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }
}

async function _animateGiftOpen(rewardType) {
  const box   = document.getElementById('gift-box');
  const lid   = document.getElementById('gift-lid');
  const sparks = document.getElementById('gift-sparks');
  if (!box) return;
  try { SFX.startGiftMusic && SFX.startGiftMusic(); } catch (_) {}
  // Phase 1 — gentle float wobble (400ms)
  box.classList.remove('gift-idle');
  box.style.transition = 'transform 0.4s'; box.style.transform = 'scale(1.06)';
  await new Promise(r => setTimeout(r, 400));
  // Phase 2 — intense shake (800ms)
  box.style.transform = ''; box.style.transition = '';
  box.classList.add('gift-shake');
  SFX.spinTick && SFX.spinTick();
  await new Promise(r => setTimeout(r, 400));
  box.classList.remove('gift-shake');
  box.classList.add('gift-shake');
  await new Promise(r => setTimeout(r, 500));
  box.classList.remove('gift-shake');
  // Phase 3 — lid flies off + spark burst cascade (1200ms)
  lid.classList.add('gift-lid-open');
  _spawnGiftSparks(sparks, rewardType);
  SFX.rocketExplode && SFX.rocketExplode();
  await new Promise(r => setTimeout(r, 300));
  _spawnGiftSparks(sparks, rewardType);
  await new Promise(r => setTimeout(r, 300));
  _spawnGiftSparks(sparks, rewardType);
  await new Promise(r => setTimeout(r, 400));
  // Phase 4 — glow pulse on body + final burst
  box.style.filter = 'brightness(1.8) drop-shadow(0 0 20px #ff0077)';
  _spawnGiftSparks(sparks, rewardType);
  _spawnGiftSparks(sparks, rewardType);
  await new Promise(r => setTimeout(r, 600));
  box.style.filter = '';
  try { SFX.stopMusic && SFX.stopMusic(); SFX.startMenuMusic && SFX.startMenuMusic(); } catch (_) {}
}

// ── Rocket threat-scoring — higher = intercept this first ─────────────────────
// Considers: enemy type danger, how close to player, and approach vector
function _rocketThreatScore(target, ship) {
  // Base threat by entity type (identified by unique property)
  let base;
  if      (target.fuseTime  !== undefined) base = 1200; // OrangeHomingRocket — actively chasing player
  else if (target.shootRate !== undefined) base =  700; // RedFighter — shoots at player
  else if (target.swoops    !== undefined) base =  350; // YellowAlien
  else                                     base =   80; // Asteroid — passive hazard

  // Proximity to player: enemy right on top of player = critical
  const dPlayer = Math.hypot(target.x - ship.x, target.y - ship.y);
  const proximityScore = 600 / (dPlayer + 40);

  // Approach vector: is the enemy moving TOWARD the player?
  let approachScore = 0;
  const tvx = target.vx ?? 0, tvy = target.vy ?? 0;
  const tSpd = Math.hypot(tvx, tvy);
  if (tSpd > 0) {
    const toPlayerX = ship.x - target.x;
    const toPlayerY = ship.y - target.y;
    const pLen = Math.hypot(toPlayerX, toPlayerY);
    if (pLen > 0) {
      const dot = (tvx * toPlayerX + tvy * toPlayerY) / (tSpd * pLen);
      if (dot > 0) approachScore = dot * 500; // closing in on player
    }
  }

  return base + proximityScore + approachScore;
}

// ── Smart rocket final explosion ──────────────────────────────────────────────
function _doFinalBlast(r, game) {
  burst(game.particles, r.x, r.y, '#2299ff', 40, 6, 65);
  SFX.rocketExplode();
  // Big blue ring
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * TAU;
    game.particles.push(new Particle(r.x + Math.cos(ang) * r.blastR * 0.8, r.y + Math.sin(ang) * r.blastR * 0.8, '#88ccff', 2, 28));
  }
  // Blast everything in final blastR
  for (let ai = game.asteroids.length-1; ai >= 0; ai--) {
    if (dist(r, game.asteroids[ai]) < r.blastR + game.asteroids[ai].radius) {
      const frags = game.asteroids[ai].split(game.particles);
      game._addScore(game.asteroids[ai].score * 2);
      game.asteroids.splice(ai, 1, ...frags);
    }
  }
  for (let ei = game.redFighters.length-1; ei >= 0; ei--) {
    if (dist(r, game.redFighters[ei]) < r.blastR + game.redFighters[ei].radius) {
      burst(game.particles, game.redFighters[ei].x, game.redFighters[ei].y, C.enemyRed, 16, 4, 30);
      SFX.enemyDie(); game._addScore(CFG.enemyRedScore * 2);
      game.redFighters.splice(ei, 1);
    }
  }
  for (let ei = game.yellowAliens.length-1; ei >= 0; ei--) {
    if (dist(r, game.yellowAliens[ei]) < r.blastR + game.yellowAliens[ei].radius) {
      burst(game.particles, game.yellowAliens[ei].x, game.yellowAliens[ei].y, C.enemyYellow, 16, 4, 30);
      SFX.enemyDie(); game._addScore(CFG.enemyYellowScore * 2);
      game.yellowAliens.splice(ei, 1);
    }
  }
  for (let ei = game.orangeRockets.length-1; ei >= 0; ei--) {
    if (dist(r, game.orangeRockets[ei]) < r.blastR + game.orangeRockets[ei].radius) {
      burst(game.particles, game.orangeRockets[ei].x, game.orangeRockets[ei].y, '#ff7700', 12, 3, 25);
      game._addScore(150); game.orangeRockets[ei].dead = true; game.orangeRockets.splice(ei, 1);
    }
  }
}

// ── Main Game Class ───────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    if (!this.canvas) {
      const st = document.getElementById('loading-status');
      if (st) { st.textContent = 'MISSING game-canvas in HTML'; st.style.color = '#ff4466'; }
      throw new Error('game-canvas not found');
    }
    this.ctx    = this.canvas.getContext('2d');
    if (!this.ctx) {
      const st = document.getElementById('loading-status');
      if (st) { st.textContent = '2D Canvas not available'; st.style.color = '#ff4466'; }
      throw new Error('getContext(2d) failed');
    }
    this.W = 0; this.H = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.state    = 'loading';
    this.userData = null;
    this.upgrades = {};
    this.sandboxMode = false; // MEYARET 2 BETA — set in _init from /api/sandbox

    this.ship = null;
    this.asteroids = []; this.bullets = []; this.enemyBullets = [];
    this.rockets = []; this.playerRockets = []; this.fireballs = []; this.particles = [];
    this.redFighters = []; this.yellowAliens = []; this.orangeRockets = []; this.arcadeBosses = [];
    this.coins = []; this.mysteryPickups = []; this.greenStars = []; this.monsterFuels = [];

    this.score = 0; this.level = 1; this.tick = 0; this.paused = false;
    this.activeMultiplier = 1.0;
    this.redFighterTimer = 0; this.yellowAlienTimer = 0; this.orangeRocketTimer = 0;
    this.runShmipsBonus = 0; this.pickupSpawnTimer = 0;
    this.greenStarTimer = rngInt(60 * 90, 60 * 150); // once every 1.5-2.5 min
    this.monsterFuelTimer = rngInt(60 * 120, 60 * 180); // once every 2-3 min

    this.keys = { left:false, right:false, up:false, fire:false, flare:false, rocket:false, shield:false, ctrl:false, xforce:false, joyActive:false, joyAngle:null };
    this._lastFrameTs = 0; this._accum = 0;

    this._bindInputs();
    this._bindKeyboard();
    this._bindUI();
    this._init();
    requestAnimationFrame(ts => this._loop(ts));
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async _init() {
    const bar    = document.getElementById('loading-bar');
    const label  = document.getElementById('loading-label') || { textContent: '' };
    const status = document.getElementById('loading-status');
    const _ss = (msg, color) => { if (status) { status.textContent = msg; status.style.color = color || '#00ffcc'; } };

    try {
      await Promise.race([
        this._initCore(bar, label, status, _ss),
        new Promise((_, rej) => setTimeout(() => rej(new Error('STARTUP TIMEOUT (90s)')), 90_000)),
      ]);
    } catch (err) {
      console.error('[MEYARET] _init error:', err);
      _ss(`STARTUP: ${(err && err.message) ? err.message : String(err)}`.slice(0, 72), '#ff4466');
      await this._sleep(2200);
      this._goOffline(bar, label);
    }
  }

  async _initCore(bar, label, status, _ss) {
    const OPENING_TEXTS = [
      'SYNCING HANGAR...', 'LOADING ROCKETS...', 'CALIBRATING RETRO RADAR...',
      'ARMING CANNONS...', 'INITIALIZING THRUST...', 'SCANNING ASTEROIDS...',
      'BOOTING NEURAL LINK...', 'WARMING ENGINES...', 'CHARGING SHIELDS...',
      'PRIMING FLARES...'
    ];
    const pick = OPENING_TEXTS[Math.floor(Math.random() * OPENING_TEXTS.length)];
    if (bar?.style) bar.style.width = '10%';
    try { SFX.startOpeningMusic && SFX.startOpeningMusic(); } catch (e) { console.warn('[MEYARET] opening music:', e); }
    label.textContent = pick;
    _ss(pick, '#00ffcc');

    const tgUser = await waitForTelegramUser();
    if (tgUser) TG_USER = tgUser;

    const tid = TG_USER?.id;
    const initData = window.Telegram?.WebApp?.initData || INIT_DATA || '';
    const debugMode = typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    if (!tid || !initData) {
      if (debugMode && status) { status.textContent = `sandbox skip: tid=${!!tid} initData=${!!initData}`; await this._sleep(4000); }
    }
    if (tid && initData) {
      const base = API_BASE || window.location.origin;
      const url = `${base}/api/sandbox`;
      fetch(url, { headers: { 'X-Telegram-Init-Data': initData } })
        .then(r => r.ok ? r.json() : null)
        .then(d => { SANDBOX_MODE = !!(d && d.sandbox); this.sandboxMode = SANDBOX_MODE; })
        .catch(() => {});
    }
    const hasWebApp = !!window.Telegram?.WebApp;
    _ss(tid ? 'PILOT LINK ESTABLISHED' : (hasWebApp ? 'WAITING FOR PILOT LINK...' : 'COMM CHANNEL OFFLINE'), tid ? '#00ffcc' : '#ff4466');

    if (!tid) { this._goOffline(bar, label); return; }

    label.textContent = 'SYNCING HANGAR...';
    if (bar?.style) bar.style.width = '40%';
    let data = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        _ss(`SYNCING HANGAR... (${attempt}/3)`,'#ffee00');
        data = await dbGetOrCreateUser(tid);
        break;
      } catch(e) {
        if (attempt < 3) { _ss('RETRYING...','#ff9900'); await this._sleep(600); }
        else { _ss('HANGAR LINK LOST — OFFLINE MODE','#ff4466'); await this._sleep(1200); this._goOffline(bar, label); return; }
      }
    }

    try {
      if (bar?.style) bar.style.width = '85%';
      _ss(`WELCOME ${data.isNew ? 'PILOT' : data.user.nickname}`,'#00ffcc');
      this.userData = data.user;
      const ups = data.upgrades || [];
      const hadLazer = ups.some(u => u.upgrade_id === 'lazer_pew');
      if (hadLazer && !localStorage.getItem('meyaret_lazer_refund_done')) {
        dbRefundLazerPew(tid).then(ref => {
          if (ref) { this.userData.shmips = ref.shmips; localStorage.setItem('meyaret_lazer_refund_done', '1'); }
        }).catch(() => {});
      }
      this._parseUpgrades(ups.filter(u => u.upgrade_id !== 'lazer_pew'));
      if (data.user.multiplier_end && new Date(data.user.multiplier_end) > new Date()) {
        this.activeMultiplier = Number(data.user.multiplier_value);
        this.multiplierEndMs  = new Date(data.user.multiplier_end).getTime();
        this._showMultiplierBanner();
      }
      if (bar?.style) bar.style.width = '100%';
      label.textContent = 'READY FOR LAUNCH';
      await this._sleep(200);
      document.getElementById('loading-screen').style.display = 'none';
      if (data.isNew) {
        const saved = localStorage.getItem('meyaret_callsign');
        if (saved && saved !== 'ACE') {
          this._loadMenu(); this._showScreen('menu');
          dbSaveCallsign(tid, saved).then(u => { this.userData = u; }).catch(() => { this._showScreen('onboarding'); });
        } else { this._showScreen('onboarding'); }
      } else {
        localStorage.setItem('meyaret_callsign', data.user.nickname);
        this._loadMenu(); this._showScreen('menu');
      }
      this.state = 'menu';
    } catch(err) {
      _ss(`DB ERROR: ${err.message}`.slice(0,60),'#ff4466');
      await this._sleep(2500); this._goOffline(bar, label);
    }
  }

  _goOffline(bar, label) {
    OFFLINE_MODE = true;
    if (bar?.style) bar.style.width = '100%';
    if (label) label.textContent = 'OFFLINE';
    const saved = localStorage.getItem('meyaret_callsign');
    this.userData = { ...DEMO_USER, nickname: saved || null };
    this._sleep(2500).then(() => {
      document.getElementById('loading-screen').style.display = 'none';
      if (!saved) { this._showScreen('onboarding'); }
      else {
        this._loadMenu(); this._showScreen('menu');
        const b = document.getElementById('multiplier-banner');
        b.textContent = 'OFFLINE — SCORES NOT SAVED';
        b.style.borderColor = 'var(--magenta)'; b.style.color = 'var(--magenta)';
        b.classList.remove('hidden');
      }
      this.state = 'menu';
    });
  }

  _parseUpgrades(list) {
    this.upgrades = {};
    list.forEach(u => { this.upgrades[u.upgrade_id] = u.quantity; });
  }

  _showMultiplierBanner() {
    const banner = document.getElementById('multiplier-banner');
    banner.textContent = `${this.activeMultiplier}× POINT MULTIPLIER ACTIVE`;
    banner.classList.remove('hidden');
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  _formatRemaining(ms) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ── Screen Management ──────────────────────────────────────────────────────
  _showScreen(name) {
    ['onboarding','menu','profile','gift-4hr','store','arsenal','guide','gameover'].forEach(s => {
      const el = document.getElementById(`${s}-screen`);
      if (el) el.classList.add('hidden');
    });
    this.canvas.style.display = 'none';
    document.getElementById('controls-overlay')?.classList.add('hidden');

    if (name === 'game') {
      this.canvas.style.display = 'block';
      const mb = document.getElementById('multiplier-banner');
      if (mb && this.arcadeMode) mb.classList.add('hidden');
      const ctrl = document.getElementById('controls-overlay');
      if (this._isMobile()) {
        ctrl?.classList.remove('hidden');
        const xfBtn = document.getElementById('ctrl-xforce');
        if (xfBtn) xfBtn.style.display = this._effUpgrades().xforce_lavian ? '' : 'none';
      }
      SFX.startGameMusic(this.level);
    } else {
      const el = document.getElementById(`${name}-screen`);
      if (el) el.classList.remove('hidden');
      SFX.stopOpeningMusic && SFX.stopOpeningMusic();
      SFX.startMenuMusic();
    }
    this.state = name;
  }

  _isMobile() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }
  _isPC() { return !this._isMobile(); }

  _bindKeyboard() {
    const map = (e, down) => {
      if (this.state !== 'game') return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { this.keys.left = down; e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { this.keys.right = down; e.preventDefault(); }
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') { if (!this._isPC()) this.keys.up = down; e.preventDefault(); }
      else if (k === ' ') { this.keys.fire = down; e.preventDefault(); }
      else if (k === 'e' || k === 'E') { this.keys.flare = down; e.preventDefault(); }
      else if (k === 'r' || k === 'R') { this.keys.rocket = down; e.preventDefault(); }
      else if (k === 'q' || k === 'Q') { this.keys.shield = down; e.preventDefault(); }
      else if (k === 'Control') { this.keys.ctrl = down; e.preventDefault(); }
      else if (k === 'x' || k === 'X') { this.keys.xforce = down; e.preventDefault(); }
    };
    window.addEventListener('keydown', e => map(e, true));
    window.addEventListener('keyup', e => map(e, false));
  }

  // ── UI Binding ─────────────────────────────────────────────────────────────
  _bindUI() {
    const unlockOnce = () => { SFX.unlock(); document.removeEventListener('touchstart', unlockOnce); document.removeEventListener('mousedown', unlockOnce); };
    document.addEventListener('touchstart', unlockOnce, { once: true });
    document.addEventListener('mousedown',  unlockOnce, { once: true });
    document.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') SFX.btnClick(); });

    document.getElementById('callsign-confirm').addEventListener('click', () => this._submitCallsign());
    document.getElementById('callsign-input').addEventListener('keydown', e => { if (e.key === 'Enter') this._submitCallsign(); });

    document.getElementById('btn-play').addEventListener('click',    () => this._showModeSelect());
    document.getElementById('btn-gift').addEventListener('click',   () => this._openGift());
    document.getElementById('btn-store').addEventListener('click',   () => this._openStore());
    document.getElementById('btn-arsenal').addEventListener('click', () => this._openArsenal());
    document.getElementById('btn-guide').addEventListener('click',   () => this._openGuide());
    document.getElementById('btn-quit').addEventListener('click',    () => { if (tg) tg.close(); });
    document.getElementById('profile-btn').addEventListener('click', () => this._openProfile());
    document.getElementById('leaderboard-strip').addEventListener('click', () => this._showTop5Popup());
    document.getElementById('btn-weekly-top3')?.addEventListener('click', () => this._showWeeklyPopup());
    document.getElementById('weekly-close')?.addEventListener('click', () => document.getElementById('weekly-modal')?.classList.add('hidden'));
    document.getElementById('weekly-modal')?.querySelector('.top5-backdrop')?.addEventListener('click', () => document.getElementById('weekly-modal')?.classList.add('hidden'));

    const modeModal = document.getElementById('mode-select-modal');
    if (modeModal) {
      document.getElementById('btn-mode-survival')?.addEventListener('click', () => { modeModal.classList.add('hidden'); this._startGame('survival'); });
      document.getElementById('btn-mode-arcade')?.addEventListener('click', () => { modeModal.classList.add('hidden'); this._startGame('arcade'); });
      document.getElementById('btn-mode-bossman')?.addEventListener('click', () => { modeModal.classList.add('hidden'); this._startGame('bossman'); });
      document.getElementById('mode-select-close')?.addEventListener('click', () => modeModal.classList.add('hidden'));
      modeModal.querySelector('.top5-backdrop')?.addEventListener('click', () => modeModal.classList.add('hidden'));
    }

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      const applyVolUi = (mode) => {
        muteBtn.classList.toggle('low', mode==='low'); muteBtn.classList.toggle('muted', mode==='mute');
        const labels = { high: 'VOL HIGH', med: 'VOL MED', low: 'VOL LOW', mute: 'VOL MUTE' };
        muteBtn.textContent = labels[mode] || 'VOL HIGH'; muteBtn.title = `Volume: ${mode}`;
      };
      applyVolUi(SFX.getVolumeMode());
      muteBtn.addEventListener('click', () => applyVolUi(SFX.cycleVolume()));
    }

    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.back || 'menu';
        if (target === 'menu') this._loadMenu();
        this._showScreen(target);
      });
    });

    document.getElementById('spin-btn').addEventListener('click', () => this._doOpenGift());
    document.getElementById('arsenal-open-store').addEventListener('click', () => this._openStore());

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._lastStoreTab = btn.dataset.tab;
        this._renderStoreTab(btn.dataset.tab);
      });
    });

    document.getElementById('go-play-again').addEventListener('click', () => this._startGame(this._lastGameMode || 'survival'));
    document.getElementById('go-menu').addEventListener('click', () => { this._loadMenu(); this._showScreen('menu'); });
  }

  _bindInputs() {
    const joyBase = document.getElementById('vjoy-base');
    const joyKnob = document.getElementById('vjoy-knob');
    const applyJoy = (cx2, cy2) => {
      const rect = joyBase.getBoundingClientRect();
      const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
      const dx=cx2-cx, dy=cy2-cy, d=Math.hypot(dx,dy);
      const maxR=rect.width/2-6, dead=maxR*0.12, ang=Math.atan2(dy,dx);
      const clampedD=Math.min(d,maxR);
      joyKnob.style.transform=`translate(calc(-50% + ${Math.cos(ang)*clampedD}px), calc(-50% + ${Math.sin(ang)*clampedD}px))`;
      if(d<dead){
        this.keys.joyAngle=null; this.keys.joyActive=false; this.keys.joyMag=0;
        this.keys.left=this.keys.right=false;
      } else {
        this.keys.joyAngle=ang; this.keys.joyActive=true;
        // magnitude: 0 just past deadzone → 1 at full push (eased with sqrt for sensitivity)
        this.keys.joyMag=Math.sqrt(Math.min((d-dead)/(maxR-dead),1));
        this.keys.left=this.keys.right=false;
      }
    };
    const resetJoy = () => { joyKnob.style.transform='translate(-50%,-50%)'; this.keys.joyAngle=null;this.keys.joyActive=false;this.keys.left=this.keys.right=false; };
    if (joyBase) {
      let joyId=null;
      joyBase.addEventListener('touchstart',e=>{e.preventDefault();if(joyId!==null)return;const t=e.changedTouches[0];joyId=t.identifier;applyJoy(t.clientX,t.clientY);},{passive:false});
      joyBase.addEventListener('touchmove',e=>{e.preventDefault();for(let i=0;i<e.changedTouches.length;i++){if(e.changedTouches[i].identifier===joyId){applyJoy(e.changedTouches[i].clientX,e.changedTouches[i].clientY);break;}}},{passive:false});
      const endJoy=e=>{e.preventDefault();for(let i=0;i<e.changedTouches.length;i++){if(e.changedTouches[i].identifier===joyId){joyId=null;resetJoy();break;}}};
      joyBase.addEventListener('touchend',endJoy,{passive:false});
      joyBase.addEventListener('touchcancel',endJoy,{passive:false});
      let jd=false;
      joyBase.addEventListener('mousedown',e=>{jd=true;applyJoy(e.clientX,e.clientY);});
      joyBase.addEventListener('mousemove',e=>{if(jd)applyJoy(e.clientX,e.clientY);});
      joyBase.addEventListener('mouseup',()=>{jd=false;resetJoy();});
      joyBase.addEventListener('mouseleave',()=>{jd=false;resetJoy();});
    }

    const bindAction = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      let tid=null;
      el.addEventListener('touchstart',e=>{e.preventDefault();if(tid!==null)return;tid=e.changedTouches[0].identifier;this.keys[key]=true;},{passive:false});
      const end=e=>{e.preventDefault();for(let i=0;i<e.changedTouches.length;i++){if(e.changedTouches[i].identifier===tid){tid=null;this.keys[key]=false;break;}}};
      el.addEventListener('touchend',end,{passive:false}); el.addEventListener('touchcancel',end,{passive:false});
      el.addEventListener('mousedown',()=>{this.keys[key]=true;}); el.addEventListener('mouseup',()=>{this.keys[key]=false;});
    };
    bindAction('ctrl-fire','fire'); bindAction('ctrl-flare','flare');
    bindAction('ctrl-thrust','up'); bindAction('ctrl-rocket','rocket');
    // Shield is a tap (not hold)
    const shieldBtn = document.getElementById('ctrl-shield');
    if (shieldBtn) {
      shieldBtn.addEventListener('touchstart',e=>{e.preventDefault();this.keys.shield=true;},{passive:false});
      shieldBtn.addEventListener('touchend',e=>{e.preventDefault();this.keys.shield=false;},{passive:false});
      shieldBtn.addEventListener('mousedown',()=>{this.keys.shield=true;});
      shieldBtn.addEventListener('mouseup',()=>{this.keys.shield=false;});
    }
    // Xforce Lavian (tap)
    const xforceBtn = document.getElementById('ctrl-xforce');
    if (xforceBtn) {
      xforceBtn.addEventListener('touchstart',e=>{e.preventDefault();this.keys.xforce=true;},{passive:false});
      xforceBtn.addEventListener('touchend',e=>{e.preventDefault();this.keys.xforce=false;},{passive:false});
      xforceBtn.addEventListener('mousedown',()=>{this.keys.xforce=true;});
      xforceBtn.addEventListener('mouseup',()=>{this.keys.xforce=false;});
    }
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  async _submitCallsign() {
    const raw = document.getElementById('callsign-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('callsign-error');
    if (!raw||raw.length<2){errEl.textContent='MIN 2 CHARACTERS.';return;}
    if (raw.length>12){errEl.textContent='MAX 12 CHARACTERS.';return;}
    localStorage.setItem('meyaret_callsign', raw);
    if (OFFLINE_MODE) {
      this.userData={...DEMO_USER,nickname:raw};this._loadMenu();this._showScreen('menu');
      const b=document.getElementById('multiplier-banner');
      b.textContent='OFFLINE MODE — SCORES NOT SAVED';b.style.borderColor='#ff4466';b.style.color='#ff4466';b.classList.remove('hidden');
      return;
    }
    errEl.textContent='CHECKING...';
    try {
      const{available,clean}=await dbCheckCallsign(raw);
      if(!available){errEl.textContent='CALLSIGN TAKEN. CHOOSE ANOTHER.';return;}
      const tid=String(TG_USER?.id||this.userData?.telegram_id);
      const updated=await dbSaveCallsign(tid,clean);
      localStorage.setItem('meyaret_callsign',updated.nickname);
      this.userData=updated;errEl.textContent='';this._loadMenu();this._showScreen('menu');
    } catch {
      OFFLINE_MODE=true;this.userData={...DEMO_USER,nickname:raw};this._loadMenu();this._showScreen('menu');
      const b=document.getElementById('multiplier-banner');
      b.textContent='OFFLINE — SCORES NOT SAVED';b.style.borderColor='#ff4466';b.style.color='#ff4466';b.classList.remove('hidden');
    }
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  _loadMenu() {
    if (!this.userData) return;
    const nick = this.userData.nickname || localStorage.getItem('meyaret_callsign') || 'PILOT';
    document.getElementById('menu-nickname').textContent  = nick;
    document.getElementById('menu-trust-name').textContent = nick;
    const shmips = Number(this.userData.shmips || 0);
    document.getElementById('menu-shmips').textContent = `${shmips%1===0?shmips:shmips.toFixed(2)} $$`;
    this._loadLeaderboard();
    this._loadGiftTimer();
  }

  async _loadLeaderboard() {
    try {
      this._top5Cache = await dbGetLeaderboard();
    } catch { /* non-critical */ }
  }

  async _loadGiftTimer() {
    const timerEl = document.getElementById('menu-spin-timer');
    if (!timerEl) return;
    try {
      const tid = TG_USER?.id || this.userData?.telegram_id;
      if (!tid) { timerEl.textContent = ''; return; }
      const status = await dbGiftStatus(tid);
      if (status.available) {
        timerEl.textContent = 'GIFT READY!';
        timerEl.style.color = 'var(--cyan)';
      } else {
        timerEl.style.color = 'var(--muted2)';
        this._tickMenuGiftTimer(status.remainingMs, timerEl);
      }
    } catch { timerEl.textContent = ''; }
  }

  _tickMenuGiftTimer(ms, el) {
    const tick = () => {
      ms -= 1000;
      if (ms <= 0) { el.textContent = 'GIFT READY!'; el.style.color = 'var(--cyan)'; return; }
      const h = Math.floor(ms/3_600_000);
      const m = Math.floor((ms%3_600_000)/60_000);
      const s = Math.floor((ms%60_000)/1000);
      el.textContent = `GIFT: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      if (this.state === 'menu') setTimeout(tick, 1000);
    };
    tick();
  }

  async _openGift() {
    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (tid && !OFFLINE_MODE) {
      try { const me = await dbGetOrCreateUser(tid); if (me) this.userData = me.user; } catch { /* non-critical */ }
    }
    this._showScreen('gift-4hr');
    const box = document.getElementById('gift-box');
    const lid = document.getElementById('gift-lid');
    const sparks = document.getElementById('gift-sparks');
    const resultEl = document.getElementById('spin-result');
    const btn = document.getElementById('spin-btn');
    const timerEl = document.getElementById('gift-timer');
    if (box) { box.className = 'gift-idle'; }
    if (lid) lid.classList.remove('gift-lid-open');
    if (sparks) sparks.innerHTML = '';
    if (resultEl) { resultEl.classList.add('hidden'); resultEl.className = 'spin-result hidden'; }
    if (!tid) {
      if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
      if (timerEl) timerEl.textContent = 'OPEN VIA TELEGRAM';
      return;
    }
    try {
      const status = await dbGiftStatus(tid);
      if (status.available) {
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        if (timerEl) { timerEl.textContent = ''; timerEl.style.color = ''; }
      } else if (status.remainingMs > 0) {
        if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
        if (timerEl) this._startGiftCountdown(status.remainingMs, timerEl);
      }
    } catch {
      if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }
      if (timerEl) timerEl.textContent = 'OFFLINE';
    }
  }

  _startGiftCountdown(ms, el) {
    if (!el) return;
    const tick = () => {
      ms -= 1000;
      if (ms <= 0) {
        el.textContent = 'GIFT READY!'; el.style.color = 'var(--cyan)';
        const btn = document.getElementById('spin-btn');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
        return;
      }
      const h = Math.floor(ms/3_600_000), m = Math.floor((ms%3_600_000)/60_000), s = Math.floor((ms%60_000)/1000);
      el.textContent = `NEXT: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      el.style.color = 'var(--muted2)';
      setTimeout(tick, 1000);
    };
    tick();
  }

  // ── Mode Select & Start Game ────────────────────────────────────────────────
  _showModeSelect() {
    const modal = document.getElementById('mode-select-modal');
    if (!modal) return;
    const tid = TG_USER?.id ?? this.userData?.telegram_id;
    const arcadeBtn = document.getElementById('btn-mode-arcade');
    const bossmanBtn = document.getElementById('btn-mode-bossman');
    const arcadeTimerEl = document.getElementById('mode-arcade-timer');
    const bossmanTimerEl = document.getElementById('mode-bossman-timer');
    const noBossmanCd = (typeof window !== 'undefined' && window.BOSSMAN_NO_COOLDOWN_USER_ID != null) &&
      tid != null && String(tid) === String(window.BOSSMAN_NO_COOLDOWN_USER_ID);
    if (arcadeBtn) {
      arcadeBtn.style.display = '';
      arcadeBtn.disabled = false;
    }
    if (bossmanBtn) {
      bossmanBtn.style.display = '';
      bossmanBtn.disabled = false;
    }

    const formatTime = (ms) => {
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
    };

    const arcadeLast = parseInt(localStorage.getItem('meyaret_arcade_last') || '0', 10);
    const arcadeCooldownMs = 2 * 60 * 60 * 1000;
    const arcadeRemaining = arcadeLast && (Date.now() - arcadeLast < arcadeCooldownMs) ? arcadeCooldownMs - (Date.now() - arcadeLast) : 0;
    if (arcadeTimerEl) {
      if (arcadeRemaining > 0) {
        arcadeTimerEl.classList.remove('hidden');
        const tick = () => {
          const r = Math.max(0, arcadeCooldownMs - (Date.now() - arcadeLast));
          if (r <= 0) { arcadeTimerEl.textContent = ''; arcadeTimerEl.classList.add('hidden'); return; }
          arcadeTimerEl.textContent = `ARCADE-BETA: ${formatTime(r)}`;
          if (document.getElementById('mode-select-modal')?.classList.contains('hidden')) return;
          setTimeout(tick, 1000);
        };
        tick();
      } else {
        arcadeTimerEl.classList.add('hidden');
        arcadeTimerEl.textContent = '';
      }
    }

    const bossmanLast = parseInt(localStorage.getItem('meyaret_bossman_last') || '0', 10);
    const bossmanCooldownMs = 4 * 60 * 60 * 1000;
    const bossmanRemaining = !noBossmanCd && bossmanLast && (Date.now() - bossmanLast < bossmanCooldownMs)
      ? bossmanCooldownMs - (Date.now() - bossmanLast) : 0;
    if (bossmanTimerEl) {
      if (bossmanRemaining > 0) {
        bossmanTimerEl.classList.remove('hidden');
        const tick = () => {
          const r = Math.max(0, bossmanCooldownMs - (Date.now() - bossmanLast));
          if (r <= 0) { bossmanTimerEl.textContent = ''; bossmanTimerEl.classList.add('hidden'); return; }
          bossmanTimerEl.textContent = `BOSSMAN: ${formatTime(r)}`;
          if (document.getElementById('mode-select-modal')?.classList.contains('hidden')) return;
          setTimeout(tick, 1000);
        };
        tick();
      } else {
        bossmanTimerEl.classList.add('hidden');
        bossmanTimerEl.textContent = '';
      }
    }
    modal.classList.remove('hidden');
  }

  async _startGame(mode = 'survival') {
    if (mode === 'arcade') {
      const last = parseInt(localStorage.getItem('meyaret_arcade_last') || '0', 10);
      const cooldownMs = 2 * 60 * 60 * 1000; // 2h after beating final boss only
      if (last && Date.now() - last < cooldownMs) {
        const left = Math.ceil((cooldownMs - (Date.now() - last)) / 60000);
        alert(`ARCADE-BETA COOLDOWN\nPlay again in ${left} minutes!`);
        return;
      }
    } else if (mode === 'bossman') {
      const tid = TG_USER?.id ?? this.userData?.telegram_id;
      const noCd = (typeof window !== 'undefined' && window.BOSSMAN_NO_COOLDOWN_USER_ID != null) &&
        tid != null && String(tid) === String(window.BOSSMAN_NO_COOLDOWN_USER_ID);
      if (!noCd) {
        const last = parseInt(localStorage.getItem('meyaret_bossman_last') || '0', 10);
        const cooldownMs = 4 * 60 * 60 * 1000;
        if (last && Date.now() - last < cooldownMs) {
          const left = Math.ceil((cooldownMs - (Date.now() - last)) / 60000);
          alert(`BOSSMAN COOLDOWN\nPlay again in ${left} minutes!`);
          return;
        }
        localStorage.setItem('meyaret_bossman_last', Date.now().toString());
      }
    }
    try { this._doStartGame(mode); } catch(e) {
      console.error('[_startGame]', e);
      alert('LAUNCH ERROR: ' + e.message + '\n\n' + (e.stack || ''));
    }
  }
  _doStartGame(mode = 'survival') {
    document.getElementById('gameover-screen')?.classList.remove('arcade-victory');
    SFX.thrustStop(); this._wasThrusting = false;
    if (!this.multiplierEndMs) this.multiplierEndMs = 0;
    this.score=0; this.gameTime=0; this.tick=0;
    this.asteroids=[]; this.bullets=[]; this.enemyBullets=[];
    this.rockets=[]; this.playerRockets=[]; this.megaRaketas=[]; this.fireballs=[]; this.particles=[];
    this.redFighters=[]; this.yellowAliens=[]; this.orangeRockets=[]; this.arcadeBosses=[];
    this.friendlyJets=[]; this._hornetSpawnedThisRun = false;
    this.coins=[]; this.mysteryPickups=[]; this.greenStars=[]; this.monsterFuels=[];
    this.runShmipsBonus=0; this.pickupSpawnTimer=0;
    this.redFighterTimer=0; this.yellowAlienTimer=0; this.orangeRocketTimer=0;
    this.asteroidSpawnTimer=0; this._lastMusicTier=1;
    this.xforceCooldownUntil=0; this.xforceActiveUntil=0;
    this.ripFullLivesSince=0; this.ripCountdownRemain=0; this.ripFuryUntil=0;
    this.ramboActive=false; this._ramboRocketCooldown=0;
    this.greenStarTimer=rngInt(60 * 90, 60 * 150);
    this.monsterFuelTimer=rngInt(60 * 120, 60 * 180);
    this.runScoreMultiplier=1; // set to 2 if x2 score boost active

    this._lastGameMode = mode;
    this.bossmanMode = (mode === 'bossman');
    this.arcadeMode = (mode === 'arcade');
    this.arcadeWave = this.arcadeMode ? 1 : 0;
    this._arcadeWaveSpawned = false;
    this._arcadeBossSpawned = false;
    this._arcadeBetweenWaves = false;
    this._arcadeBetweenWavesUntil = 0;
    this._arcadeWaveStartTime = null;
    this._arcadeSpawned = null;
    this._arcadeFinalBossIntro = false;
    this._arcadeOutroActive = false;
    this._arcadeOutroFireworksUntilMs = 0;
    this._arcadeOutroRewardUntilMs = 0;
    this._survivalBossFight = false;
    this._survivalBossesDefeated = 0;
    this._nextSurvivalBossScore = 1_000_000;
    this._bossScoreBoost = 0;
    this._bossmanKills = 0;
    this._bossmanBetweenBosses = false;
    this._bossmanBetweenUntil = 0;
    this._bossmanIntroUntil = 0;
    this._rocketHoldFrames = 0;
    this._rocketSalvoActive = false;
    this._rocketSalvoNextFrame = 0;

    const tid = TG_USER?.id || this.userData?.telegram_id;
    const ups = {};

    // ── Determine which jet is equipped ──────────────────────────────────────
    const equippedJet  = localStorage.getItem('meyaret_equip_jet')  || 'starter';
    const equippedSkin = localStorage.getItem('meyaret_equip_skin') || null;

    // Only apply jet if owned (or starter)
    if (equippedJet === 'starter' || this.upgrades[equippedJet]) {
      ups.jetType = equippedJet;
    } else {
      ups.jetType = 'starter';
    }

    // ── One-run boosts (max 1 of each per game) ───────────────────────────
    if (!this.arcadeMode && !this.bossmanMode) {
      const boostTypes = ['extra_life','extra_flare','extra_shield','extra_rocket'];
      const consumeList = [];
      boostTypes.forEach(id => {
        if ((this.upgrades[id] || 0) > 0) {
          ups[id] = 1;
          consumeList.push(id);
          this.upgrades[id] = (this.upgrades[id] || 1) - 1;
          if (this.upgrades[id] <= 0) delete this.upgrades[id];
        }
      });
      if (tid && !OFFLINE_MODE && consumeList.length > 0) {
        consumeList.forEach(id => dbConsumeBoost(tid, id).catch(() => {}));
      }
    }

    // ── Permanent upgrades ────────────────────────────────────────────────
    ['magen','pew_pew_15','pew_pew_3','jew_method','kurwa_raketa',
     'ace_upgrade','zep_zep_zep','shplit','tripple_threat',
     'smart_rocket','collector','score_x2','score_x3','hornet_assistant','xforce_lavian','rip_n_dip','lucky_bstrd'].forEach(id => {
      if (this.upgrades[id]) ups[id] = 1;
    });
    // Power-based difficulty scaling: new players easier, veterans harder so game stays engaging
    const jetTier = { starter:0, plane_hamud:1, plane_walla_yofi:2, plane_very_scary:3, plane_negev:4, plane_baba_yaga:5, plane_astrozoinker:6 }[ups.jetType] || 0;
    const upgCount = Object.keys(ups).filter(k => !['jetType','extra_life','extra_flare','extra_shield','extra_rocket'].includes(k)).length;
    const power = jetTier + upgCount;
    this._powerMult = power <= 4 ? 0.82 : power <= 10 ? 1.0 : 1.22;
    let chaos = power <= 4 ? 480 : power <= 10 ? 360 : 240;
    if (!this.arcadeMode && !this.bossmanMode) chaos = Math.round(chaos * 1.15); // Survival ~15% calmer
    this._chaosAtSec = chaos;
    // Score multiplier: x2 and x3 are permanent, stack to x6
    let mult = 1;
    if (ups.score_x2) mult *= 2;
    if (ups.score_x3) mult *= 3;
    this.runScoreMultiplier = mult;

    // ── Skin color ────────────────────────────────────────────────────────
    const skinColors = {
      skin_chuck_norris:   { color:'camo' },
      skin_breast_cancer: { color:'#ff69b4', accent:'#ffffff' },
      skin_shemesh:       { color:'#ff8800', accent:'#ffee00' },
      skin_bat_yam:       { color:'#0077ff', accent:'#00ffee' },
      skin_coffee:        { color:'#6b3a1f', accent:'#f5d9a8' },
      skin_anavim:        { color:'#7b2fff', accent:'#dd88ff' },
      skin_chupapi:       { color:'#00dd44', accent:'#ccff00' },
      skin_goldie:        { color:'#ffd700', accent:'#ffffff' },
      skin_beast:         { color:'rainbow' },
      skin_acid:          { color:'acid' },
      skin_pheonix:       { color:'#9b59b6', accent:'#ffd700' },
      skin_karamba:       { color:'#ff2255', accent:'#ff9900' },
      skin_zoink:         { color:'#00eeff', accent:'#00ff88' },
      skin_silver_surfer: { color:'#8ab4d4', accent:'#ddeeff' },
      skin_neon_dream:    { color:'#ff00cc', accent:'#00ffaa' },
      skin_desert_storm:  { color:'#d4a843', accent:'#ff8844' },
      skin_zion:          { color:'zion' },
      skin_candy:         { color:'#ff88cc', accent:'#88ffdd' },
      skin_aurora:        { color:'#00ddff', accent:'#aa66ff' },
      skin_inferno:       { color:'#ff3300', accent:'#ff9900' },
      skin_crimson:       { color:'#cc0044', accent:'#ff4466' },
      skin_plasma_veil:   { color:'#00f5d4', accent:'#9b5de5' },
      skin_rust_moon:     { color:'#b5651d', accent:'#e8a0bf' },
      skin_cherry_bomb:   { color:'#ff69b4', accent:'#ff0066' },
      skin_money:         { color:'#00aa44', accent:'#ffffff' },
      skin_playa:         { color:'#8844aa', accent:'#cc88ff' },
      skin_scizo:         { color:'rainbow' },
      skin_neon_phoenix:  { color:'#ff6600', accent:'#ff00aa' },
      skin_tiger_stripe:  { color:'#333333', accent:'#ff8800' },
      skin_ocean_camo:    { color:'#004466', accent:'#00aacc' },
      skin_digital_camo:  { color:'#556644', accent:'#889966' },
      skin_forest_ghost:  { color:'#3d5c33', accent:'#6b8e4e' },
      skin_night_ops:     { color:'#1a1a2e', accent:'#4a4a6a' },
      skin_desert_tan:    { color:'#c4a574', accent:'#8b7355' },
      skin_urban_gray:    { color:'#6b6b6b', accent:'#9a9a9a' },
    };

    if (equippedSkin && this.upgrades[equippedSkin] && skinColors[equippedSkin]) {
      ups.skinId = equippedSkin;
      const sc = skinColors[equippedSkin];
      const animated = ['skin_beast','skin_acid','skin_zion','skin_inferno','skin_crimson','skin_scizo'].includes(equippedSkin);
      if (!animated) {
        if (sc.color === 'camo') {
          ups.skin_color = CAMO.stroke;
          ups.skin_accent = CAMO.olive;
        } else {
          ups.skin_color = sc.color;
          if (sc.accent) ups.skin_accent = sc.accent;
        }
      }
    }

    const equippedThrust = localStorage.getItem('meyaret_equip_thrust') || 'thrust_default';
    const thrustItem = CATALOG.find(c => c.id === equippedThrust);
    if (thrustItem?.color) ups.thrustColor = thrustItem.color;

    const equippedBullet = localStorage.getItem('meyaret_equip_bullet') || 'bullet_default';
    const bulletItem = CATALOG.find(c => c.id === equippedBullet);
    if (bulletItem?.shape) ups.bulletShape = bulletItem.shape;
    if (bulletItem?.color) ups.bulletColor = bulletItem.color;

    const equippedRocketSkin = localStorage.getItem('meyaret_equip_rocket_skin') || '';
    if (equippedRocketSkin && (this.upgrades[equippedRocketSkin] || 0) > 0) {
      const rocketSkinItem = CATALOG.find(c => c.id === equippedRocketSkin);
      if (rocketSkinItem?.color) ups.rocketSkinColor = rocketSkinItem.color;
    }

    if (this.userData?.has_golden_plane) ups.golden_plane = true;

    if (!this.upgrades) this.upgrades = {};
    if (this.arcadeMode) {
      const wc = ARCADE_WAVES[this.arcadeWave - 1];
      Object.keys(ups).forEach(k => delete ups[k]);
      ups.jetType = wc.jet;
      if (wc.skin) {
        const skinColors = { skin_chuck_norris:{ color:'camo' }, skin_bat_yam:{ color:'#0077ff', accent:'#00ffee' }, skin_coffee:{ color:'#6b3a1f', accent:'#f5d9a8' }, skin_chupapi:{ color:'#00dd44', accent:'#ccff00' }, skin_goldie:{ color:'#ffd700', accent:'#ffffff' }, skin_acid:{ color:'acid' }, skin_karamba:{ color:'#ff2255', accent:'#ff9900' }, skin_candy:{ color:'#ff88cc', accent:'#88ffdd' } };
        const sc = skinColors[wc.skin];
        if (sc) { ups.skinId = wc.skin; if (sc.color === 'camo') { ups.skin_color = CAMO.stroke; ups.skin_accent = CAMO.olive; } else if (sc.color !== 'acid') { ups.skin_color = sc.color; ups.skin_accent = sc.accent; } }
      }
      const thrustColors = { '#00ff66':'#00ff66', '#0088ff':'#0088ff', '#ff0077':'#ff0077', '#aa44ff':'#aa44ff', '#00ffcc':'#00ffcc', 'aurora':'aurora', 'spectrum':'spectrum' };
      if (wc.thrust && thrustColors[wc.thrust]) ups.thrustColor = thrustColors[wc.thrust];
      const bulletItems = { bullet_stars:{ shape:'star', color:'#ffd700' }, bullet_diamonds:{ shape:'diamond', color:'#00ffee' }, bullet_hearts:{ shape:'heart', color:'#ff69b4' }, bullet_aurora:{ shape:'default', color:'aurora' }, bullet_spectrum:{ shape:'default', color:'spectrum' } };
      if (wc.bullet && bulletItems[wc.bullet]) { ups.bulletShape = bulletItems[wc.bullet].shape; ups.bulletColor = bulletItems[wc.bullet].color; }
      _arcadeAccumulatedUpgrades(this.arcadeWave).forEach(id => ups[id] = 1);
      if ((wc.bonus || {}).life) ups.extra_life = 1;
      if ((wc.bonus || {}).flare) ups.extra_flare = 1;
      if ((wc.bonus || {}).shield) ups.extra_shield = 1;
      if ((wc.bonus || {}).rocket) ups.extra_rocket = 1;
    }
    this._runUpgrades = { ...ups }; // run-effective upgrades (arcade = wave only; survival = arsenal+boosts)
    this.ship = new Ship(this.W/2, this.H/2, ups);
    _updateShieldHUD(this.ship.shieldCharges);
    // No entities spawned yet — 2-second grace period
    this._purgeObjectsNearShip(9999); // wipe everything
    this._spawnFrozen = true; // blocks _maintainAsteroids + enemy spawns
    const nick = this.userData?.nickname || 'PILOT';
    this._showScreen('game');
    this._showGoodLuckSplash(this.arcadeMode ? `WAVE ${this.arcadeWave}` : this.bossmanMode ? 'BOSSMAN' : nick);
    if (!this.arcadeMode && this.runScoreMultiplier >= 2) {
      setTimeout(() => new FloatingText(this.W/2, this.H/2, `x${this.runScoreMultiplier} SCORE ACTIVE!`, '#ffee00'), 1200);
    }
    // After 2s, unfreeze spawns
    setTimeout(() => {
      this._spawnFrozen = false;
      if (this.arcadeMode) {
        this._arcadeWaveStartTime = null; // set on first _arcadeTickSpawn
        this._arcadeSpawned = { rocks: 0, aliens: 0, missiles: 0, jets: 0 };
      } else if (this.bossmanMode) {
        this._bossmanIntroUntil = this.gameTime + 180;
        this._bossmanBetweenBosses = true;
        this._bossmanBetweenUntil = this.gameTime + 180; // 3s to first boss
      } else {
        for (let i = 0; i < 3; i++) {
          const pos = this._findSafeSpawnPoint(40, this.ship, 200);
          this.asteroids.push(new Asteroid(pos.x, pos.y, 'small', null, 1));
        }
      }
    }, 2000);
  }

  _showGoodLuckSplash(text) {
    const el = document.getElementById('goodluck-splash');
    if (!el) return;
    const msg = text.startsWith('WAVE') ? text : `Good luck ${text}`;
    el.innerHTML = `<div class="gl-wrap"><span class="gl-text">${msg}</span></div>`;
    el.classList.remove('hidden');
    setTimeout(() => { el.classList.add('hidden'); el.innerHTML = ''; }, 2000);
  }

  _effUpgrades() { return this.arcadeMode ? (this._runUpgrades || {}) : (this.upgrades || {}); }

  /** Hold rocket 3s → fire all rockets rapidly; quick tap → single rocket */
  _tickRocketHoldAndSalvo() {
    const ship = this.ship;
    if (!ship || this.ramboActive) {
      if (this.ramboActive) { this._rocketHoldFrames = 0; this._rocketSalvoActive = false; }
      return;
    }
    const ROCKET_HOLD = 180;
    const SALVO_GAP = 5;

    if (this._rocketSalvoActive) {
      if (ship.rocketAmmo <= 0) {
        this._rocketSalvoActive = false;
        this._updateRocketHoldUI(true);
        return;
      }
      if (this.gameTime >= this._rocketSalvoNextFrame) {
        ship.fireRocket(this.playerRockets, true);
        this._rocketSalvoNextFrame = this.gameTime + SALVO_GAP;
      }
      this._updateRocketHoldUI(false);
      return;
    }

    if (this.keys.rocket) {
      if (ship.rocketAmmo > 0) {
        this._rocketHoldFrames++;
        if (this._rocketHoldFrames >= ROCKET_HOLD) {
          this._rocketHoldFrames = 0;
          this._rocketSalvoActive = true;
          this._rocketSalvoNextFrame = this.gameTime;
          new FloatingText(ship.x, ship.y - 40, 'SALVO!!', '#ffcc00');
        }
      }
      this._updateRocketHoldUI(false);
    } else {
      if (this._rocketHoldFrames > 0 && this._rocketHoldFrames < ROCKET_HOLD) {
        const TAP_MAX = 24;
        if (this._rocketHoldFrames <= TAP_MAX) ship.fireRocket(this.playerRockets, false);
      }
      this._rocketHoldFrames = 0;
      this._updateRocketHoldUI(true);
    }
  }

  _updateRocketHoldUI(forceHide) {
    const ROCKET_HOLD = 180;
    const holdEl = document.getElementById('ctrl-rocket-hold');
    const pcEl = document.getElementById('rocket-hold-overlay');
    const pcText = document.getElementById('rocket-hold-text');
    const charging = !forceHide && this._rocketHoldFrames > 0 && this.ship?.rocketAmmo > 0 && !this._rocketSalvoActive;
    const sec = Math.max(0, (ROCKET_HOLD - this._rocketHoldFrames) / 60);

    if (holdEl) {
      if (charging && this._isMobile()) {
        holdEl.textContent = sec.toFixed(1);
        holdEl.classList.remove('hidden');
      } else if (this._rocketSalvoActive && this._isMobile() && this.ship?.rocketAmmo > 0) {
        holdEl.textContent = '!!';
        holdEl.classList.remove('hidden');
      } else {
        holdEl.classList.add('hidden');
      }
    }
    if (pcEl && pcText) {
      if (charging) {
        pcText.textContent = this._isMobile() ? `SALVO in ${sec.toFixed(1)}s` : `SALVO in ${sec.toFixed(1)}s (hold R)`;
        pcEl.classList.remove('hidden');
      } else if (!forceHide && this._rocketSalvoActive && (this.ship?.rocketAmmo ?? 0) > 0) {
        pcText.textContent = 'SALVO!';
        pcEl.classList.remove('hidden');
      } else {
        pcEl.classList.add('hidden');
      }
    }
  }

  _activateXforce() {
    if (!this._effUpgrades().xforce_lavian || !this.ship?.alive) return;
    if (this.xforceCooldownUntil > 0 && this.gameTime < this.xforceCooldownUntil) return;
    this.xforceActiveUntil = this.gameTime + 240; // 4 sec
    this.xforceCooldownUntil = this.gameTime + 5 * 60 * 60; // 5 min
    SFX.xforceActivate && SFX.xforceActivate();
    new FloatingText(this.W/2, this.H/2, 'XFORCE!', '#ff2222');
  }

  _processXforceLasers() {
    const kill = (arr, score) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        burst(this.particles, e.x, e.y, e.color || C.asteroid, 12, 3, 25);
        this._addScore(score);
        arr.splice(i, 1);
      }
    };
    kill(this.asteroids, 50);
    this.redFighters.forEach(e => { burst(this.particles, e.x, e.y, C.enemyRed, 14, 4, 28); this._addScore(CFG.enemyRedScore); });
    this.redFighters = [];
    this.yellowAliens.forEach(e => { burst(this.particles, e.x, e.y, C.enemyYellow, 14, 4, 28); this._addScore(CFG.enemyYellowScore); });
    this.yellowAliens = [];
    this.orangeRockets.forEach(o => { burst(this.particles, o.x, o.y, '#ff7700', 10, 3, 22); this._addScore(150); });
    this.orangeRockets = [];
    this.enemyBullets = [];
    // Xforce one-shots any boss (arcade / bossman / survival milestone)
    for (let bi = this.arcadeBosses.length - 1; bi >= 0; bi--) {
      const boss = this.arcadeBosses[bi];
      burst(this.particles, boss.x, boss.y, '#ffd700', 36, 8, 50);
      SFX.enemyDie();
      this._onBossKilled();
      this.arcadeBosses.splice(bi, 1);
    }
  }

  _drawXforceLasers(ctx) {
    const beamCount = 7;
    const phase = (this.gameTime % 12) / 12;
    for (let i = 0; i < beamCount; i++) {
      const x = (this.W / (beamCount + 1)) * (i + 1) + Math.sin(this.tick * 0.1 + i) * 20;
      const alpha = 0.4 + 0.3 * Math.sin(Date.now() / 80 + i * 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      glow(ctx, '#ff2222', 25);
      ctx.strokeStyle = `rgba(255,50,50,${alpha})`;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  _drawRipFuryOverlay(ctx) {
    const FONT = '"Press Start 2P", "Courier New", monospace';
    const furyRemain = this.ripFuryUntil - this.gameTime;
    const furySec = Math.ceil(furyRemain / 60);
    const h = ((this.tick * 3) % 360);
    ctx.save();
    // Full-screen rainbow 'color' blend — makes everything on screen rainbow
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.85;
    const g = ctx.createLinearGradient(0, 0, this.W, this.H);
    g.addColorStop(0, `hsl(${h % 360}, 100%, 50%)`);
    g.addColorStop(0.33, `hsl(${(h + 120) % 360}, 100%, 50%)`);
    g.addColorStop(0.66, `hsl(${(h + 240) % 360}, 100%, 50%)`);
    g.addColorStop(1, `hsl(${(h + 60) % 360}, 100%, 50%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Center text: RIP N DIP!! and sec counter at 60% opacity
    ctx.globalAlpha = 0.6;
    ctx.textAlign = 'center';
    ctx.font = `14px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 16;
    ctx.fillText('RIP N DIP!!', this.W / 2, this.H / 2 - 14);
    ctx.font = `10px ${FONT}`;
    ctx.fillText(`${furySec}s`, this.W / 2, this.H / 2 + 10);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  _getNoSpawnRects() {
    const hudW = 172, hudH = 104;
    return [
      { x: 0, y: 0, w: hudW, h: hudH },                      // top-left score/life HUD
      { x: this.W - 150, y: 0, w: 150, h: 84 },              // top-right counters
      { x: 0, y: this.H - 250, w: 180, h: 250 },             // mobile left controls
      { x: this.W - 180, y: this.H - 250, w: 180, h: 250 },  // mobile right controls
    ];
  }

  _isInNoSpawnZone(x, y, pad = 0) {
    return this._getNoSpawnRects().some(r =>
      x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad
    );
  }

  _findSafeSpawnPoint(margin = 40, avoid = null, avoidR = 170, tries = 120) {
    for (let i = 0; i < tries; i++) {
      const x = rng(margin, this.W - margin);
      const y = rng(margin, this.H - margin);
      if (this._isInNoSpawnZone(x, y, 24)) continue;
      if (avoid && dist({ x, y }, avoid) < avoidR) continue;
      return { x, y };
    }
    // Fallback: pick a corner well away from screen center (where ship spawns)
    const fallbacks = [
      { x: this.W * 0.1, y: this.H * 0.2 },
      { x: this.W * 0.9, y: this.H * 0.2 },
      { x: this.W * 0.1, y: this.H * 0.8 },
      { x: this.W * 0.9, y: this.H * 0.8 },
    ];
    return fallbacks[rngInt(0, 3)];
  }

  _purgeObjectsNearShip(rad = 160) {
    if (!this.ship) return;
    this.asteroids = this.asteroids.filter(a => dist(a, this.ship) > rad + a.radius);
    this.redFighters = this.redFighters.filter(e => dist(e, this.ship) > rad + e.radius);
    this.yellowAliens = this.yellowAliens.filter(e => dist(e, this.ship) > rad + e.radius);
    this.orangeRockets = this.orangeRockets.filter(e => dist(e, this.ship) > rad + e.radius);
    this.arcadeBosses = this.arcadeBosses.filter(e => dist(e, this.ship) > rad + e.radius);
    this.rockets = this.rockets.filter(e => dist(e, this.ship) > rad + e.radius);
    this.enemyBullets = this.enemyBullets.filter(e => dist(e, this.ship) > rad + e.radius);
  }

  _arcadePurgeBetweenWaves() {
    this.asteroids = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.rockets = [];
    this.playerRockets = [];
    this.megaRaketas = [];
    this.fireballs = [];
    this.particles = [];
    this.redFighters = [];
    this.yellowAliens = [];
    this.orangeRockets = [];
    this.arcadeBosses = [];
  }

  _arcadeRestockShip() {
    const wc = ARCADE_WAVES[this.arcadeWave - 1];
    if (!wc || !this.ship) return;
    const ups = {};
    ups.jetType = wc.jet;
    if (wc.skin) {
      const skinColors = { skin_chuck_norris:{ color:'camo' }, skin_bat_yam:{ color:'#0077ff', accent:'#00ffee' }, skin_coffee:{ color:'#6b3a1f', accent:'#f5d9a8' }, skin_chupapi:{ color:'#00dd44', accent:'#ccff00' }, skin_goldie:{ color:'#ffd700', accent:'#ffffff' }, skin_acid:{ color:'acid' }, skin_karamba:{ color:'#ff2255', accent:'#ff9900' }, skin_candy:{ color:'#ff88cc', accent:'#88ffdd' } };
      const sc = skinColors[wc.skin];
      if (sc) { ups.skinId = wc.skin; if (sc.color === 'camo') { ups.skin_color = CAMO.stroke; ups.skin_accent = CAMO.olive; } else if (sc.color !== 'acid') { ups.skin_color = sc.color; ups.skin_accent = sc.accent; } }
    }
    const thrustColors = { '#00ff66':'#00ff66', '#0088ff':'#0088ff', '#ff0077':'#ff0077', '#aa44ff':'#aa44ff', '#00ffcc':'#00ffcc', 'aurora':'aurora', 'spectrum':'spectrum' };
    if (wc.thrust && thrustColors[wc.thrust]) ups.thrustColor = thrustColors[wc.thrust];
    const bulletItems = { bullet_stars:{ shape:'star', color:'#ffd700' }, bullet_diamonds:{ shape:'diamond', color:'#00ffee' }, bullet_hearts:{ shape:'heart', color:'#ff69b4' }, bullet_aurora:{ shape:'default', color:'aurora' }, bullet_spectrum:{ shape:'default', color:'spectrum' } };
    if (wc.bullet && bulletItems[wc.bullet]) { ups.bulletShape = bulletItems[wc.bullet].shape; ups.bulletColor = bulletItems[wc.bullet].color; }
    _arcadeAccumulatedUpgrades(this.arcadeWave).forEach(id => ups[id] = 1);
    if ((wc.bonus || {}).life) ups.extra_life = 1;
    if ((wc.bonus || {}).flare) ups.extra_flare = 1;
    if ((wc.bonus || {}).shield) ups.extra_shield = 1;
    if ((wc.bonus || {}).rocket) ups.extra_rocket = 1;
    this._runUpgrades = { ...ups };
    const cx = this.ship.x, cy = this.ship.y;
    this.ship = new Ship(cx, cy, ups);
    _updateShieldHUD(this.ship.shieldCharges);
  }

  async _arcadeVictory() {
    if (this._arcadeOutroActive) return;
    this._arcadePurgeBetweenWaves();
    this.ship.alive = false;
    SFX.thrustStop();
    const now = Date.now();
    this._arcadeOutroActive = true;
    this._arcadeOutroFireworksUntilMs = now + 3800;
    this._arcadeOutroRewardUntilMs = now + 7600;
    setTimeout(() => this._arcadeFinishVictory(), 7600);
  }

  async _arcadeFinishVictory() {
    const nick = this.userData?.nickname || 'PILOT';
    const tid = TG_USER?.id || this.userData?.telegram_id;
    const ARCADE_REWARD = 10000;
    try {
      if (tid && !OFFLINE_MODE) {
        const updated = await dbAddBonusShmips(tid, ARCADE_REWARD);
        if (updated) this.userData.shmips = updated.shmips;
      } else {
        this.userData.shmips = (this.userData.shmips || 0) + ARCADE_REWARD;
      }
    } catch (e) { console.warn('[arcade] bonus failed:', e.message); }
    localStorage.setItem('meyaret_arcade_last', Date.now().toString());
    this._arcadeOutroActive = false;
    this._resetGameOverScreen();
    const s = document.getElementById('gameover-screen');
    const pa = document.getElementById('go-play-again');
    const gm = document.getElementById('go-menu');
    if (pa) pa.style.display = 'none';
    if (gm) { gm.textContent = 'MAIN MENU'; gm.classList.add('btn-primary'); gm.classList.remove('btn-secondary'); }
    document.getElementById('go-title').textContent = `MAZAL TOV ${nick}!!`;
    document.getElementById('go-score').textContent = '10 WAVES CLEARED';
    document.getElementById('go-shmips').textContent = `+${ARCADE_REWARD.toLocaleString()} $$ AWARDED!`;
    const lb = document.getElementById('go-leaderboard');
    if (lb) lb.innerHTML = '<pre style="font-size:8px;letter-spacing:1px;line-height:2.2">WAVE REWARDS:\n7 → 1,000 $$\n8 → 4,000 $$\n9 → 6,000 $$</pre>';
    if (s) s.classList.add('arcade-victory');
    this._showScreen('gameover');
  }

  _arcadeTickSpawn() {
    const wc = ARCADE_WAVES[this.arcadeWave - 1];
    if (!wc) return;
    if (wc.boss) {
      if (this._arcadeFinalBossIntro && this.gameTime < (this._arcadeFinalBossIntroUntil || 0)) return;
      if (this._arcadeFinalBossIntro) this._arcadeFinalBossIntro = false;
      if (!this._arcadeBossSpawned) {
        this._arcadeBossSpawned = true;
        if (this._arcadeWaveStartTime == null) this._arcadeWaveStartTime = this.gameTime;
        this._arcadeSpawnBoss();
      }
      return;
    }
    if (this._arcadeWaveStartTime == null) this._arcadeWaveStartTime = this.gameTime;
    const t = this.gameTime - this._arcadeWaveStartTime;
    const state = this._arcadeSpawned;

    const r = wc.rocks || {};
    const totalRocks = (r.small || 0) + (r.med || 0) + (r.large || 0);
    if (totalRocks > 0 && state.rocks < totalRocks) {
      const batchInterval = Math.max(18, Math.floor(120 / Math.min(8, Math.ceil(totalRocks / 4))));
      const toSpawn = Math.min(4, totalRocks - state.rocks);
      if (t >= state.rocks * batchInterval) {
        for (let i = 0; i < toSpawn; i++) {
          const idx = state.rocks + i;
          let size = idx < (r.small || 0) ? 'small' : idx < (r.small || 0) + (r.med || 0) ? 'medium' : 'large';
          const pos = this._findSafeSpawnPoint(40, this.ship, 200);
          this.asteroids.push(new Asteroid(pos.x, pos.y, size, null, 1));
        }
        state.rocks = Math.min(state.rocks + toSpawn, totalRocks);
      }
    }

    const alienDelay = 30, alienInterval = 60;
    if (wc.aliens > 0 && state.aliens < wc.aliens && t >= alienDelay + state.aliens * alienInterval) {
      const { x, y } = this._edgeSpawn();
      this.yellowAliens.push(new YellowAlien(x, y));
      state.aliens++;
    }

    const missileDelay = 60, missileInterval = 50;
    if (wc.missiles > 0 && state.missiles < wc.missiles && t >= missileDelay + state.missiles * missileInterval) {
      const { x, y } = this._edgeSpawn();
      this.orangeRockets.push(new OrangeHomingRocket(x, y));
      state.missiles++;
    }

    const jetDelay = 90, jetInterval = 55;
    if (wc.jets > 0 && state.jets < wc.jets && t >= jetDelay + state.jets * jetInterval) {
      const { x, y } = this._edgeSpawn();
      this.redFighters.push(new RedFighter(x, y));
      state.jets++;
    }
  }

  async _arcadeAwardWaveShmips(waveNum) {
    const rewards = { 7: 1000, 8: 4000, 9: 6000 };
    const amt = rewards[waveNum];
    if (!amt) return;
    const tid = TG_USER?.id || this.userData?.telegram_id;
    try {
      if (tid && !OFFLINE_MODE) {
        const updated = await dbAddBonusShmips(tid, amt);
        if (updated) this.userData.shmips = updated.shmips;
      } else {
        this.userData.shmips = (this.userData.shmips || 0) + amt;
      }
    } catch (e) { console.warn('[arcade] wave reward failed:', e.message); }
  }

  _arcadeSpawnBoss() {
    const { x, y } = _randomBossSpawnPos(this.W, this.H);
    this.arcadeBosses.push(new BigBossAlien(x, y, this.W, { health: 7.2 })); // +20% HP
  }

  _startSurvivalBossFight() {
    if (this.arcadeMode || this.bossmanMode || this._survivalBossFight) return;
    this._survivalBossFight = true;
    this._arcadePurgeBetweenWaves();
    const n = this._survivalBossesDefeated;
    const bossNum = n + 1;
    const isRedCalmBoss = bossNum % 7 === 0; // Every 7th boss: red, no shooting, easy, +0.2
    const { x, y } = _randomBossSpawnPos(this.W, this.H);
    if (isRedCalmBoss) {
      this.arcadeBosses.push(new BigBossAlien(x, y, this.W, {
        health: 3,
        shootRate: 99999,
        canShootRockets: false,
        rocketRate: 99999,
        vx: 0.35,
        vy: 0.4,
        elite: false,
        color: '#ff2200',
        redCalm: true,
      }));
      new FloatingText(this.W / 2, this.H / 2, 'RED BOSS — EASY KILL +0.2', '#ff4466');
    } else {
      const o = buildScaledBossOpts(n);
      this.arcadeBosses.push(new BigBossAlien(x, y, this.W, {
        health: o.health,
        shootRate: o.shootRate,
        canShootRockets: o.canShootRockets,
        rocketRate: o.rocketRate,
        vx: o.vx,
        vy: o.vy,
        elite: o.elite,
      }));
      const tier = bossNum >= 20 ? ' — IMPOSSIBLE' : bossNum >= 10 ? ' — HARD' : '';
      new FloatingText(this.W / 2, this.H / 2, `BOSS ${bossNum} INCOMING${tier}`, '#ffd700');
    }
  }

  _onBossKilled() {
    this._addScore(5000);
    if (this.bossmanMode) {
      this._bossmanKills++;
      this._bossmanBetweenBosses = true;
      this._bossmanBetweenUntil = this.gameTime + 180; // 3 sec
      return;
    }
    if (!this.arcadeMode && this._survivalBossFight) {
      this._survivalBossFight = false;
      this._survivalBossesDefeated++;
      this._nextSurvivalBossScore += 1_000_000;
      this._bossScoreBoost = Number(((this._bossScoreBoost || 0) + 0.2).toFixed(2));
      new FloatingText(this.W / 2, this.H / 2 - 24, `SCORE BOOST +0.2 (x${(this.runScoreMultiplier + this._bossScoreBoost).toFixed(1)})`, '#ffee00');
    }
  }

  _spawnBossmanBoss() {
    const n = this._bossmanKills;
    const o = buildScaledBossOpts(n);
    // Tiers: easy 1–5, med 6–9, hard 10–13, impossible 14–19, 20+ no chance
    let hpMult = 1, fireMult = 1, moveMult = 1;
    if (n >= 19) {
      hpMult = 5.5 + (n - 19) * 0.8;
      fireMult = 3.2 + (n - 19) * 0.15;
      moveMult = 1.9 + (n - 19) * 0.06;
    } else if (n >= 13) {
      hpMult = 2.8 + (n - 13) * 0.35;
      fireMult = 1.85 + (n - 13) * 0.12;
      moveMult = 1.45 + (n - 13) * 0.04;
    } else if (n >= 9) {
      hpMult = 1.9 + (n - 9) * 0.2;
      fireMult = 1.45 + (n - 9) * 0.08;
      moveMult = 1.25 + (n - 9) * 0.03;
    } else if (n >= 5) {
      hpMult = 1.35 + (n - 5) * 0.12;
      fireMult = 1.2 + (n - 5) * 0.05;
      moveMult = 1.1 + (n - 5) * 0.02;
    } else {
      hpMult = 1 + n * 0.06;
      fireMult = 1 + n * 0.04;
      moveMult = 1 + n * 0.025;
    }
    const bulletSpread = n >= 6 ? 'triple' : n >= 2 ? 'split' : 'single';
    const { x, y } = _randomBossSpawnPos(this.W, this.H);
    this.arcadeBosses.push(new BigBossAlien(x, y, this.W, {
      health: o.health * 1.6 * hpMult,
      shootRate: Math.max(3, Math.floor(o.shootRate / fireMult)),
      canShootRockets: true,
      rocketRate: Math.max(8, Math.floor(o.rocketRate / (fireMult * 1.15))),
      vx: o.vx * moveMult,
      vy: o.vy * moveMult,
      elite: n >= 14,
      bulletSpread,
    }));
  }

  _bossmanTick() {
    if (!this.bossmanMode) return;
    if (this._bossmanBetweenBosses) {
      this._arcadePurgeBetweenWaves();
      if (this.gameTime >= this._bossmanBetweenUntil) {
        this._bossmanBetweenBosses = false;
        this._spawnBossmanBoss();
      }
      return;
    }
    if (this.arcadeBosses.length === 0) {
      this._bossmanBetweenBosses = true;
      this._bossmanBetweenUntil = this.gameTime + 180;
    }
  }

  _getBossHitDamage(source, boss) {
    if (source === 'rocket') return Math.max(1.5, boss.maxHealth * (this.bossmanMode ? 0.32 : 0.28)); // rockets shred bosses
    if (!this.bossmanMode) return 1;
    if (source === 'smart') return Math.max(1.0, boss.maxHealth * 0.22);
    return Math.max(0.08, boss.maxHealth * 0.025); // bullets are much weaker
  }

  _maintainAsteroids() {
    const timeS = this.gameTime / 60;
    const chaosAt = this._chaosAtSec ?? 600;
    const chaos = timeS >= chaosAt;
    const ramp5 = timeS >= 180 ? Math.floor(timeS / 180) * 0.25 : 0;
    const powerMult = this._powerMult ?? 1.0;
    const survivalCalm = !this.arcadeMode && !this.bossmanMode ? 1.15 : 1.0; // Survival ~15% slower spawns

    // During dogfight (red fighters or homing rockets active) keep the field sparse —
    // just enough rocks to use as cover; in chaos mode allow more
    const dogfight = (this.redFighters?.length > 0) || (this.orangeRockets?.length > 0);
    const baseRamp = 6 + Math.floor(timeS / 5); // ramp faster
    const lateBonus = timeS >= 600 ? 10 : timeS >= 360 ? 5 : 0;
    const targetCount = dogfight
      ? (chaos ? 12 + Math.floor(lateBonus / 2) : 6)
      : Math.min(baseRamp + (chaos ? 16 + lateBonus : 4), chaos ? 48 : 30);

    // Note: we never cull existing asteroids — they stay as cover during dogfights

    const spawnRamp = (1 + ramp5) * powerMult * (1 / survivalCalm);
    const tenMinAsteroidBoost = timeS >= 360 ? 1.2 : 1;
    const baseInterval = Math.max(85 - Math.floor(timeS * 0.9), 14) * survivalCalm;
    const spawnInterval = chaos
      ? Math.max(Math.floor((baseInterval - 22) / (1.3 * spawnRamp * tenMinAsteroidBoost)), 12)
      : Math.floor(baseInterval / (1.15 * spawnRamp));
    this.asteroidSpawnTimer++;
    if (this.asteroidSpawnTimer >= spawnInterval && this.asteroids.length < targetCount) {
      this.asteroidSpawnTimer = 0;
      const pos = this._findSafeSpawnPoint(60, this.ship, 180);
      const diffPct = Math.min(timeS / 150, 1); // bigger rocks sooner
      const roll = Math.random();
      const large = diffPct * 0.42;
      const med   = 0.18 + diffPct * 0.32;
      const size  = timeS < 30 ? 'small'
                  : roll < large ? 'large'
                  : roll < large + med ? 'medium'
                  : 'small';
      this.asteroids.push(new Asteroid(pos.x, pos.y, size, null, 1));
    }
  }

  // ── Main Loop ──────────────────────────────────────────────────────────────
  _loop(ts = performance.now()) {
    requestAnimationFrame(nextTs => this._loop(nextTs));
    if (!this._lastFrameTs) this._lastFrameTs = ts;
    const frameMs = Math.min(48, ts - this._lastFrameTs);
    this._lastFrameTs = ts;
    this._accum += frameMs;
    if (this.state !== 'game') {
      if (['menu','profile','store','gift-4hr','arsenal','guide','onboarding'].includes(this.state))
        drawGrid(this.ctx, this.W, this.H, this.tick++);
      return;
    }
    const step = 1000/60;
    while (this._accum >= step) { this.tick++; this._update(); this._accum -= step; }
    this._draw();
  }

  _update() {
    if (!this.ship?.alive) return;
    if (this._arcadeOutroActive) return;

    // PC: thrust always on
    if (this._isPC()) this.keys.up = true;

    // Input (Rambo: rockets only, no bullets)
    const betweenWaves = this.arcadeMode && this._arcadeBetweenWaves;
    if (!betweenWaves) {
      if (this.keys.fire && !this.ramboActive) this.ship.fire(this.bullets, this.fireballs, this.megaRaketas);
      if (this.keys.flare) { this.ship.useFlare(this.rockets, this.particles, this.orangeRockets); this.keys.flare = false; }
      this._tickRocketHoldAndSalvo();
      if (this.keys.shield){ this.ship.deployShield(); this.keys.shield = false; }
      if (this.keys.xforce){ this._activateXforce(); this.keys.xforce = false; }
    } else {
      this.keys.fire = this.keys.flare = this.keys.rocket = this.keys.shield = this.keys.xforce = false;
      this._rocketHoldFrames = 0;
      this._rocketSalvoActive = false;
      this.bullets = [];
      this.playerRockets = [];
      this.rockets = [];
      this.enemyBullets = [];
      this.fireballs = [];
      this.megaRaketas = [];
      this._updateRocketHoldUI(true);
    }

    // Xforce Lavian — red lasers kill all for 4 sec
    const XFORCE_COOLDOWN = 5 * 60 * 60; // 5 min in frames
    if (this._effUpgrades().xforce_lavian && this.xforceActiveUntil > 0 && this.gameTime < this.xforceActiveUntil) {
      this._processXforceLasers();
    }
    if (this.gameTime >= this.xforceCooldownUntil) this.xforceCooldownUntil = 0;

    // Rip n Dip — full lives 2 min → 10s countdown → 8s rainbow fury
    if (this._effUpgrades().rip_n_dip && this.ship?.alive) {
      const maxLives = this.ship.maxLives ?? 5;
      if (this.ship.lives >= maxLives) {
        if (this.ripFullLivesSince === 0) this.ripFullLivesSince = this.gameTime;
        const fullFor = this.gameTime - this.ripFullLivesSince;
        if (fullFor >= 7200) { // 2 min
          if (this.ripCountdownRemain === 0) this.ripCountdownRemain = 600; // 10 sec
          this.ripCountdownRemain--;
          if (this.ripCountdownRemain <= 0) {
            this.ripFuryUntil = this.gameTime + 480; // 8 sec
            this.ripFullLivesSince = 0;
            this.ripCountdownRemain = 0;
            new FloatingText(this.W/2, this.H/2, 'RIP N DIP!', '#ff00ff');
          }
        }
      } else {
        this.ripFullLivesSince = 0;
        this.ripCountdownRemain = 0;
      }
      this.ship.ripFuryActive = this.ripFuryUntil > 0 && this.gameTime < this.ripFuryUntil;
    }

    // Thrust sound
    if (this.keys.up && !this._wasThrusting) { SFX.thrustStart(); this._wasThrusting = true; }
    if (!this.keys.up && this._wasThrusting)  { SFX.thrustStop();  this._wasThrusting = false; }
    // Engine exhaust particles while thrusting
    if (this.ship?.thrusting && this.ship.alive) {
      const s = this.ship;
      // Tail is behind the nose direction
      const tailX = s.x - Math.cos(s.angle) * 13;
      const tailY = s.y - Math.sin(s.angle) * 13;
      const exhaustColors = ['#ff6600', '#ff9900', '#ffcc00', '#ffffff'];
      for (let i = 0; i < 2; i++) {
        const spread = (Math.random() - 0.5) * 0.7;
        const spd    = 1.8 + Math.random() * 2.2;
        const ang    = s.angle + Math.PI + spread;
        const p = new Particle(tailX, tailY, exhaustColors[Math.floor(Math.random() * exhaustColors.length)], 0, 10 + Math.floor(Math.random() * 8));
        p.vx = Math.cos(ang) * spd;
        p.vy = Math.sin(ang) * spd;
        p.radius = 1 + Math.random() * 1.5;
        this.particles.push(p);
      }
    }

    this.ship.update(this.keys, this.W, this.H);
    if (this.ship.tempLaserUntil > 0)      this.ship.tempLaserUntil--;
    if (this.ship.tempPinkBeamUntil > 0)   this.ship.tempPinkBeamUntil--;
    if (this.ship.tempRapidUntil > 0)      this.ship.tempRapidUntil--;
    if (this.ship.tempPowerBoostUntil > 0) this.ship.tempPowerBoostUntil--;
    if (this.ship.tempStarUntil > 0)       this.ship.tempStarUntil--;
    if (this.ship.tempMonsterFuelUntil > 0) this.ship.tempMonsterFuelUntil--;
    if (this.ship.tempRamboUntil > 0) this.ship.tempRamboUntil--;
    if (this.ship.tempRamboUntil <= 0) this.ramboActive = false;

    // Rambo: auto-fire rockets every 18 frames for 5 sec
    if (this.ramboActive && this.ship.tempRamboUntil > 0 && this.ship.alive) {
      if (!this._ramboRocketCooldown) this._ramboRocketCooldown = 0;
      this._ramboRocketCooldown--;
      if (this._ramboRocketCooldown <= 0) {
        this._ramboRocketCooldown = 18;
        const nose = { x: this.ship.x + Math.cos(this.ship.angle) * 16, y: this.ship.y + Math.sin(this.ship.angle) * 16 };
        this.playerRockets.push(new PlayerRocket(nose.x, nose.y, this.ship.angle, this.ship.smartRocket, false, this.ship.rocketSkinColor));
        SFX.rocketFire();
      }
    }

    // JEW METHOD: magnet — strong pull with non-linear falloff
    if (this.ship.hasMagnet) {
      const MAGNET_R = 300, MAGNET_F = 1.8;
      [...this.coins, ...this.mysteryPickups, ...this.monsterFuels].forEach(p => {
        const d = dist(this.ship, p);
        if (d > 0 && d < MAGNET_R) {
          const ang   = Math.atan2(this.ship.y - p.y, this.ship.x - p.x);
          const t     = 1 - d / MAGNET_R;
          const force = MAGNET_F * t * t; // quadratic — snaps hard when close
          p.x += Math.cos(ang) * force;
          p.y += Math.sin(ang) * force;
        }
      });
    }

    // Spawn enemies
    // ── Time-based difficulty ──────────────────────────────────────────────
    this.gameTime++;
    const timeS = this.gameTime / 60; // seconds elapsed

    // Update music tier every ~3 minutes
    const musicTier = timeS < 180 ? 1 : timeS < 360 ? 2 : timeS < 540 ? 3 : timeS < 720 ? 4 : 5;
    if (musicTier !== this._lastMusicTier) {
      this._lastMusicTier = musicTier;
      SFX.startGameMusic(musicTier * 5);
    }

    // Survival boss milestone: every 1,000,000 score
    if (!this.arcadeMode && !this.bossmanMode && !this._spawnFrozen && !this._survivalBossFight && this.score >= this._nextSurvivalBossScore) {
      this._startSurvivalBossFight();
    }

    // Maintain asteroid population (continuous spawning from edges) — skip in Arcade
    if (!this.arcadeMode && !this.bossmanMode && !this._spawnFrozen && !this._survivalBossFight) this._maintainAsteroids();

    // Skip enemy spawns during spawn-freeze grace period — Arcade uses staggered wave spawns
    if (this.arcadeMode && !this._spawnFrozen) {
      this._arcadeTickSpawn();
    }
    else if (this.bossmanMode && !this._spawnFrozen) {
      this._bossmanTick();
    }
    else if (this._survivalBossFight) { /* boss-only window */ }
    else if (this._spawnFrozen) { /* no spawns */ }
    else {
    const chaosAt = this._chaosAtSec ?? 600;
    const chaos = timeS >= chaosAt;
    const powerMult = this._powerMult ?? 1.0;
    const survivalCalm = !this.arcadeMode && !this.bossmanMode ? 0.85 : 1.0; // Survival ~15% easier
    const dMult = 1.7 * powerMult * survivalCalm; // higher base = more action
    const ramp5 = timeS >= 180 ? Math.floor(timeS / 180) * 0.3 : 0;
    const tenMinRamp = timeS >= 360 ? Math.min(0.35, (timeS - 360) / 600) : 0; // +35% after 6 min
    const lateRamp = timeS >= 600 ? Math.min(0.6, (timeS - 600) / 1200) : 0; // +60% after 10 min
    const spawnMult = dMult + ramp5 + tenMinRamp + lateRamp;

    // Yellow aliens: appear after 12 sec; 2 before chaos, 4 in late chaos
    const alienMax = chaos ? (timeS >= 600 ? 4 : 3) : 2;
    const alienInterval = Math.floor((chaos
      ? Math.max(500 - Math.floor(timeS * 3.2), timeS >= 600 ? 120 : 180)
      : Math.max(800 - Math.floor(timeS * 2.5), 220)) / spawnMult);
    this.yellowAlienTimer++;
    if (this.yellowAlienTimer > alienInterval && timeS >= 12) {
      this.yellowAlienTimer = 0;
      if (this.yellowAliens.length < alienMax) {
        const { x, y } = this._edgeSpawn();
        this.yellowAliens.push(new YellowAlien(x, y));
      }
    }
    // Red fighters: appear after 45 sec; higher cap, faster spawns
    const redCapBase = Math.max(1, Math.floor((timeS - 45) / (32 / powerMult)));
    const redCap = chaos ? redCapBase + Math.floor(timeS / (220 / powerMult)) + (timeS >= 600 ? 4 : timeS >= 360 ? 2 : 1) : redCapBase + 1;
    const redInterval = Math.floor((chaos
      ? Math.max(550 - Math.floor(timeS * 2.8), timeS >= 600 ? 140 : 180)
      : Math.max(750 - Math.floor(timeS * 2.0), 280)) / spawnMult);
    this.redFighterTimer++;
    if (this.redFighterTimer > redInterval && timeS >= 45) {
      this.redFighterTimer = 0;
      if (this.redFighters.length < redCap) {
        const { x, y } = this._edgeSpawn();
        this.redFighters.push(new RedFighter(x, y));
      }
    }
    // Orange homing rockets: appear after 55 sec; more rockets, faster spawns
    const orangeStart = 55;
    const orangeCapBase = 1 + Math.floor((timeS - orangeStart) / (38 / powerMult));
    const orangeCapMax = chaos ? (timeS >= 600 ? 12 : timeS >= 360 ? 9 : 8) : 6;
    const orangeCap = Math.min(chaos ? orangeCapBase + 3 : orangeCapBase + 2, orangeCapMax);
    const orangeInterval = Math.floor((chaos
      ? Math.max(450 - Math.floor((timeS - orangeStart) * 2.8), timeS >= 600 ? 100 : 140)
      : Math.max(550 - Math.floor((timeS - orangeStart) * 2.0), 180)) / spawnMult);
    this.orangeRocketTimer++;
    if (this.orangeRocketTimer > orangeInterval && timeS >= orangeStart) {
      this.orangeRocketTimer = 0;
      if (this.orangeRockets.length < orangeCap) {
        const { x, y } = this._edgeSpawn();
        this.orangeRockets.push(new OrangeHomingRocket(x, y));
      }
    }
    } // end spawn-freeze guard

    // Update entities
    {
    this.asteroids.forEach(a => a.update(this.W, this.H));
    this.bullets.forEach(b => b.update(this.W, this.H));
    this.bullets = this.bullets.filter(b => !b.dead);
    this.enemyBullets.forEach(b => b.update(this.W, this.H));
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);
    this.rockets.forEach(r => r.update(this.W, this.H));
    this.rockets = this.rockets.filter(r => !r.dead);
    const _rocketTargets = [...this.orangeRockets, ...this.redFighters, ...this.yellowAliens, ...this.asteroids];
    this.playerRockets.forEach((r, i) => r.update(this.W, this.H, _rocketTargets, this.ship, i));
    this.playerRockets = this.playerRockets.filter(r => !r.dead);
    // MegaRaketa: fly forward then split into 7 mini homing rockets
    this.megaRaketas.forEach(mr => mr.update(this.W, this.H));
    for (let mi = this.megaRaketas.length - 1; mi >= 0; mi--) {
      if (this.megaRaketas[mi].dead) {
        const mr = this.megaRaketas[mi];
        const isSR = mr._isSuperRaketa;
        const miniCount = isSR ? 6 : 7;
        burst(this.particles, mr.x, mr.y, isSR ? '#00ff44' : '#ff4400', 18, 4, 28);
        for (let j = 0; j < miniCount; j++) {
          const spread = miniCount === 6 ? (j - 2.5) * 0.42 : (j - 3) * 0.38;
          const ang = mr.angle + spread + (Math.random() - 0.5) * 0.1;
          const pr = new PlayerRocket(mr.x, mr.y, ang, false, true);
          if (isSR) pr._fromSuperRaketa = true;
          this.playerRockets.push(pr);
        }
        this.megaRaketas.splice(mi, 1);
      }
    }
    this.fireballs.forEach(f => f.update(this.W, this.H));
    // Handle fireball detonations
    for (let fi = this.fireballs.length - 1; fi >= 0; fi--) {
      const fb = this.fireballs[fi];
      if (fb.exploded) {
        this._detonateFireball(fb);
        this.fireballs.splice(fi, 1);
      }
    }
    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);
    // Performance cap: max 250 particles to prevent lag on older devices
    if (this.particles.length > 250) this.particles.splice(0, this.particles.length - 250);
    this.redFighters.forEach(rf => rf.update(this.ship, this.enemyBullets, this.W, this.H, this.particles));
    this.redFighters = this.redFighters.filter(rf => !rf.dead);
    this.yellowAliens.forEach(ya => ya.update(this.rockets, this.W, this.H, this.particles));
    this.yellowAliens = this.yellowAliens.filter(ya => !ya.dead);
    this.orangeRockets.forEach(or => or.update(this.ship, this.W, this.H, this.particles));
    this.arcadeBosses.forEach(b => b.update(this.ship, this.enemyBullets, this.W, this.H, this.orangeRockets));
    this.arcadeBosses = this.arcadeBosses.filter(b => !b.dead);
    // Auto-flare: if player has flares and an orange rocket is dangerously close, auto-deploy
    if (this.ship.flares > 0 && this.orangeRockets.length > 0) {
      const autoFlareR = 80;
      for (const or of this.orangeRockets) {
        if (dist(or, this.ship) < autoFlareR) {
          this.ship.useFlare(this.rockets, this.particles, this.orangeRockets);
          break;
        }
      }
    }
    this.orangeRockets = this.orangeRockets.filter(or => !or.dead);

    // HORNET ASSISTANT: spawn friendly jet when 2 lives or less (once per run)
    if (!this._spawnFrozen && this.ship.hasHornetAssistant && !this._hornetSpawnedThisRun && this.ship.lives <= 2) {
      this._hornetSpawnedThisRun = true;
      const corners = [
        { x: this.W * 0.08, y: this.H * 0.15 },
        { x: this.W * 0.92, y: this.H * 0.15 },
        { x: this.W * 0.08, y: this.H * 0.85 },
        { x: this.W * 0.92, y: this.H * 0.85 },
      ];
      const pos = corners[rngInt(0, 3)];
      this.friendlyJets.push(new FriendlyJet(pos.x, pos.y, this.ship));
      new FloatingText(this.ship.x, this.ship.y - 40, 'HORNET ASSIST!', '#00ff88');
    }
    this.friendlyJets.forEach(fj => fj.update(this));
    this.friendlyJets = this.friendlyJets.filter(fj => !fj.dead);

    this.coins.forEach(c => c.update());
    this.coins = this.coins.filter(c => !c.dead);
    this.mysteryPickups.forEach(m => m.update());
    this.mysteryPickups = this.mysteryPickups.filter(m => !m.dead);
    this.greenStars.forEach(s => s.update());
    this.greenStars = this.greenStars.filter(s => !s.dead);
    this.monsterFuels.forEach(m => m.update());
    this.monsterFuels = this.monsterFuels.filter(m => !m.dead);
    }

    // Green Star booster spawn: one star every 3-5 minutes, stays 3s — skip in Arcade
    if (!this.arcadeMode) {
    this.greenStarTimer--;
    if (this.greenStarTimer <= 0 && this.greenStars.length === 0) {
      const p = this._findSafeSpawnPoint(80, this.ship, 190);
      this.greenStars.push(new GreenStarPickup(p.x, p.y));
      this.greenStarTimer = rngInt(60 * 90, 60 * 150);
    }
    }
    // Hover/collect behavior (skip in Arcade — no green stars)
    if (!this.arcadeMode) {
    for (let si = this.greenStars.length - 1; si >= 0; si--) {
      if (dist(this.greenStars[si], this.ship) < this.ship.radius + this.greenStars[si].radius + 10) {
        this._activateGreenStar(this.greenStars[si]);
        this.greenStars.splice(si, 1);
      }
    }
    }

    // Monster Fuel spawn: every 3-4 minutes, less common than $ and ? — skip in Arcade
    if (!this.arcadeMode) {
    this.monsterFuelTimer--;
    if (this.monsterFuelTimer <= 0 && this.monsterFuels.length === 0) {
      const p = this._findSafeSpawnPoint(80, this.ship, 190);
      this.monsterFuels.push(new MonsterFuelPickup(p.x, p.y));
      this.monsterFuelTimer = rngInt(60 * 120, 60 * 180);
    }
    for (let mi = this.monsterFuels.length - 1; mi >= 0; mi--) {
      if (dist(this.monsterFuels[mi], this.ship) < this.ship.radius + this.monsterFuels[mi].radius + 12) {
        this._activateMonsterFuel(this.monsterFuels[mi]);
        this.monsterFuels.splice(mi, 1);
      }
    }
    }

    // Spawn pickups (no spawn during 2s grace) — skip in Arcade
    if (!this.arcadeMode) {
    this.pickupSpawnTimer++;
    if (!this._spawnFrozen && this.pickupSpawnTimer > 360 && this.coins.length === 0 && this.mysteryPickups.length === 0) {
      this.pickupSpawnTimer = 0;
      const p = this._findSafeSpawnPoint(60, this.ship, 120);
      const x = p.x, y = p.y;
      if (Math.random() < 0.53) this.coins.push(new CoinPickup(x, y));
      else this.mysteryPickups.push(new MysteryPickup(x, y));
    }
    }

    // Arcade: wave clear check + between-waves restock
    if (this.arcadeMode && this.ship?.alive) {
      if (this._arcadeBetweenWaves) {
        if (this.gameTime >= this._arcadeBetweenWavesUntil) {
          this._arcadeBetweenWaves = false;
          const nextWave = this.arcadeWave + 1;
          if (nextWave <= 10) {
            const clearedWave = this.arcadeWave;
            this.arcadeWave = nextWave;
            this._arcadeRestockShip();
            this._arcadeWaveStartTime = null;
            this._arcadeSpawned = { rocks: 0, aliens: 0, missiles: 0, jets: 0 };
            this._arcadeBossSpawned = false;
            if (nextWave === 10) {
              this._arcadeFinalBossIntro = true;
              this._arcadeFinalBossIntroUntil = this.gameTime + 120; // 2 sec
              SFX.startGameMusic(50); // intense/scary tier
            }
            this._arcadeAwardWaveShmips(clearedWave);
          } else {
            this._arcadeVictory();
          }
        }
      } else {
        const wc = ARCADE_WAVES[this.arcadeWave - 1];
        const state = this._arcadeSpawned || { rocks: 0, aliens: 0, missiles: 0, jets: 0 };
        const r = wc?.rocks || {};
        const totalRocks = (r.small || 0) + (r.med || 0) + (r.large || 0);
        const waveHasContent = totalRocks > 0 || (wc?.aliens || 0) > 0 || (wc?.missiles || 0) > 0 || (wc?.jets || 0) > 0 || wc?.boss;
        const spawnDone = !!wc && (
          wc.boss
            ? !!this._arcadeBossSpawned
            : state.rocks >= totalRocks &&
              state.aliens >= (wc.aliens || 0) &&
              state.missiles >= (wc.missiles || 0) &&
              state.jets >= (wc.jets || 0)
        );
        const entitiesGone = this.asteroids.length === 0 && this.redFighters.length === 0 &&
          this.yellowAliens.length === 0 && this.orangeRockets.length === 0 && this.arcadeBosses.length === 0;
        const minTimeElapsed = this._arcadeWaveStartTime != null && (this.gameTime - this._arcadeWaveStartTime) > 120;
        const bossWaveCanEnd = !!wc?.boss && spawnDone && entitiesGone;
        const allClear = entitiesGone && (!waveHasContent || (spawnDone && (bossWaveCanEnd || minTimeElapsed)));
        if (allClear) {
          this._arcadePurgeBetweenWaves();
          this._arcadeLastClearedWave = this.arcadeWave;
          if (this.arcadeWave >= 10) {
            this._arcadeVictory();
          } else {
            this._arcadeBetweenWaves = true;
            this._arcadeBetweenWavesUntil = this.gameTime + 480; // 8 seconds
          }
        }
      }
    }

    this._collisions();
  }

  _edgeSpawn() {
    const side = rngInt(0, 3), m = 30;
    if (side===0) return{x:rng(200,this.W - 140),y:-m};
    if (side===1) return{x:this.W+m,y:rng(110,this.H - 260)};
    if (side===2) return{x:rng(200,this.W - 140),y:this.H+m};
    return{x:-m,y:rng(110,this.H - 260)};
  }

  _collisions() {
    const ship = this.ship;

    // ── COLLECTOR: bullets collect $, ?, and green star ────────────────────
    if (ship.hasCollector) {
      for (let bi = this.bullets.length-1; bi >= 0; bi--) {
        const b = this.bullets[bi];
        let hit = false;
        for (let ci = this.coins.length-1; ci >= 0; ci--) {
          if (dist(b, this.coins[ci]) < this.coins[ci].radius + b.radius) {
            this.runShmipsBonus += 5;
            SFX.coinPickup();
            burst(this.particles, this.coins[ci].x, this.coins[ci].y, '#ffdd00', 6, 2, 15);
            new FloatingText(this.coins[ci].x, this.coins[ci].y - 20, '+5 SHMIP', '#ffdd00');
            this.coins.splice(ci, 1);
            hit = true; break;
          }
        }
        if (!hit) {
          for (let mi = this.mysteryPickups.length-1; mi >= 0; mi--) {
            if (dist(b, this.mysteryPickups[mi]) < this.mysteryPickups[mi].radius + b.radius) {
              this._applyMysteryReward(this.mysteryPickups[mi].x, this.mysteryPickups[mi].y);
              this.mysteryPickups.splice(mi, 1);
              hit = true; break;
            }
          }
        }
        if (!hit) {
          for (let mi = this.monsterFuels.length-1; mi >= 0; mi--) {
            if (dist(b, this.monsterFuels[mi]) < this.monsterFuels[mi].radius + b.radius) {
              this._activateMonsterFuel(this.monsterFuels[mi]);
              this.monsterFuels.splice(mi, 1);
              hit = true; break;
            }
          }
        }
        if (!hit) {
          // COLLECTOR also shoots the green star to collect its power from range
          for (let gi = this.greenStars.length-1; gi >= 0; gi--) {
            if (dist(b, this.greenStars[gi]) < this.greenStars[gi].radius + b.radius + 4) {
              this._activateGreenStar(this.greenStars[gi]);
              this.greenStars.splice(gi, 1);
              hit = true; break;
            }
          }
        }
        if (hit) { this.bullets.splice(bi, 1); }
      }
    }

    // ── Ship vs coin ────────────────────────────────────────────────────────
    for (let ci = this.coins.length-1; ci >= 0; ci--) {
      if (dist(ship, this.coins[ci]) < ship.radius + this.coins[ci].radius) {
        const{x,y} = this.coins[ci];
        this.runShmipsBonus += 5;
        SFX.coinPickup();
        burst(this.particles, x, y, '#ffdd00', 8, 2, 20);
        this.coins.splice(ci, 1);
        new FloatingText(x, y-20, '+5 SHMIP', '#ffdd00');
      }
    }

    // ── Ship vs mystery ─────────────────────────────────────────────────────
    for (let mi = this.mysteryPickups.length-1; mi >= 0; mi--) {
      if (dist(ship, this.mysteryPickups[mi]) < ship.radius + this.mysteryPickups[mi].radius) {
        const{x,y} = this.mysteryPickups[mi];
        this._applyMysteryReward(x, y);
        this.mysteryPickups.splice(mi, 1);
      }
    }

    // ── Player bullets vs asteroids ─────────────────────────────────────────
    for (let bi = this.bullets.length-1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      let bHit = false;
      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (dist(b, a) < a.radius) {
          this.bullets.splice(bi,1); bHit=true;
          if (ship.tempPowerBoostUntil > 0) {
            // One-shot: obliterate completely, no fragments
            burst(this.particles, a.x, a.y, C.asteroid, 22, 5, 40);
            SFX.explodeLarge();
            this._addScore(a.score * 3);
            this.asteroids.splice(ai, 1);
          } else {
            const frags = a.split(this.particles);
            this.asteroids.splice(ai, 1, ...frags);
            this._addScore(a.score);
          }
          break;
        }
      }
      if (bHit) continue;

      // ── bullets vs red fighters ──────────────────────────────────────────
      for (let ei = this.redFighters.length-1; ei >= 0; ei--) {
        if (dist(b, this.redFighters[ei]) < this.redFighters[ei].radius) {
          this.bullets.splice(bi,1);
          const redOneShot = ship.tempPowerBoostUntil > 0;
          if (redOneShot) this.redFighters[ei].health = 1; // force one-hit kill
          if (this.redFighters[ei].hit(this.particles)) {
            burst(this.particles, this.redFighters[ei].x, this.redFighters[ei].y, C.enemyRed, 20, 5, 35);
            this._addScore(CFG.enemyRedScore * (redOneShot ? 3 : 1));
            this.redFighters.splice(ei, 1);
            // ACE: +1 life per jet kill
            if (ship.hasAce && ship.lives < 5) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); }
          }
          break;
        }
      }
    }

    // ── bullets vs yellow aliens ─────────────────────────────────────────────
    for (let bi = this.bullets.length-1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ei = this.yellowAliens.length-1; ei >= 0; ei--) {
        if (dist(b, this.yellowAliens[ei]) < this.yellowAliens[ei].radius) {
          this.bullets.splice(bi,1);
          const alienOneShot = ship.tempPowerBoostUntil > 0;
          if (alienOneShot) this.yellowAliens[ei].health = 1; // force one-hit kill
          if (this.yellowAliens[ei].hit(this.particles)) {
            burst(this.particles, this.yellowAliens[ei].x, this.yellowAliens[ei].y, C.enemyYellow, 20, 5, 35);
            this._addScore(CFG.enemyYellowScore * (alienOneShot ? 3 : 1));
            this.yellowAliens.splice(ei, 1);
            // ZEP ZEP ZEP: +1 rocket per alien kill
            if (ship.hasZepZep) { ship.rocketAmmo++; new FloatingText(ship.x, ship.y-30, '+1 ROCKET! (ZEP)', '#ffee00'); }
          }
          break;
        }
      }
      for (let ei = this.arcadeBosses.length-1; ei >= 0; ei--) {
        if (dist(b, this.arcadeBosses[ei]) < this.arcadeBosses[ei].radius) {
          this.bullets.splice(bi, 1);
          const boss = this.arcadeBosses[ei];
          if (boss.hit(this.particles, this._getBossHitDamage('bullet', boss))) {
            burst(this.particles, this.arcadeBosses[ei].x, this.arcadeBosses[ei].y, '#ffd700', 30, 6, 45);
            this._onBossKilled();
            this.arcadeBosses.splice(ei, 1);
          }
          break;
        }
      }
    }

    // ── Player rockets — normal (proximity blast) ────────────────────────────
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      if (r.smart || !r.readyToDetonate) continue;

      let nearestDist = Infinity;
      for (const t of [...this.asteroids, ...this.redFighters, ...this.yellowAliens, ...this.orangeRockets, ...this.arcadeBosses])
        nearestDist = Math.min(nearestDist, dist(r, t) - (t.radius || 0));
      if (nearestDist > r.proximityR) continue;

      // Proximity blast
      burst(this.particles, r.x, r.y, '#ff8800', 28, 5, 50);
      SFX.rocketExplode();
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * TAU;
        this.particles.push(new Particle(r.x + Math.cos(ang) * r.blastR * 0.7, r.y + Math.sin(ang) * r.blastR * 0.7, '#ff8800', 1.5, 18));
      }
      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        if (dist(r, this.asteroids[ai]) < r.blastR + this.asteroids[ai].radius) {
          const frags = this.asteroids[ai].split(this.particles);
          this._addScore(this.asteroids[ai].score * 2);
          this.asteroids.splice(ai, 1, ...frags);
        }
      }
      for (let ei = this.redFighters.length-1; ei >= 0; ei--) {
        if (dist(r, this.redFighters[ei]) < r.blastR + this.redFighters[ei].radius) {
          burst(this.particles, this.redFighters[ei].x, this.redFighters[ei].y, C.enemyRed, 16, 4, 30);
          SFX.enemyDie(); this._addScore(CFG.enemyRedScore * 2);
          if (ship.hasAce && ship.lives < 5) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); }
          this.redFighters.splice(ei, 1);
        }
      }
      for (let ei = this.yellowAliens.length-1; ei >= 0; ei--) {
        if (dist(r, this.yellowAliens[ei]) < r.blastR + this.yellowAliens[ei].radius) {
          burst(this.particles, this.yellowAliens[ei].x, this.yellowAliens[ei].y, C.enemyYellow, 16, 4, 30);
          SFX.enemyDie(); this._addScore(CFG.enemyYellowScore * 2);
          if (ship.hasZepZep) { ship.rocketAmmo++; new FloatingText(ship.x, ship.y-30, '+1 ROCKET! (ZEP)', '#ffee00'); }
          this.yellowAliens.splice(ei, 1);
        }
      }
      for (let ei = this.orangeRockets.length-1; ei >= 0; ei--) {
        if (dist(r, this.orangeRockets[ei]) < r.blastR + this.orangeRockets[ei].radius) {
          burst(this.particles, this.orangeRockets[ei].x, this.orangeRockets[ei].y, '#ff7700', 12, 3, 25);
          this._addScore(150); this.orangeRockets[ei].dead = true; this.orangeRockets.splice(ei, 1);
        }
      }
      for (let ei = this.arcadeBosses.length-1; ei >= 0; ei--) {
        if (dist(r, this.arcadeBosses[ei]) < r.blastR + this.arcadeBosses[ei].radius) {
          const boss = this.arcadeBosses[ei];
          if (boss.hit(this.particles, this._getBossHitDamage('rocket', boss))) {
            burst(this.particles, this.arcadeBosses[ei].x, this.arcadeBosses[ei].y, '#ffd700', 30, 6, 45);
            this._onBossKilled(); this.arcadeBosses.splice(ei, 1);
          }
        }
      }
      r.afterDetonate();
    }

    // ── Smart rocket — direct-hit pierce → big final explosion on 5th kill ───
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      if (!r.smart || !r.readyToDetonate) continue;

      let hitSomething = false;

      // Check direct contact with any target
      const _smartKill = (x, y, col, scorePts, extraFn) => {
        burst(this.particles, x, y, col, 12, 3, 22);
        SFX.enemyDie(); this._addScore(scorePts);
        if (extraFn) extraFn();
        hitSomething = true;
        return r.smartHit(); // returns true if this was the 5th kill
      };

      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        if (dist(r, this.asteroids[ai]) < this.asteroids[ai].radius + r.radius) {
          const a = this.asteroids[ai];
          const frags = a.split(this.particles);
          this.asteroids.splice(ai, 1, ...frags);
          if (_smartKill(a.x, a.y, C.asteroid, a.score * 2, null)) { r.destroy(); break; }
          break;
        }
      }
      if (r._dead) { _doFinalBlast(r, this); continue; }

      for (let ei = this.redFighters.length-1; ei >= 0 && !r._dead; ei--) {
        if (dist(r, this.redFighters[ei]) < this.redFighters[ei].radius + r.radius) {
          const rf = this.redFighters[ei];
          this.redFighters.splice(ei, 1);
          const fin = _smartKill(rf.x, rf.y, C.enemyRed, CFG.enemyRedScore * 2,
            () => { if (ship.hasAce && ship.lives < 5) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); } });
          if (fin) { r.destroy(); break; }
          break;
        }
      }
      if (r._dead) { _doFinalBlast(r, this); continue; }

      for (let ei = this.yellowAliens.length-1; ei >= 0 && !r._dead; ei--) {
        if (dist(r, this.yellowAliens[ei]) < this.yellowAliens[ei].radius + r.radius) {
          const ya = this.yellowAliens[ei];
          this.yellowAliens.splice(ei, 1);
          const fin = _smartKill(ya.x, ya.y, C.enemyYellow, CFG.enemyYellowScore * 2,
            () => { if (ship.hasZepZep) { ship.rocketAmmo++; new FloatingText(ship.x, ship.y-30, '+1 ROCKET! (ZEP)', '#ffee00'); } });
          if (fin) { r.destroy(); break; }
          break;
        }
      }
      if (r._dead) { _doFinalBlast(r, this); continue; }

      for (let ei = this.orangeRockets.length-1; ei >= 0 && !r._dead; ei--) {
        if (dist(r, this.orangeRockets[ei]) < this.orangeRockets[ei].radius + r.radius) {
          const or_ = this.orangeRockets[ei];
          this.orangeRockets[ei].dead = true; this.orangeRockets.splice(ei, 1);
          const fin = _smartKill(or_.x, or_.y, '#ff7700', 150, null);
          if (fin) { r.destroy(); break; }
          break;
        }
      }
      for (let ei = this.arcadeBosses.length-1; ei >= 0 && !r._dead; ei--) {
        if (dist(r, this.arcadeBosses[ei]) < this.arcadeBosses[ei].radius + r.radius) {
          const boss = this.arcadeBosses[ei];
          if (boss.hit(this.particles, this._getBossHitDamage('smart', boss))) {
            burst(this.particles, boss.x, boss.y, '#ffd700', 30, 6, 45);
            this._onBossKilled();
            this.arcadeBosses.splice(ei, 1);
          }
          r.destroy();
          break;
        }
      }
      if (r._dead) _doFinalBlast(r, this);
    }

    // ── Asteroids vs ship ───────────────────────────────────────────────────
    for (const a of this.asteroids) {
      if (dist(ship,a) < a.radius+ship.radius) {
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }

    // ── Enemy bullets vs ship ───────────────────────────────────────────────
    for (let ei = this.enemyBullets.length-1; ei >= 0; ei--) {
      if (dist(this.enemyBullets[ei],ship) < ship.radius+this.enemyBullets[ei].radius) {
        this.enemyBullets.splice(ei,1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }

    // ── Enemy rockets vs ship ───────────────────────────────────────────────
    for (let ri = this.rockets.length-1; ri >= 0; ri--) {
      if (dist(this.rockets[ri],ship) < ship.radius+this.rockets[ri].radius) {
        burst(this.particles, this.rockets[ri].x, this.rockets[ri].y, C.rocket, 12, 4);
        this.rockets.splice(ri,1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }

    // Rockets vs asteroids
    for (let ri = this.rockets.length-1; ri >= 0; ri--) {
      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        if (dist(this.rockets[ri],this.asteroids[ai]) < this.asteroids[ai].radius+this.rockets[ri].radius) {
          burst(this.particles, this.rockets[ri].x, this.rockets[ri].y, C.rocket, 8, 3);
          this.rockets.splice(ri,1); break;
        }
      }
    }

    // Red fighters vs asteroids — fighter AND asteroid destroyed on crash
    for (let fi = this.redFighters.length-1; fi >= 0; fi--) {
      const rf = this.redFighters[fi];
      let hitAi = -1;
      for (let ai = 0; ai < this.asteroids.length; ai++) {
        if (dist(rf, this.asteroids[ai]) < rf.radius + this.asteroids[ai].radius) { hitAi = ai; break; }
      }
      if (hitAi >= 0) {
        const a = this.asteroids[hitAi];
        const frags = a.split(this.particles);
        this.asteroids.splice(hitAi, 1, ...frags);
        this._addScore(a.score);
        burst(this.particles, rf.x, rf.y, C.enemyRed, 18, 4, 30);
        SFX.enemyDie(); this.redFighters.splice(fi, 1);
      }
    }

    // ── Orange rockets vs red fighters ─────────────────────────────────────────
    for (let oi = this.orangeRockets.length-1; oi >= 0; oi--) {
      const or = this.orangeRockets[oi];
      if (or.dead) continue;
      for (let fi = this.redFighters.length-1; fi >= 0; fi--) {
        if (dist(or, this.redFighters[fi]) < this.redFighters[fi].radius + or.radius) {
          or._explode(this.particles);
          burst(this.particles, this.redFighters[fi].x, this.redFighters[fi].y, C.enemyRed, 20, 5, 35);
          SFX.enemyDie();
          this._addScore(CFG.enemyRedScore);
          if (ship.hasAce && ship.lives < 5) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); }
          this.redFighters.splice(fi, 1);
          break;
        }
      }
    }

    // Red fighters vs ship
    for (let fi = this.redFighters.length-1; fi >= 0; fi--) {
      const rf = this.redFighters[fi];
      if (dist(rf,ship) < rf.radius+ship.radius) {
        burst(this.particles, rf.x, rf.y, C.enemyRed, 20, 5, 35);
        SFX.enemyDie(); this.redFighters.splice(fi,1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }

    // Arcade boss vs ship
    for (let fi = this.arcadeBosses.length-1; fi >= 0; fi--) {
      const boss = this.arcadeBosses[fi];
      if (dist(boss, ship) < boss.radius + ship.radius) {
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }

    // ── Fireballs vs asteroids/enemies (early trigger on direct hit) ─────────
    for (let fi = this.fireballs.length - 1; fi >= 0; fi--) {
      const fb = this.fireballs[fi];
      let triggered = false;
      for (const a of this.asteroids) {
        if (dist(fb, a) < a.radius + fb.radius) { triggered = true; break; }
      }
      if (!triggered) {
        for (const e of [...this.redFighters, ...this.yellowAliens]) {
          if (dist(fb, e) < e.radius + fb.radius) { triggered = true; break; }
        }
      }
      if (triggered) { fb.exploded = true; }
    }

    // ── Orange homing rockets vs player bullets ──────────────────────────────
    for (let bi = this.bullets.length-1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let oi = this.orangeRockets.length-1; oi >= 0; oi--) {
        const or = this.orangeRockets[oi];
        if (dist(b, or) < or.radius + b.radius) {
          this.bullets.splice(bi, 1);
          burst(this.particles, or.x, or.y, '#ff7700', 14, 3, 28);
          SFX.rocketExplode();
          this._addScore(120);
          this.orangeRockets.splice(oi, 1);
          break;
        }
      }
    }

    // ── Orange homing rockets vs player rockets ──────────────────────────────
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      for (let oi = this.orangeRockets.length-1; oi >= 0; oi--) {
        if (dist(r, this.orangeRockets[oi]) < this.orangeRockets[oi].radius + r.radius) {
          burst(this.particles, this.orangeRockets[oi].x, this.orangeRockets[oi].y, '#ff7700', 20, 4, 38);
          SFX.rocketExplode();
          this._addScore(200);
          this.orangeRockets.splice(oi, 1);
          r.destroy();
          break;
        }
      }
    }

    // ── Orange homing rockets vs asteroids ───────────────────────────────────
    for (let oi = this.orangeRockets.length-1; oi >= 0; oi--) {
      const or = this.orangeRockets[oi];
      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        if (dist(or, this.asteroids[ai]) < this.asteroids[ai].radius + or.radius) {
          burst(this.particles, or.x, or.y, '#ff7700', 14, 3, 28);
          SFX.rocketExplode();
          this.orangeRockets.splice(oi, 1);
          break;
        }
      }
    }

    // ── Auto-flare: if rocket gets close and player has flares, deploy automatically ──
    for (let oi = this.orangeRockets.length - 1; oi >= 0; oi--) {
      const or = this.orangeRockets[oi];
      if (dist(or, ship) < 95 && ship.flares > 0) {
        ship.useFlare(this.rockets, this.particles, this.orangeRockets);
        break;
      }
    }

    // ── Orange homing rockets vs ship ────────────────────────────────────────
    for (let oi = this.orangeRockets.length-1; oi >= 0; oi--) {
      const or = this.orangeRockets[oi];
      if (dist(or, ship) < or.radius + ship.radius + 12) {
        or._explode(this.particles);
        this.orangeRockets.splice(oi, 1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
        _updateShieldHUD(ship.shieldCharges);
      }
    }
  }

  _activateMonsterFuel(pickup) {
    const ship = this.ship;
    ship.tempMonsterFuelUntil = 900; // 15 seconds
    SFX.mysteryPickup();
    burst(this.particles, pickup.x, pickup.y, '#ffffff', 18, 4, 35);
    new FloatingText(pickup.x, pickup.y - 25, 'MONSTER FUEL!', '#ffffff');
  }

  _activateGreenStar(star) {
    const ship = this.ship;
    ship.tempStarUntil = 600; // 10 seconds
    ship.starShieldLayers = Math.max(ship.starShieldLayers, 2);
    ship.tempLaserUntil = Math.max(ship.tempLaserUntil, 600);
    SFX.mysteryPickup();
    burst(this.particles, star.x, star.y, '#33ff88', 20, 3, 30);
    new FloatingText(star.x, star.y - 20, 'STAR OVERDRIVE!', '#55ff99');
  }

  _detonateFireball(fb) {
    // Massive visual burst
    burst(this.particles, fb.x, fb.y, '#ffffff',  10, 6, 60);
    burst(this.particles, fb.x, fb.y, '#ffff00',  16, 5, 50);
    burst(this.particles, fb.x, fb.y, '#ff6600',  20, 4, 40);
    burst(this.particles, fb.x, fb.y, '#ff0000',  12, 3, 30);
    SFX.explodeLarge(); SFX.rocketExplode();
    // 16 shard bullets fly out in all directions
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const b = new Bullet(fb.x, fb.y, a, false);
      b.vx = Math.cos(a) * 9; b.vy = Math.sin(a) * 9;
      b.life = 35; b.radius = 5;
      b._isShard = true;
      this.bullets.push(b);
    }
    // Global wipe: fireball now clears all hostile entities anywhere on screen.
    this.asteroids.forEach(a => {
      burst(this.particles, a.x, a.y, C.asteroid, 10, 3, 25);
      this._addScore(a.score * 3);
    });
    this.redFighters.forEach(e => {
      burst(this.particles, e.x, e.y, C.enemyRed, 16, 4, 35);
      this._addScore(CFG.enemyRedScore * 3);
    });
    this.yellowAliens.forEach(e => {
      burst(this.particles, e.x, e.y, C.enemyYellow, 16, 4, 35);
      this._addScore(CFG.enemyYellowScore * 3);
    });
    this.orangeRockets.forEach(() => this._addScore(150));
    this.arcadeBosses.forEach(b => { burst(this.particles, b.x, b.y, '#ffd700', 20, 5, 35); this._onBossKilled(); });
    this.asteroids = [];
    this.redFighters = [];
    this.yellowAliens = [];
    this.orangeRockets = [];
    this.arcadeBosses = [];
    this.rockets = [];
    this.enemyBullets = [];
    new FloatingText(fb.x, fb.y - 30, 'KABOOM!', '#ffff00');
  }

  _applyMysteryReward(mx, my) {
    const ship = this.ship;
    const roll = Math.random();
    let label;
    if      (roll < 0.14) { ship.tempRapidUntil    = 900;                          label = 'RAPID FIRE!'; }
    else if (roll < 0.28) { ship.tempLaserUntil = 1200; label = 'LASER!'; }
    else if (roll < 0.40) { if (ship.lives < 5) { ship.lives++; label = '+1 LIFE!'; } else { label = 'FULL LIVES!'; } }
    else if (roll < 0.52) { ship.shieldCharges++; _updateShieldHUD(ship.shieldCharges); label = '+1 SHIELD!'; }
    else if (roll < 0.64) { ship.flares = Math.min(ship.flares+1, 9);              label = '+1 FLARE!'; }
    else if (roll < 0.76) { ship.rocketAmmo++;                                     label = '+1 ROCKET!'; }
    else if (roll < 0.84) { ship.tempPowerBoostUntil = 1200;                       label = '2X DAMAGE!'; }
    else if (roll < 0.90) { ship.fireballReady = true;                             label = 'FIREBALL READY!'; }
    else if (roll < 0.94) { ship.tempRamboUntil   = 300; this.ramboActive = true;  label = 'RAMBO!'; }
    else                  { ship.superRaketaReady = true;                            label = 'SUPER RAKETA!'; }
    SFX.mysteryPickup();
    burst(this.particles, mx, my, '#aa00ff', 12, 3, 25);
    new FloatingText(mx, my - 20, label, roll >= 0.94 ? '#ff6600' : '#ff00ff');
  }

  _addScore(pts) {
    if (this.arcadeMode) return; // no score in arcade
    const base = (this.runScoreMultiplier || 1) + (this._bossScoreBoost || 0);
    const ripMult = (this.ripFuryUntil > 0 && this.gameTime < this.ripFuryUntil) ? 10 : 1;
    this.score += Math.floor(pts * base * ripMult);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const{ctx,W,H} = this;
    drawGrid(ctx, W, H, this.tick);
    this.particles.forEach(p=>p.draw(ctx));
    this.coins.forEach(c=>c.draw(ctx));
    this.mysteryPickups.forEach(m=>m.draw(ctx));
    this.monsterFuels.forEach(m=>m.draw(ctx));
    this.greenStars.forEach(s=>s.draw(ctx));
    this.asteroids.forEach(a=>a.draw(ctx));
    this.bullets.forEach(b=>b.draw(ctx));
    this.enemyBullets.forEach(b=>b.draw(ctx));
    this.rockets.forEach(r=>r.draw(ctx));
    this.megaRaketas.forEach(mr=>mr.draw(ctx));
    this.playerRockets.forEach(r=>r.draw(ctx));
    this.friendlyJets.forEach(fj=>fj.draw(ctx));
    this.redFighters.forEach(rf=>rf.draw(ctx));
    this.yellowAliens.forEach(ya=>ya.draw(ctx));
    this.orangeRockets.forEach(or=>or.draw(ctx));
    this.arcadeBosses.forEach(b=>b.draw(ctx));
    this.fireballs.forEach(fb=>fb.draw(ctx));
    if (this.ship?.alive) this.ship.draw(ctx);
    if (this.xforceActiveUntil > 0 && this.gameTime < this.xforceActiveUntil) this._drawXforceLasers(ctx);
    const _lives = this.ship?.lives ?? 0;
    const xforceActive = this.xforceActiveUntil > 0 && this.gameTime < this.xforceActiveUntil;
    const xforceSec = this._effUpgrades().xforce_lavian
      ? (xforceActive ? -1 : Math.max(0, Math.ceil((this.xforceCooldownUntil - this.gameTime) / 60)))
      : undefined;
    drawHUD(ctx, W, H, {
      score:          this.arcadeMode ? 0 : this.score,
      arcadeWave:     this.arcadeMode ? this.arcadeWave : 0,
      bossmanKills:   this.bossmanMode ? (this._bossmanKills ?? 0) : undefined,
      lives:          _lives,
      maxLives:       this.ship?.maxLives ?? 3,
      flares:         this.ship?.flares   ?? 0,
      multiplier:     this.activeMultiplier,
      multiplierEndMs:this.multiplierEndMs ?? 0,
      rocketAmmo:     this.ship?.rocketAmmo ?? 0,
      shieldCharges:  this.ship?.shieldCharges ?? 0,
      scoreX2:        ((this.runScoreMultiplier || 1) + (this._bossScoreBoost || 0)),
      ripFuryActive:  this.ripFuryUntil > 0 && this.gameTime < this.ripFuryUntil,
      xforceCooldownSec: xforceSec,
      ripCountdownSec:   this.ripCountdownRemain > 0 ? Math.ceil(this.ripCountdownRemain / 60) : undefined,
      warnings: {
        overdrive:    this.ship?.isStarOverdrive     || false,
        monsterFuel: (this.ship?.tempMonsterFuelUntil || 0) > 0,
        jets:      (this.redFighters?.length   || 0) > 0,
        rockets:   (this.orangeRockets?.length || 0) > 0,
        aliens:    (this.yellowAliens?.length  || 0) > 0,
        asteroids: (this.asteroids?.length     || 0) >= 8,
        lowLife:   _lives === 1,
      },
    });
    if (this.ripFuryUntil > 0 && this.gameTime < this.ripFuryUntil) this._drawRipFuryOverlay(ctx);
    if (this.arcadeMode) this._drawArcadeOverlay(ctx);
    if (this.bossmanMode) this._drawBossmanOverlay(ctx);
  }

  _drawBossmanOverlay(ctx) {
    const W = this.W, H = this.H;
    const s = Math.min(W, H) / 420;
    const fontPx = (base) => Math.round(Math.min(base * s, base * 1.2));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this._bossmanIntroUntil > this.gameTime) {
      ctx.font = `bold ${fontPx(14)}px "Press Start 2P"`;
      glow(ctx, '#ffd700', 12);
      ctx.fillStyle = '#ffd700';
      ctx.fillText('KILL AS MANY BOSSES', W / 2, H / 2 - fontPx(14));
    }
    if (this._bossmanBetweenBosses) {
      const secLeft = Math.max(0, Math.ceil((this._bossmanBetweenUntil - this.gameTime) / 60));
      ctx.font = `bold ${fontPx(12)}px "Press Start 2P"`;
      glow(ctx, '#ffcc00', 10);
      ctx.fillStyle = '#ffcc00';
      ctx.fillText(`NEXT BOSS IN ${secLeft}`, W / 2, H / 2 + fontPx(8));
    }
    // BOSSES KILLED moved to top-left HUD box
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  _drawArcadeOverlay(ctx) {
    const W = this.W, H = this.H;
    const s = Math.min(W, H) / 420;
    const fontPx = (base) => Math.round(Math.min(base * s, base * 1.2));
    if (this._arcadeOutroActive) {
      const now = Date.now();
      ctx.save();
      if (now < this._arcadeOutroFireworksUntilMs) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 6; i++) {
          const bx = ((i + 1) * W) / 7 + Math.sin((this.tick + i * 15) * 0.07) * 18;
          const by = H * (0.2 + (i % 2) * 0.1);
          for (let p = 0; p < 16; p++) {
            const a = (p / 16) * Math.PI * 2 + (this.tick * 0.03);
            const r = 18 + ((this.tick + i * 13 + p * 7) % 24);
            const x = bx + Math.cos(a) * r;
            const y = by + Math.sin(a) * r;
            ctx.fillStyle = `hsl(${(this.tick * 4 + i * 60 + p * 18) % 360},100%,60%)`;
            ctx.fillRect(x, y, 3, 3);
          }
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontPx(12)}px "Press Start 2P"`;
        glow(ctx, '#00ff88', 12);
        ctx.fillStyle = '#00ff88';
        ctx.fillText('YOU DID IT!', W / 2, H * 0.75);
      } else {
        const shakeX = Math.sin(this.tick * 0.9) * 6;
        const shakeY = Math.cos(this.tick * 0.8) * 5;
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0.0, '#ff0077aa');
        grad.addColorStop(0.2, '#ffee00aa');
        grad.addColorStop(0.4, '#00ffccaa');
        grad.addColorStop(0.6, '#8800ffaa');
        grad.addColorStop(0.8, '#00aaffaa');
        grad.addColorStop(1.0, '#ff0077aa');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.translate(shakeX, shakeY);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = `bold ${fontPx(16)}px "Press Start 2P"`;
        glow(ctx, '#ffffff', 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('10 WAVES CLEARED', W / 2, H / 2 - fontPx(8));
        ctx.font = `bold ${fontPx(14)}px "Press Start 2P"`;
        ctx.fillStyle = '#ffee00';
        glow(ctx, '#ffee00', 14);
        ctx.fillText('+10,000 $$', W / 2, H / 2 + fontPx(14));
      }
      ctx.restore();
      ctx.shadowBlur = 0;
      return;
    }
    if (this._arcadeBetweenWaves && this._arcadeLastClearedWave != null) {
      const next = this.arcadeWave + 1;
      const arsenal = next <= 10 ? _arcadeWaveArsenal(next) : null;
      const secLeft = Math.max(0, Math.ceil((this._arcadeBetweenWavesUntil - this.gameTime) / 60));
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${fontPx(12)}px "Press Start 2P"`;
      glow(ctx, '#00ff88', 10);
      ctx.fillStyle = '#00ff88';
      ctx.fillText(`WAVE ${this._arcadeLastClearedWave} CLEARED!`, W/2, H/2 - fontPx(50));
      if (next <= 10) {
        ctx.font = `bold ${fontPx(9)}px "Press Start 2P"`;
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(`GET READY FOR WAVE ${next}`, W/2, H/2 - fontPx(30));
        if (arsenal) {
          ctx.font = `${fontPx(7)}px "Press Start 2P"`;
          ctx.fillStyle = '#00ccff';
          ctx.fillText('── YOUR ARSENAL ──', W/2, H/2 - fontPx(5));
          ctx.fillStyle = '#ffffff';
          let y = H/2 + fontPx(8);
          ctx.fillText(`JET: ${arsenal.jetName}`, W/2, y);
          y += fontPx(10);
          if (arsenal.skinName) {
            ctx.fillText(`SKIN: ${arsenal.skinName}`, W/2, y);
            y += fontPx(10);
          }
          if (arsenal.upgradeNames.length > 0) {
            const upgStr = arsenal.upgradeNames.join(', ');
            const maxW = W - 40;
            const words = upgStr.split(/,\s*/);
            let line = '', lines = [];
            for (const w of words) {
              const test = line ? line + ', ' + w : w;
              if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else { line = test; }
            }
            if (line) lines.push(line);
            lines.forEach((ln, i) => { ctx.fillText((i === 0 ? 'UPS: ' : '') + ln, W/2, y); y += fontPx(10); });
            y += fontPx(2);
          }
          if (arsenal.bonusLines.length > 0) {
            ctx.fillStyle = '#88ff88';
            ctx.fillText(`BONUS: ${arsenal.bonusLines.join(', ')}`, W/2, y);
            y += fontPx(12);
          }
          y += fontPx(8);
        }
        ctx.font = `bold ${fontPx(18)}px "Press Start 2P"`;
        ctx.fillStyle = '#ff6600';
        glow(ctx, '#ff6600', 12);
        ctx.fillText(`${secLeft}`, W/2, H - fontPx(50));
        ctx.font = `${fontPx(10)}px "Press Start 2P"`;
        ctx.fillStyle = '#bbbbbb';
        ctx.fillText('sec until next wave', W/2, H - fontPx(34));
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    if (this._arcadeFinalBossIntro) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `bold ${fontPx(16)}px "Press Start 2P"`;
      glow(ctx, '#ff0000', 16);
      ctx.fillStyle = '#ff0000';
      ctx.fillText('FINAL BOSS', W/2, H/2);
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  // ── Game Over ──────────────────────────────────────────────────────────────
  _rollBossmanReward(kills) {
    const upgrades = CATALOG.filter(c => c.category === 'upgrade').sort((a, b) => a.cost - b.cost);
    const maxUpgradeCost = upgrades[upgrades.length - 1]?.cost || 6666;
    const upgradeChance = kills >= 13 ? Math.min(0.08 + kills * 0.07, 0.78) : 0;
    const topTierCost = 2500;
    const cosmeticIds = [
      ...CATALOG.filter(c => c.category === 'skin').map(c => c.id),
      ...CATALOG.filter(c => c.category === 'bullet' && c.id !== 'bullet_default').map(c => c.id),
      ...CATALOG.filter(c => c.category === 'thrust' && c.id !== 'thrust_default').map(c => c.id),
    ];
    if (kills >= 13 && Math.random() < upgradeChance && upgrades.length) {
      const allowedUpgrades = kills >= 15 ? upgrades : upgrades.filter(u => u.cost < topTierCost);
      const rawTarget = Math.min(maxUpgradeCost, 600 + kills * kills * 180);
      const target = kills < 15 ? Math.min(rawTarget, topTierCost - 1) : rawTarget;
      const pool = allowedUpgrades.filter(u => u.cost <= target);
      const pickPool = pool.length ? pool : allowedUpgrades;
      const pick = pickPool[rngInt(0, pickPool.length - 1)];
      return { type: 'upgrade', value: pick.id, label: pick.name };
    }
    const cosmeticWeight = kills >= 13 ? 0.4 : 0.5;
    if (cosmeticIds.length && Math.random() < cosmeticWeight) {
      const id = cosmeticIds[rngInt(0, cosmeticIds.length - 1)];
      const item = CATALOG.find(c => c.id === id);
      return { type: 'upgrade', value: id, label: item?.name || id };
    }
    const maxCash = Math.max(10, Math.min(maxUpgradeCost, 50 + kills * kills * 120 + rngInt(0, 240)));
    const cash = rngInt(10, maxCash);
    return { type: 'cash', value: cash, label: `+${cash.toLocaleString()} $$` };
  }

  _resetGameOverScreen() {
    const s = document.getElementById('gameover-screen');
    const lb = document.getElementById('go-leaderboard');
    const pa = document.getElementById('go-play-again');
    const gm = document.getElementById('go-menu');
    if (s) s.classList.remove('arcade-victory');
    if (lb) lb.innerHTML = '';
    if (pa) { pa.style.display = ''; pa.textContent = 'PLAY AGAIN'; pa.classList.add('btn-primary'); pa.classList.remove('btn-secondary'); }
    if (gm) { gm.textContent = 'MAIN MENU'; gm.classList.remove('btn-primary'); gm.classList.add('btn-secondary'); }
  }

  async _bossmanGameOver() {
    this.ship.alive = false;
    SFX.thrustStop(); SFX.gameOver();
    this._resetGameOverScreen();
    this._showScreen('gameover');
    const kills = this._bossmanKills || 0;
    const reward = this._rollBossmanReward(kills);
    const tid = TG_USER?.id || this.userData?.telegram_id;
    try {
      if (reward.type === 'cash') {
        if (tid && !OFFLINE_MODE) {
          const updated = await dbAddBonusShmips(tid, reward.value);
          if (updated) this.userData.shmips = updated.shmips;
        } else {
          this.userData.shmips = (this.userData.shmips || 0) + reward.value;
        }
      } else {
        if (tid && !OFFLINE_MODE) {
          const updatedUser = await dbGrantUpgrade(tid, reward.value);
          if (updatedUser) this.userData = { ...this.userData, ...updatedUser };
        } else {
          this.upgrades[reward.value] = (this.upgrades[reward.value] || 0) + 1;
        }
      }
    } catch (e) { console.warn('[bossman] reward failed:', e.message); }

    const titleEl = document.getElementById('go-title');
    const scoreEl = document.getElementById('go-score');
    const shmipsEl = document.getElementById('go-shmips');
    const lbEl = document.getElementById('go-leaderboard');
    if (titleEl) titleEl.textContent = 'BOSSMAN COMPLETE';
    if (scoreEl) scoreEl.textContent = `BOSSES KILLED: ${kills}`;
    if (shmipsEl) shmipsEl.textContent = reward.type === 'upgrade' ? `REWARD: ${reward.label}` : reward.label;
    if (lbEl) lbEl.innerHTML = '<pre style="font-size:8px;letter-spacing:1px;line-height:2.2">Kills &lt;13: $$, skins, bullets, thrust only.\n13+ kills: upgrade drops possible.\n15+ kills: top-tier upgrades unlocked.</pre>';
  }

  async _gameOver() {
    if (this.bossmanMode) { await this._bossmanGameOver(); return; }
    this.ship.alive = false;
    SFX.thrustStop(); SFX.gameOver();
    this._resetGameOverScreen();
    this._showScreen('gameover');

    const rawScore       = this.score;
    const effectiveScore = Math.floor(rawScore * this.activeMultiplier);
    const shmipsEarned   = (effectiveScore/1000) + (this.runShmipsBonus || 0);

    const scoreEl  = document.getElementById('go-score');
    const shmipsEl = document.getElementById('go-shmips');
    const isNew    = effectiveScore > (this.userData?.best_score||0);
    document.getElementById('go-title').textContent = isNew ? 'NEW HIGH SCORE' : 'GAME OVER';

    if (this.activeMultiplier > 1) {
      // Animated multiplier sequence: raw → ×NX → = final
      scoreEl.textContent = `SCORE  ${rawScore.toLocaleString()}`;
      scoreEl.style.color = ''; scoreEl.style.textShadow = '';
      shmipsEl.textContent = '';
      setTimeout(() => {
        scoreEl.textContent  = `${rawScore.toLocaleString()} × ${this.activeMultiplier}X`;
        scoreEl.style.color  = '#ffee00';
        scoreEl.style.textShadow = '0 0 18px #ffee00';
        SFX.shmipEarn();
      }, 900);
      setTimeout(() => {
        scoreEl.textContent = `= ${effectiveScore.toLocaleString()}`;
        scoreEl.style.color = '#00ffcc';
        scoreEl.style.textShadow = '0 0 22px #00ffcc';
        shmipsEl.textContent = `+${shmipsEarned.toFixed(2)} $$ EARNED`;
        if (isNew) SFX.highScore();
      }, 2000);
    } else {
      scoreEl.textContent  = `SCORE  ${effectiveScore.toLocaleString()}`;
      scoreEl.style.color  = ''; scoreEl.style.textShadow = '';
      shmipsEl.textContent = `+${shmipsEarned.toFixed(2)} $$ EARNED`;
      setTimeout(() => isNew ? SFX.highScore() : SFX.shmipEarn(), 700);
    }

    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (tid && !OFFLINE_MODE) {
      try {
        const result = await dbSaveScore(tid, effectiveScore, Math.floor(this.gameTime / 3600) + 1);
        if (result) {
          this.userData.shmips = result.totalShmips;
          this.userData.best_score = result.newBestScore;
          if (this.runShmipsBonus > 0) {
            const updated = await dbAddBonusShmips(tid, this.runShmipsBonus);
            if (updated) this.userData.shmips = updated.shmips;
          }
        }
      } catch(e) { console.warn('[gameOver] score save failed:', e.message); }
    } else {
      this.userData.shmips     = (this.userData.shmips||0) + shmipsEarned;
      this.userData.best_score = Math.max(this.userData.best_score||0, effectiveScore);
    }

    const lbEl = document.getElementById('go-leaderboard');
    const preStyle = 'font-size:8px;letter-spacing:1px;line-height:2.2';
    if (this.arcadeMode) {
      if (lbEl) lbEl.innerHTML = `<pre style="${preStyle}">WAVE REWARDS:\n7 → 1,000 $$\n8 → 4,000 $$\n9 → 6,000 $$</pre>`;
    } else {
      if (lbEl) lbEl.innerHTML = `<pre style="${preStyle}">TOP 5\n—</pre>`;
      dbGetLeaderboard().then(rows => {
        this._top5Cache = rows;
        const lines = rows.map((e,i) => `${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('\n');
        const el = document.getElementById('go-leaderboard');
        if (el) el.innerHTML = `<pre style="${preStyle}">${lines}</pre>`;
      }).catch(() => {});
    }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async _openProfile() {
    document.getElementById('prof-nick').textContent   = this.userData?.nickname || '—';
    document.getElementById('prof-shmips').textContent = (this.userData?.shmips||0).toLocaleString();
    document.getElementById('prof-best').textContent   = (this.userData?.best_score||0).toLocaleString();
    document.getElementById('prof-games').textContent  = (this.userData?.total_games||0).toLocaleString();

    this._showScreen('profile');
  }

  async _showTop5Popup() {
    const modal = document.getElementById('top5-modal');
    const entriesEl = document.getElementById('top5-entries');
    if (this._top5Cache?.length) {
      entriesEl.innerHTML = this._top5Cache.map((e,i)=>`${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('<br>');
    }
    try {
      const rows = await dbGetLeaderboard();
      this._top5Cache = rows;
      entriesEl.innerHTML = rows.length
        ? rows.map((e,i)=>`${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('<br>')
        : 'NO SCORES YET';
    } catch { entriesEl.textContent = 'NO SCORES YET'; }
    modal.classList.remove('hidden');
    document.getElementById('top5-close').onclick = () => modal.classList.add('hidden');
  }

  async _showWeeklyPopup() {
    const modal = document.getElementById('weekly-modal');
    const entriesEl = document.getElementById('weekly-entries');
    const timerEl = document.getElementById('weekly-timer');
    if (!modal || !entriesEl || !timerEl) return;
    entriesEl.textContent = 'LOADING...';
    timerEl.textContent = '';
    modal.classList.remove('hidden');
    try {
      const base = API_BASE || window.location.origin;
      const res = await fetch(base + '/api/scores/weekly');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      const top3 = data.top3 || [];
      entriesEl.innerHTML = top3.length > 0
        ? top3.map(e => `${e.rank}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('<br>')
        : 'NO SCORES THIS WEEK';
      const prize = data.prizeShmips != null ? Number(data.prizeShmips).toLocaleString() : '—';
      const infoEl = document.getElementById('weekly-info');
      if (infoEl) infoEl.textContent = `Top 3 pilots each week get ${prize} $$. Closes Tuesday 10:01.`;
      const ms = data.countdownMs || 0;
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      timerEl.textContent = d > 0
        ? `CLOSES IN ${d}d ${h}h ${m}m`
        : `CLOSES IN ${h}h ${m}m ${s}s`;
    } catch (e) {
      entriesEl.textContent = 'COULD NOT LOAD';
      timerEl.textContent = '';
    }
  }

  // ── Guide ───────────────────────────────────────────────────────────────────
  _openGuide() {
    const GUIDE_TABS = [
      { id: 'basics',   label: 'BASICS'   },
      { id: 'controls', label: 'CONTROLS' },
      { id: 'enemies',  label: 'ENEMIES'  },
      { id: 'upgrades', label: 'UPGRADES' },
      { id: 'gear',     label: 'GEAR'     },
      { id: 'tips',     label: 'TIPS'     },
    ];

    const GUIDE_CONTENT = {
      basics: `
        <div class="guide-section">
          <span class="guide-h1">SURVIVAL MODE</span>
          <div class="guide-row">No levels. No end. Survive as long as possible and grind for your best score. The longer you play, the harder it gets — more enemies, bigger asteroids, faster rockets.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SCORING</span>
          <div class="guide-row">Small asteroid — <b>100 pts</b></div>
          <div class="guide-row">Medium asteroid — <b>50 pts</b></div>
          <div class="guide-row">Large asteroid — <b>20 pts</b></div>
          <div class="guide-row">Red Fighter jet — <b>200 pts</b></div>
          <div class="guide-row">Yellow Alien — <b>1,000 pts</b></div>
          <div class="guide-row">SCORE x2/x3 boosts multiply in real-time. <b>RIP N DIP</b> fury = <b>×10 score</b> during rainbow mode.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SHMIPS ($$)</span>
          <div class="guide-row">The in-game currency. Earn $$ by collecting glowing coin pickups during runs. Spend in the STORE to buy upgrades, jets, skins, and one-run boosts. Check your total in PROFILE.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">DIFFICULTY RAMP</span>
          <div class="guide-row">0–50s &nbsp;— Asteroids only. Easy start.</div>
          <div class="guide-row">50s+ &nbsp;&nbsp;— Yellow Aliens appear occasionally.</div>
          <div class="guide-row">100s+ &nbsp;— Orange Homing Rockets join in.</div>
          <div class="guide-row">3 min+ &nbsp;— Red Fighter Jets spawn.</div>
          <div class="guide-row">4 min+ &nbsp;— Max chaos. Everything, all at once.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">HUD</span>
          <div class="guide-row"><b>SCORE</b> — Your points.</div>
          <div class="guide-row"><b>LIFE</b> — Remaining lives (5 max).</div>
          <div class="guide-row"><b>WARNINGS</b> — Flash when danger is near.</div>
          <div class="guide-row"><b>FLARE / ROCKET / SHLD</b> — Ammo. Dim when empty.</div>
          <div class="guide-row"><b>X</b> — XForce Lavian (if owned). Red lasers wipe the screen. 5 min cooldown.</div>
        </div>`,

      controls: `
        <div class="guide-section">
          <span class="guide-h1">LEFT SIDE — DIRECTION</span>
          <div class="guide-row">Steer where your jet faces. Push the stick to fly. Release to coast.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">RIGHT SIDE — ACTIONS</span>
          <div class="guide-row">Thrust, Shoot, Rocket, Flare, Shield, X (XForce). Tap like a mobile game.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">THRUST</span>
          <div class="guide-row">Hold for 3× speed burst. Chase or escape.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">SHOOT</span>
          <div class="guide-row">Hold to fire continuously. What it shoots depends on your weapons:</div>
          <div class="guide-row"><b>Standard</b> — Fast red bullets.</div>
          <div class="guide-row"><b>SHPLIT</b> — Two parallel bullet lines.</div>
          <div class="guide-row"><b>TRIPPLE THREAT</b> — Three spread directions.</div>
          <div class="guide-row"><b>LASER</b> — From ? mystery pickup only. Temporary laser beams for 20 sec.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">ROCKET</span>
          <div class="guide-row">Fires a homing rocket that tracks the most dangerous enemy and detonates on proximity. Small blast can hit nearby targets. SMART ROCKET upgrade makes it blue — pierces 5 targets then explodes.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">FLARE</span>
          <div class="guide-row">Destroys all active Orange Homing Rockets. Also auto-deploys if a rocket gets dangerously close.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">SHIELD</span>
          <div class="guide-row">Blocks next hit. Emits a shatter sound when consumed. Charges shown top-right as SHLD.</div>
        </div>`,

      enemies: `
        <div class="guide-section">
          <span class="guide-h1">ASTEROIDS</span>
          <div class="guide-row">Purple glowing rocky obstacles that drift across the screen. They spin slowly and wrap around screen edges.</div>
          <div class="guide-row"><b>Large</b> (big) — Hit once → splits into 2 Medium chunks. <span class="guide-cost">20 pts</span></div>
          <div class="guide-row"><b>Medium</b> — Hit once → splits into 2 Small pieces. <span class="guide-cost">50 pts</span></div>
          <div class="guide-row"><b>Small</b> (tiny) — One hit destroys it completely. <span class="guide-cost">100 pts</span></div>
          <div class="guide-row">They spawn more frequently and grow larger the longer you survive. Red Fighters that crash into asteroids destroy both.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">RED FIGHTER JET <span class="guide-tag danger">3 MIN+</span></span>
          <div class="guide-row">A hostile red jet that locks onto your position and gives chase. Has <b>3 HP</b> — takes 3 hits to destroy.</div>
          <div class="guide-row"><b>Combat:</b> Fires 6 shots at you, then turns around and flees off-screen. Its shots are fast and aimed directly at where you are.</div>
          <div class="guide-row"><b>Ramming:</b> If it collides with an asteroid, both the fighter and the asteroid are destroyed at once.</div>
          <div class="guide-row">Worth <span class="guide-cost">200 pts</span>. The ACE upgrade gives you +1 life for every fighter you kill.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">YELLOW ALIEN <span class="guide-tag rare">RARE</span> <span class="guide-tag danger">50 SEC+</span></span>
          <div class="guide-row">A bright yellow entity that zips across the screen at speed. Rare — spawns occasionally. <b>Passes through asteroids</b> without interacting with them.</div>
          <div class="guide-row">Stays on screen until you kill it. One shot to destroy.</div>
          <div class="guide-row">Worth a huge <span class="guide-cost">1,000 pts</span> — the highest score of any single enemy. The ZEP ZEP ZEP upgrade gives you +1 rocket for every alien killed.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">ORANGE HOMING ROCKET <span class="guide-tag danger">100 SEC+</span></span>
          <div class="guide-row">An orange rocket that launches from the screen edge, locks onto your position, and pursues you for up to <b>5 seconds</b>. After that it detonates in a blast regardless of where it is.</div>
          <div class="guide-row"><b>Counter:</b> Deploy a FLARE — the rocket is destroyed. Flares also auto-deploy if the rocket gets dangerously close.</div>
          <div class="guide-row"><b>Asteroid kill:</b> It will also die if it collides with an asteroid.</div>
          <div class="guide-row">Gets more frequent and slightly faster as your game time increases. Multiple can be active at once late-game.</div>
        </div>`,

      upgrades: `
        <div class="guide-section">
          <span class="guide-h1">PERMANENT UPGRADES</span>
          <div class="guide-row">Bought once in STORE > UPGRADES. Active every single run forever. Stack and combine for powerful synergies.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">MAGEN <span class="guide-cost">608 $$</span></span>
          <div class="guide-row">You start every run with 1 free shield charge pre-loaded. A guaranteed free shield each game.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">PEW PEW 1.5 <span class="guide-cost">456 $$</span></span>
          <div class="guide-row">Fire rate × 1.5. Stacks with PEW PEW 3 for ×4.5.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">PEW PEW 3 <span class="guide-cost">1,140 $$</span></span>
          <div class="guide-row">Fire rate × 3. Stacks with PEW PEW 1.5 for a combined ×4.5. Shreds asteroids.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">JEW METHOD <span class="guide-cost">684 $$</span> — Magnet</span>
          <div class="guide-row">Coins, Mystery boxes, Monster Fuel fly toward you from further away. Makes shmip farming faster.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">KURWA RAKETA <span class="guide-cost">912 $$</span></span>
          <div class="guide-row">Start every run with <b>+2 rockets</b>. More homing firepower on demand.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">ACE <span class="guide-cost">1,368 $$</span></span>
          <div class="guide-row">+1 life for every Red Fighter destroyed. Hunting fighters refills lives.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">ZEP ZEP ZEP <span class="guide-cost">1,064 $$</span></span>
          <div class="guide-row">+1 rocket for every Yellow Alien killed. Hunt rare aliens for constant rocket supply.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SHPLIT <span class="guide-cost">760 $$</span></span>
          <div class="guide-row">2 parallel bullet lines from left and right sides. Combines with TRIPPLE THREAT for 6 lines.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">TRIPPLE THREAT <span class="guide-cost">1,216 $$</span></span>
          <div class="guide-row">Fire in 3 spread directions. Covers a wide cone. Combines with SHPLIT for 6 bullet lines.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SMART ROCKET <span class="guide-cost">1,672 $$</span></span>
          <div class="guide-row">Blue rocket pierces 5 targets then explodes. Pierce through enemies, big final blast.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">COLLECTOR <span class="guide-cost">836 $$</span></span>
          <div class="guide-row">Shoot coins, mystery boxes, Monster Fuel from range. Grab pickups near enemies safely.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">HORNET ASSISTANT <span class="guide-cost">5,586 $$</span></span>
          <div class="guide-row">At 2 lives or less, a friendly jet spawns for 20 sec. Fires golden cannons, homing rockets. Invincible.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">XFORCE LAVIAN <span class="guide-cost">4,332 $$</span></span>
          <div class="guide-row">X button: red lasers wipe the screen for 4 sec. 5 min cooldown. Epic panic button.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">RIP N DIP <span class="guide-cost">6,666 $$</span></span>
          <div class="guide-row">Full lives for 2 min → 10 sec countdown. Survive → <b>8 sec rainbow fury</b>. Everything turns rainbow, score <b>×10</b> during fury. Shielded.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SCORE x2 <span class="guide-cost">1,425 $$</span></span>
          <div class="guide-row">All score doubled every run. Stacks with x3 for ×6.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h2">SCORE x3 <span class="guide-cost">3,800 $$</span></span>
          <div class="guide-row">All score tripled every run. Stacks with x2 for ×6.</div>
        </div>`,

      gear: `
        <div class="guide-section">
          <span class="guide-h1">JETS</span>
          <div class="guide-row">Buy in STORE > JETS. Equip in ARSENAL. Your jet determines starting lives, flares, rockets and special abilities.</div>
          <div class="guide-row" style="margin-top:8px"><b>STARTER JET</b> <span class="guide-tag good">FREE</span><br>2 lives · 1 flare. Perfect for learning.</div>
          <div class="guide-row"><b>HAMUDI</b> <span class="guide-cost">2,280 $$</span><br>3 lives · 2 flares · 2 rockets.</div>
          <div class="guide-row"><b>KILLAJET</b> <span class="guide-cost">4,940 $$</span><br>3 lives · 3 flares · 3 rockets · Shield · ×1.3 fire. Aggressive choice.</div>
          <div class="guide-row"><b>VERY SCARY JET</b> <span class="guide-cost">8,360 $$</span><br>4 lives · 4 flares · 4 rockets · 2 shields · ×1.5 fire. The tank.</div>
          <div class="guide-row"><b>NEGEV</b> <span class="guide-cost">10,773 $$</span><br>4 lives · 5 flares · 6 rockets · 3 shields · ×1.7 fire.</div>
          <div class="guide-row"><b>BABA YAGA</b> <span class="guide-cost">24,277 $$</span><br>5 lives · 7 flares · 8 rockets · 4 shields · ×1.8 fire.</div>
          <div class="guide-row"><b>ASTROZOINKER</b> <span class="guide-cost">65,550 $$</span><br>5 lives · 9 flares · 11 rockets · 7 shields · ×2 fire. Endgame tier.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">SKINS</span>
          <div class="guide-row">Buy in STORE > SKINS. Equip in ARSENAL. Changes your jet's color and glow. Pure cosmetic — no gameplay effect.</div>
          <div class="guide-row">Special skins: <b>BEAST</b> = animated rainbow hull. <b>ACID</b> = fast colour-cycling psychedelic glow. <b>ZION</b> = blue/white fast flash. <b>SILVER SURFER</b> = icy silver-blue chrome.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">STORE BOOSTS</span>
          <div class="guide-row">One-time use per run. Buy in STORE > BOOSTS. Applied at the start of the next game, then consumed.</div>
          <div class="guide-row"><b>Extra Life</b> <span class="guide-cost">15 $$</span> — +1 life for that run.</div>
          <div class="guide-row"><b>Extra Flare</b> <span class="guide-cost">10 $$</span> — +1 flare for that run.</div>
          <div class="guide-row"><b>Run Shield</b> <span class="guide-cost">15 $$</span> — 1 shield charge for that run.</div>
          <div class="guide-row"><b>Run Rocket</b> <span class="guide-cost">20 $$</span> — +1 rocket for that run.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">MYSTERY BOX ?</span>
          <div class="guide-row">White glowing circles (?) that spawn from destroyed asteroids or appear randomly. Fly through them to collect (or shoot them with COLLECTOR upgrade). Random reward each time:</div>
          <div class="guide-row">• Rapid Fire x3 — triples your fire rate briefly</div>
          <div class="guide-row">• Laser beam — temporary laser for 20 sec (from ? only)</div>
          <div class="guide-row">• Extra Life — +1 life immediately</div>
          <div class="guide-row">• Shield charge — instant shield</div>
          <div class="guide-row">• Flare — +1 flare ammo</div>
          <div class="guide-row">• Rocket — +1 rocket ammo</div>
          <div class="guide-row">• Double Damage — your next few shots one-shot anything</div>
          <div class="guide-row">• <span class="guide-tag rare">RARE</span> FIREBALL — "FIREBALL READY" appears. Next shot fires a giant ball that detonates into fragments destroying everything on screen.</div>
          <div class="guide-row">• <span class="guide-tag rare">RARE</span> SUPER RAKETA — "SUPER RAKETA!" appears. Next shot fires a glowing green rocket that splits into 6 homing mini-rockets that search and destroy targets.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">MONSTER FUEL <span class="guide-tag rare">RARE</span></span>
          <div class="guide-row">A glowing white energy drink can. Spawns every <b>2–3 minutes</b>. Hover or fly through to collect. Grants <b>15 seconds</b> of power: <b>white shield</b> (absorbs hits), <b>3× fire rate</b>, and <b>white glowing bullets</b>. Devastating combo.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">GREEN STAR <span class="guide-tag rare">VERY RARE</span></span>
          <div class="guide-row">A rare green glowing star pickup. Grants <b>10 seconds of OVERDRIVE</b>: your jet glows bright green, gains a 2-layer green shield, fires MEGA RAKETA rockets (big red rockets that split into 7 homing minis), and your fire rate doubles. The most powerful temporary state in the game.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">GIFT BOX</span>
          <div class="guide-row">Tap <b>GIFT</b> in the main menu. Timer shows next available. Every <b>4 hours</b> — press <b>OPEN GIFT</b>. Box shakes, lid flies off, reward revealed. Rewards: common 113–300 $$; uncommon 300–600 $$ or skin/bullet/thrust; rare upgrade; <span class="guide-tag rare">very rare</span> 750–1200 $$ jackpot.</div>
        </div>`,

      tips: `
        <div class="guide-section">
          <span class="guide-h1">SURVIVAL TIPS</span>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Keep moving at all times. A stationary jet is an easy target.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Save at least one FLARE for Orange Rockets — they will catch you if you run out.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Yellow Aliens are 1,000 pts each. A quick detour to kill one is always worth it.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Mystery circles respawn. Loop the map to collect them after clearing an area.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Use SHIELD to tank through tight multi-enemy situations — not just as a last resort.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> SCORE x2 boost doubles all score in real-time. Use it on your best run attempt for a massive high score.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">BEST UPGRADE COMBOS</span>
          <div class="guide-row"><b>MAGEN + VERY SCARY JET</b> — Shield + 4 lives. Near-unkillable for the first few minutes.</div>
          <div class="guide-row"><b>ACE + ZEP ZEP ZEP</b> — Killing Red Fighters gives lives, killing Aliens gives rockets. Aggressive play refills all your resources.</div>
          <div class="guide-row"><b>JEW METHOD + COLLECTOR</b> — Everything flies to you and you can grab from range. Never miss a pickup.</div>
          <div class="guide-row"><b>PEW PEW 1.5 + PEW PEW 3</b> — Combined ×4.5 fire rate. Bullets become a solid wall of damage.</div>
        </div>
        <div class="guide-section">
          <span class="guide-h1">SCORE TIPS</span>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Small asteroids give the most points per hit (100pts). Break big ones down fast.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Combine SCORE x2 with long survival for big scores.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> RIP N DIP fury = ×10 score. Chain kills during rainbow for massive points.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> Hunting Red Fighters (200pts each) and Yellow Aliens (1,000pts each) is key for top scores.</div>
          <div class="guide-row"><span class="guide-tag tip">TIP</span> The FIREBALL from ? circles can clear an entire screen of enemies at once — huge point swing.</div>
        </div>`,
    };

    const tabsEl = document.getElementById('guide-tabs');
    const body   = document.getElementById('guide-body');
    if (!tabsEl || !body) { this._showScreen('guide'); return; }

    // Render tab buttons
    tabsEl.innerHTML = GUIDE_TABS.map(t =>
      `<button class="gtab${t.id==='basics'?' active':''}" data-gtab="${t.id}">${t.label}</button>`
    ).join('');

    const showTab = (id) => {
      tabsEl.querySelectorAll('.gtab').forEach(b => b.classList.toggle('active', b.dataset.gtab === id));
      body.innerHTML = GUIDE_CONTENT[id] || '';
      body.scrollTop = 0;
    };

    tabsEl.addEventListener('click', e => {
      const tab = e.target.closest('[data-gtab]');
      if (tab) { SFX.btnClick?.(); showTab(tab.dataset.gtab); }
    });

    showTab('basics');
    this._showScreen('guide');
  }

  // ── Arsenal ────────────────────────────────────────────────────────────────
  _openArsenal() {
    this._showScreen('arsenal');
    this._renderArsenal();
  }

  _renderArsenal() {
    const equippedJet  = localStorage.getItem('meyaret_equip_jet')  || 'starter';
    const equippedSkin = localStorage.getItem('meyaret_equip_skin') || null;

    // Jet info panel
    const jetNames = { starter:'STARTER JET', plane_hamud:'HAMUDI', plane_walla_yofi:'KILLAJET', plane_very_scary:'VERY SCARY JET', plane_negev:'NEGEV', plane_baba_yaga:'BABA YAGA', plane_astrozoinker:'ASTROZOINKER' };
    const jetStats = {
      starter:          '2 LIVES · 1 FLARE',
      plane_hamud:      '3 LIVES · 2 FLARES · 2 ROCKETS',
      plane_walla_yofi: '3 LIVES · 3 FLARES · 3 ROCKETS · SHIELD · ×1.3 FIRE',
      plane_very_scary: '4 LIVES · 4 FLARES · 4 ROCKETS · 2 SHIELDS · ×1.5 FIRE',
      plane_negev:      '4 LIVES · 5 FLARES · 6 ROCKETS · 3 SHIELDS · ×1.7 FIRE',
      plane_baba_yaga:  '5 LIVES · 7 FLARES · 8 ROCKETS · 4 SHIELDS · ×1.8 FIRE',
      plane_astrozoinker: '5 LIVES · 9 FLARES · 11 ROCKETS · 7 SHIELDS · ×2 FIRE',
    };
    const el = document.getElementById('ars-jet');      if (el) el.textContent = jetNames[equippedJet] || equippedJet.toUpperCase();
    const el2 = document.getElementById('ars-weapon'); if (el2) el2.textContent = this.upgrades.tripple_threat ? 'TRIPPLE THREAT' : this.upgrades.shplit ? 'SHPLIT' : 'STANDARD';
    const el3 = document.getElementById('ars-ability');if (el3) el3.textContent = jetStats[equippedJet] || '—';
    const el4 = document.getElementById('ars-skin');   if (el4) el4.textContent = equippedSkin ? (CATALOG.find(c=>c.id===equippedSkin)?.name || equippedSkin) : 'DEFAULT';

    const area = document.getElementById('ars-equip-area');
    if (!area) return;
    area.innerHTML = '';

    // ── Jets section ─────────────────────────────────────────────────────────
    this._arsSection(area, '-- JETS --');
    const jets = [{ id:'starter', name:'STARTER JET', owned: true }, ...CATALOG.filter(c=>c.category==='plane')];
    jets.forEach(jet => {
      const owned = jet.id === 'starter' || (this.upgrades[jet.id] > 0);
      if (!owned) return;
      const equipped = jet.id === equippedJet;
      const row = document.createElement('div'); row.className = 'ars-equip-item';
      row.innerHTML = `<span class="ars-name">${CATALOG.find(c=>c.id===jet.id)?.name || 'STARTER JET'}</span>
        <button class="ars-equip-btn${equipped?' equipped':''}">${equipped?'ACTIVE':'EQUIP'}</button>`;
      if (!equipped) {
        row.querySelector('button').addEventListener('click', () => {
          localStorage.setItem('meyaret_equip_jet', jet.id);
          SFX.btnClick(); this._renderArsenal();
        });
      }
      area.appendChild(row);
    });

    // ── Thrust section ────────────────────────────────────────────────────────
    this._arsSection(area, '-- THRUST --');
    const thrustItems = [{ id: 'thrust_default', name: 'DEFAULT', owned: true }, ...CATALOG.filter(c => c.category === 'thrust' && c.cost > 0 && (this.upgrades[c.id] || 0) > 0)];
    const equippedThrust = localStorage.getItem('meyaret_equip_thrust') || 'thrust_default';
    thrustItems.forEach(t => {
      const equipped = t.id === equippedThrust;
      const row = document.createElement('div'); row.className = 'ars-equip-item';
      const dot = t.color ? `<span style="display:inline-block;width:8px;height:8px;background:${t.color};border-radius:50%;margin-right:4px;"></span>` : '';
      row.innerHTML = `<span class="ars-name">${dot}${t.name}</span><button class="ars-equip-btn${equipped?' equipped':''}">${equipped?'ACTIVE':'EQUIP'}</button>`;
      if (!equipped) row.querySelector('button').addEventListener('click', () => {
        localStorage.setItem('meyaret_equip_thrust', t.id); SFX.btnClick(); this._renderArsenal();
      });
      area.appendChild(row);
    });

    // ── Bullets section ───────────────────────────────────────────────────────
    this._arsSection(area, '-- BULLETS --');
    const bulletItems = [{ id: 'bullet_default', name: 'DEFAULT', owned: true }, ...CATALOG.filter(c => c.category === 'bullet' && c.cost > 0 && (this.upgrades[c.id] || 0) > 0)];
    const equippedBullet = localStorage.getItem('meyaret_equip_bullet') || 'bullet_default';
    bulletItems.forEach(b => {
      const equipped = b.id === equippedBullet;
      const row = document.createElement('div'); row.className = 'ars-equip-item';
      const dot = b.color ? `<span style="display:inline-block;width:8px;height:8px;background:${b.color};border-radius:50%;margin-right:4px;"></span>` : '';
      row.innerHTML = `<span class="ars-name">${dot}${b.name}</span><button class="ars-equip-btn${equipped?' equipped':''}">${equipped?'ACTIVE':'EQUIP'}</button>`;
      if (!equipped) row.querySelector('button').addEventListener('click', () => {
        localStorage.setItem('meyaret_equip_bullet', b.id); SFX.btnClick(); this._renderArsenal();
      });
      area.appendChild(row);
    });

    // ── Rocket skins section (when owned) ───────────────────────────────────────
    const ownedRocketSkins = CATALOG.filter(c => c.category === 'rocket_skin' && (this.upgrades[c.id] || 0) > 0);
    if (ownedRocketSkins.length > 0) {
      this._arsSection(area, '-- ROCKET SKINS --');
      const equippedRocketSkin = localStorage.getItem('meyaret_equip_rocket_skin') || '';
      const defRow = document.createElement('div'); defRow.className = 'ars-equip-item';
      defRow.innerHTML = `<span class="ars-name">DEFAULT</span><button class="ars-equip-btn${!equippedRocketSkin?' equipped':''}">${!equippedRocketSkin?'ACTIVE':'EQUIP'}</button>`;
      if (equippedRocketSkin) {
        defRow.querySelector('button').addEventListener('click', () => {
          localStorage.removeItem('meyaret_equip_rocket_skin'); SFX.btnClick(); this._renderArsenal();
        });
      }
      area.appendChild(defRow);
      ownedRocketSkins.forEach(rs => {
        const equipped = rs.id === equippedRocketSkin;
        const row = document.createElement('div'); row.className = 'ars-equip-item';
        const dot = rs.color && typeof rs.color === 'string' && rs.color.startsWith('#') ? `<span style="display:inline-block;width:8px;height:8px;background:${rs.color};border-radius:50%;margin-right:4px;"></span>` : '';
        row.innerHTML = `<span class="ars-name">${dot}${rs.name}</span><button class="ars-equip-btn${equipped?' equipped':''}">${equipped?'ACTIVE':'EQUIP'}</button>`;
        if (!equipped) row.querySelector('button').addEventListener('click', () => {
          localStorage.setItem('meyaret_equip_rocket_skin', rs.id); SFX.btnClick(); this._renderArsenal();
        });
        area.appendChild(row);
      });
    }

    // ── Skins section ─────────────────────────────────────────────────────────
    this._arsSection(area, '-- SKINS --');
    const ownedSkins = CATALOG.filter(c => c.category === 'skin' && this.upgrades[c.id] > 0);
    if (ownedSkins.length === 0) {
      const msg = document.createElement('div'); msg.className = 'ars-empty-msg';
      msg.textContent = 'NO SKINS — VISIT THE STORE'; area.appendChild(msg);
    } else {
      // Default option
      const defRow = document.createElement('div'); defRow.className = 'ars-equip-item';
      defRow.innerHTML = `<span class="ars-name">DEFAULT</span>
        <button class="ars-equip-btn${!equippedSkin?' equipped':''}">${!equippedSkin?'ACTIVE':'EQUIP'}</button>`;
      if (equippedSkin) {
        defRow.querySelector('button').addEventListener('click', () => {
          localStorage.removeItem('meyaret_equip_skin'); SFX.btnClick(); this._renderArsenal();
        });
      }
      area.appendChild(defRow);

      ownedSkins.forEach(skin => {
        const equipped = skin.id === equippedSkin;
        const row = document.createElement('div'); row.className = 'ars-equip-item';
        row.innerHTML = `<span class="ars-name" style="color:${skin.color==='rainbow'||skin.color==='acid'?'var(--magenta)':skin.color}">${skin.name}</span>
          <button class="ars-equip-btn${equipped?' equipped':''}">${equipped?'ON':'EQUIP'}</button>`;
        if (!equipped) {
          row.querySelector('button').addEventListener('click', () => {
            localStorage.setItem('meyaret_equip_skin', skin.id); SFX.btnClick(); this._renderArsenal();
          });
        }
        area.appendChild(row);
      });
    }

    // ── Upgrades section ─────────────────────────────────────────────────────
    const ownedUps = CATALOG.filter(c => c.category === 'upgrade' && this.upgrades[c.id] > 0);
    if (ownedUps.length > 0) {
      this._arsSection(area, '-- UPGRADES --');
      ownedUps.forEach(up => {
        const row = document.createElement('div'); row.className = 'ars-equip-item';
        row.innerHTML = `<span class="ars-name">${up.name}</span><span class="ars-equip-btn equipped">ACTIVE</span>`;
        area.appendChild(row);
      });
    }

    // ── Boosts section ───────────────────────────────────────────────────────
    const ownedBoosts = CATALOG.filter(c => c.category === 'boost' && (this.upgrades[c.id] || 0) > 0);
    if (ownedBoosts.length > 0) {
      this._arsSection(area, '-- BOOSTS (NEXT RUN) --');
      ownedBoosts.forEach(boost => {
        const row = document.createElement('div'); row.className = 'ars-equip-item';
        row.innerHTML = `<span class="ars-name">${boost.name} ×${this.upgrades[boost.id]}</span><span class="ars-equip-btn" style="border-color:var(--yellow);color:var(--yellow)">READY</span>`;
        area.appendChild(row);
      });
    }
  }

  _arsSection(area, title) {
    const h = document.createElement('div'); h.className = 'ars-section-header';
    h.textContent = title; area.appendChild(h);
  }

  // ── Gifts (inline on main menu) ─────────────────────────────────────────────
  async _doOpenGift() {
    const btn = document.getElementById('spin-btn');
    const result = document.getElementById('spin-result');
    if (!btn || !result) return;
    btn.disabled = true;
    result.classList.add('hidden');

    if (OFFLINE_MODE) {
      result.textContent = 'OFFLINE — GIFT REQUIRES CONNECTION';
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (!tid) {
      result.textContent = 'OPEN VIA TELEGRAM';
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    let data = null;
    try {
      data = await dbOpenGift(tid);
    } catch (e) {
      result.textContent = (e.message || 'GIFT FAILED').toUpperCase();
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }
    if (data?.error) {
      result.textContent = data.error.toUpperCase();
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    const reward = data?.reward;
    if (!reward) { btn.disabled = false; return; }

    await _animateGiftOpen(reward.type);

    const typeColors = { skin_grant: '#cc44ff', bullet_grant: '#00aaff', thrust_grant: '#ff7700', upgrade_grant: '#ffd700', shmips: '#ffee00' };
    const col = typeColors[reward.type] || '#ffee00';
    result.style.color = col;
    result.style.textShadow = `0 0 18px ${col}, 0 0 36px ${col}88`;
    result.textContent = `YOU GOT: ${reward.label}!`;
    result.classList.remove('hidden');
    result.classList.add('gift-reward-reveal');
    SFX.shmipEarn && SFX.shmipEarn();

    try {
      const me = await dbGetOrCreateUser(tid);
      if (me) { this.userData = me.user; this._parseUpgrades(me.upgrades || []); }
    } catch { /* non-critical */ }
    this._loadMenu();

    btn.disabled = true;
    btn.style.opacity = '0.4';
  }

  // ── Store ──────────────────────────────────────────────────────────────────
  _updateSpecialTimer() {
    const el = document.getElementById('store-special-btn');
    if (el) el.textContent = 'SPECIAL';
  }

  async _openStore() {
    this._updateSpecialTimer();
    this._showScreen('store');
    document.getElementById('store-balance').textContent =
      `BALANCE: ${(this.userData?.shmips||0).toLocaleString()} $$`;
    this._catalog = CATALOG;
    const activeTab = this._lastStoreTab || 'boost';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    this._renderStoreTab(activeTab);
  }

  _renderStoreTab(category) {
    const grid = document.getElementById('store-items');
    grid.innerHTML = '';
    grid.classList.toggle('special-items', category === 'weekly');
    if (category === 'weekly') {
      const items = getWeeklySpecialItems();
      if (items.length === 0) {
        grid.innerHTML = '<div class="store-weekly-soon">NO SPECIAL ITEMS THIS WEEK</div>';
        return;
      }
      items.forEach(item => {
        const qty = this.upgrades[item.id] || 0;
        const locked = !item.stackable && qty > 0;
        const canAfford = Number(this.userData?.shmips || 0) >= (item.cost || 0);
        const btnLabel = locked ? 'OWNED' : 'BUY';
        const costStr = `${item.cost || 888} $$`;
        const isDisabled = !locked && !canAfford;
        const colorDot = ((item.category === 'skin' || item.category === 'thrust' || item.category === 'bullet' || item.category === 'rocket_skin') && item.color)
          ? `<span style="display:inline-block;width:10px;height:10px;background:${item.color};border-radius:50%;margin-right:4px;vertical-align:middle;"></span>`
          : '';
        const el = document.createElement('div'); el.className = 'store-item';
        el.innerHTML = `
          <div class="store-item-info">
            <div class="store-item-name">${colorDot}${item.name}</div>
            <div class="store-item-desc">${item.description}</div>
          </div>
          <span class="store-item-cost">${costStr}</span>
          <button class="store-buy-btn${locked ? ' owned' : ''}${isDisabled && !locked ? ' disabled' : ''}" data-id="${item.id}" ${isDisabled && !locked ? 'disabled' : ''}>
            ${btnLabel}
          </button>`;
        if (!locked) el.querySelector('button').addEventListener('click', () => this._buyItem(item));
        grid.appendChild(el);
      });
      return;
    }
    const items = (this._catalog || [])
      .filter(item => item.category === category && !item.special)
      .filter(item => item.id !== 'thrust_default' && item.id !== 'bullet_default');
    if (items.length === 0) return;
    items.forEach(item => {
      const qty = this.upgrades[item.id] || 0;
      const freeDefault = (item.category === 'thrust' || item.category === 'bullet') && item.cost === 0;
      const locked = item.category === 'boost'
        ? qty >= 1
        : freeDefault || (!item.stackable && qty > 0);
      const el = document.createElement('div'); el.className = 'store-item';
      const colorDot = ((item.category==='skin' || item.category==='thrust' || item.category==='bullet') && item.color)
        ? `<span style="display:inline-block;width:10px;height:10px;background:${item.color};border-radius:50%;margin-right:4px;vertical-align:middle;"></span>`
        : '';
      const canAfford = Number(this.userData?.shmips || 0) >= (item.cost || 0);
      const btnLabel = locked
        ? (item.category === 'boost' ? 'READY' : freeDefault ? 'DEFAULT' : 'OWNED')
        : 'BUY';
      const costStr = item.cost === 0 ? 'FREE' : `${item.cost} $$`;
      const isDisabled = !locked && (item.cost > 0 && !canAfford);
      el.innerHTML = `
        <div class="store-item-info">
          <div class="store-item-name">${colorDot}${item.name}</div>
          <div class="store-item-desc">${item.description}</div>
        </div>
        <span class="store-item-cost">${costStr}</span>
        <button class="store-buy-btn${locked ? ' owned' : ''}${isDisabled && !locked ? ' disabled' : ''}" data-id="${item.id}" ${isDisabled && !locked ? 'disabled' : ''}>
          ${btnLabel}
        </button>`;
      if (!locked) el.querySelector('button').addEventListener('click', () => this._buyItem(item));
      grid.appendChild(el);
    });
  }

  async _buyItem(item) {
    if (this._buyingInProgress) return;
    this._buyingInProgress = true;
    const msg = document.getElementById('store-msg');
    if (OFFLINE_MODE || !TG_USER?.id && !this.userData?.telegram_id) {
      this._buyingInProgress = false; return;
    }
    const tid = TG_USER?.id || this.userData?.telegram_id;
    try {
      SFX.btnClick();
      msg.textContent = ''; msg.classList.add('hidden');
      const{newBalance} = await dbBuyItem(tid, item.id);
      this.userData.shmips = newBalance;
      this.upgrades[item.id] = (this.upgrades[item.id]||0) + 1;
      document.getElementById('store-balance').textContent = `BALANCE: ${newBalance.toLocaleString()} $$`;
      msg.textContent = `${item.name} ACQUIRED!`; msg.className = 'store-msg success'; msg.classList.remove('hidden');
      SFX.shmipEarn && SFX.shmipEarn();
      setTimeout(() => msg.classList.add('hidden'), 2500);
      this._renderStoreTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'boost');
    } catch (e) {
      if (msg) {
        msg.textContent = (e?.message || 'PURCHASE FAILED').toUpperCase();
        msg.className = 'store-msg fail';
        msg.classList.remove('hidden');
        setTimeout(() => msg?.classList.add('hidden'), 2500);
      }
    }
    setTimeout(() => { this._buyingInProgress = false; }, 1500); // debounce 1.5s
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
// Module scripts are deferred: DOM is parsed (incl. #game-canvas) before this runs.
// Do not rely on DOMContentLoaded — some embedded WebViews fire it late or not at all.
try {
  window.__MEYARET_GAME__ = new Game();
} catch (e) {
  console.error('[MEYARET] boot', e);
  const st = document.getElementById('loading-status');
  if (st) { st.textContent = 'BOOT: ' + (e && e.message ? e.message : String(e)); st.style.color = '#ff4466'; }
}
