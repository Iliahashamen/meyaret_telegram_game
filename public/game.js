// ============================================================
// MEYARET — Full Game Engine
// Asteroids-style physics, Synthwave aesthetics
// ============================================================
import { SFX } from './sounds.js';
import {
  CATALOG,
  dbGetOrCreateUser, dbSaveScore, dbGetLeaderboard,
  dbSaveCallsign, dbCheckCallsign,
  dbGetUserUpgrades, dbBuyItem,
  dbSpinStatus, dbDoSpin, dbAddBonusShmips, dbConsumeBoost,
  SPIN_WHEEL_SEGMENTS,
} from './db.js';

// ── Telegram WebApp Init ──────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.disableVerticalSwipes?.(); }
let TG_USER = tg?.initDataUnsafe?.user || null;
const INIT_DATA = tg?.initData || '';

async function waitForTelegramUser() {
  if (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) {
    return window.Telegram.WebApp.initDataUnsafe.user;
  }
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 100));
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (u?.id) return u;
  }
  return null;
}

const API_BASE = (typeof window !== 'undefined' && window.MEYARET_API) || '';
let OFFLINE_MODE = false;

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

// ── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  rotSpeed:     0.042,
  thrustPower:  0.09,
  friction:     0.965,
  bulletSpeed:  6,
  bulletLife:   65,
  laserLife:    55,
  rocketSpeed:  1.0,
  flareRadius:  85,
  asteroidSizes: { large: 38, medium: 19, small: 9 },
  asteroidScores: { large: 20, medium: 50, small: 100 },
  enemyRedScore:    200,
  enemyYellowScore: 1000,
  maxBullets:   6,
  respawnMs:    2400,
  invincibleMs: 3000,
  baseAsteroids: 4,
  maxLivesBase: 6,   // hard cap from upgrades/jets
};

// ── Utility ───────────────────────────────────────────────────────────────────
const rng   = (a, b) => a + Math.random() * (b - a);
const rngInt = (a, b) => Math.floor(rng(a, b + 1));
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
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
function acidColor(t) {
  const h = (t * 0.45) % 360;
  const s = 100;
  const l = 50 + 18 * Math.sin(t * 0.25);
  return `hsl(${h}, ${s}%, ${l}%)`;
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
    const baseLives = { starter: 2, plane_hamud: 3, plane_walla_yofi: 3, plane_very_scary: 4 }[this.jetType] || 2;
    const extraLife = Math.min(upgrades.extra_life || 0, 1); // max 1 boost/game
    this.maxLives = Math.min(baseLives + extraLife, CFG.maxLivesBase);
    this.lives    = this.maxLives;

    // Flares
    const baseFlares = { starter: 1, plane_hamud: 2, plane_walla_yofi: 3, plane_very_scary: 3 }[this.jetType] || 1;
    this.maxFlares = baseFlares + Math.min(upgrades.extra_flare || 0, 1);
    this.flares    = this.maxFlares;

    // Shield charges (MAGEN = permanent +1, extra_shield boost = +1 max 1/game)
    this.shieldCharges = (upgrades.magen ? 1 : 0) + Math.min(upgrades.extra_shield || 0, 1);
    this.shieldUp      = false; // must be deployed manually

    // Weapon modes — all stackable
    this.hasLaser  = !!(upgrades.lazer_pew);
    this.hasShplit  = !!(upgrades.shplit);
    this.hasTripple = !!(upgrades.tripple_threat);

    // Fire rate — stack both multipliers if both owned (x1.5 * x3 = x4.5)
    const baseFireRate = { starter: 22, plane_hamud: 22, plane_walla_yofi: 15, plane_very_scary: 22 }[this.jetType] || 22;
    let rateDiv = 1;
    if (upgrades.pew_pew_15) rateDiv *= 1.5;
    if (upgrades.pew_pew_3)  rateDiv *= 3;
    this.fireRate = Math.max(Math.floor(baseFireRate / rateDiv), 4);

    // Rockets
    const baseRockets = { starter: 0, plane_hamud: 2, plane_walla_yofi: 3, plane_very_scary: 4 }[this.jetType] || 0;
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
    this.hasZepZep      = !!(upgrades.zep_zep_zep);

    // Skin
    this.skinId   = upgrades.skinId   || null;
    this.skinColor = upgrades.skin_color  || null;
    this.accent   = upgrades.skin_accent || null;

    // Default colors per jet (skin overrides these)
    const jetDefaults = {
      starter:          '#eeeeff',
      plane_hamud:      '#eeeeff',
      plane_walla_yofi: '#3399ff',
      plane_very_scary: '#bb44ff',
    };
    this.color = this.skinColor || jetDefaults[this.jetType] || '#eeeeff';

    this.golden = !!(upgrades.golden_plane);
    this.radius = this.golden ? 18 : 14; // collision radius — must match draw size
    this.fireCooldown = 0;
    this.thrusting    = false;
    this.tempLaserUntil      = 0;
    this.tempPinkBeamUntil   = 0;
    this.tempRapidUntil      = 0;
    this.tempPowerBoostUntil = 0;
    this.fireballReady       = false;
    this.spawnProtection     = 120; // 2 seconds at 60fps — immune to damage on spawn
    this.bobTimer = 0;
  }

  update(keys, W, H) {
    this.bobTimer++;
    if (this.spawnProtection > 0) this.spawnProtection--;
    if (this.invincible) {
      this.invTimer--; this.blinkTimer++;
      if (this.invTimer <= 0) this.invincible = false;
    }

    if (keys.joyActive && keys.joyAngle !== null) {
      this.angle = keys.joyAngle - Math.PI / 2;
      this.thrusting = keys.up;
      if (keys.up) {
        const tx = Math.cos(keys.joyAngle) * CFG.thrustPower;
        const ty = Math.sin(keys.joyAngle) * CFG.thrustPower;
        this.vx += tx; this.vy += ty;
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 0.3) {
          const want = Math.atan2(ty, tx);
          const cur  = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const nang = cur + diff * 0.25;
          this.vx = Math.cos(nang) * spd;
          this.vy = Math.sin(nang) * spd;
        }
      }
    } else {
      if (keys.left)  this.angle -= CFG.rotSpeed;
      if (keys.right) this.angle += CFG.rotSpeed;
      this.thrusting = keys.up;
      if (keys.up) {
        this.vx += Math.cos(this.angle) * CFG.thrustPower;
        this.vy += Math.sin(this.angle) * CFG.thrustPower;
      }
    }
    const spd = Math.hypot(this.vx, this.vy);
    const max = this.golden ? 6 : 3.8;
    if (spd > max) { this.vx = (this.vx / spd) * max; this.vy = (this.vy / spd) * max; }
    this.vx *= CFG.friction; this.vy *= CFG.friction;
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.rocketCooldown > 0) this.rocketCooldown--;
  }

  _getColor() {
    if (this.golden) return C.golden;
    if (this.skinId === 'skin_beast') return rainbowColor(this.bobTimer, 1);
    if (this.skinId === 'skin_acid')  return acidColor(this.bobTimer);
    return this.color;
  }

  draw(ctx) {
    if (this.invincible && this.blinkTimer % 6 < 3) return;
    const col = this._getColor();
    const sz  = this.golden ? 18 : 14;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    glow(ctx, col, this.golden ? 20 : 12);

    if (this.jetType === 'starter') {
      this._drawStarter(ctx, col, sz);
    } else if (this.jetType === 'plane_hamud') {
      this._drawHamud(ctx, col, sz);
    } else if (this.jetType === 'plane_walla_yofi') {
      this._drawWallaYofi(ctx, col, sz);
    } else if (this.jetType === 'plane_very_scary') {
      this._drawVeryScary(ctx, col, sz);
    } else {
      this._drawStarter(ctx, col, sz);
    }

    // Spawn protection ring (fades out over 2 seconds)
    if (this.spawnProtection > 0) {
      const alpha = this.spawnProtection / 120;
      ctx.strokeStyle = `rgba(0,255,200,${alpha * 0.7})`;
      glow(ctx, '#00ffcc', 14 * alpha);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, sz + 12, 0, TAU); ctx.stroke();
    }

    // Shield ring
    if (this.shieldUp) {
      ctx.strokeStyle = '#00aaff';
      glow(ctx, '#00aaff', 16);
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(0, 0, sz + 8, 0, TAU); ctx.stroke();
    }

    // Fireball ready — pulsing orange glow on nose
    if (this.fireballReady) {
      const pulse = Math.sin(this.bobTimer * 0.25) * 0.4 + 0.7;
      glow(ctx, '#ff6600', 22 * pulse);
      ctx.fillStyle = `rgba(255,100,0,${0.5 * pulse})`;
      ctx.beginPath(); ctx.arc(0, -sz, 8, 0, TAU); ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  _drawStarter(ctx, col, sz) {
    const ac = this.accent || col;
    ctx.strokeStyle = col;
    ctx.lineWidth   = this.golden ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.55, sz * 0.6);
    ctx.lineTo(0, sz * 0.3);
    ctx.lineTo(-sz * 0.55, sz * 0.6);
    ctx.closePath();
    ctx.stroke();
    // Accent crossbar + tip dot
    glow(ctx, ac, 8);
    ctx.strokeStyle = ac; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.38, sz * 0.15); ctx.lineTo(sz * 0.38, sz * 0.15);
    ctx.stroke();
    ctx.fillStyle = ac;
    ctx.beginPath(); ctx.arc(0, -sz * 0.7, sz * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawHamud(ctx, col, sz) {
    const ac = this.accent || col;
    // Body
    ctx.strokeStyle = col; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.45, sz * 0.3);
    ctx.lineTo(0, sz * 0.2);
    ctx.lineTo(-sz * 0.45, sz * 0.3);
    ctx.closePath();
    ctx.stroke();
    // Wings — accent colored
    glow(ctx, ac, 10);
    ctx.strokeStyle = ac; ctx.lineWidth = 1.6;
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
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.35, 0); ctx.lineTo(sz * 0.35, 0);
    ctx.stroke();
    ctx.shadowBlur = 0;
    this._drawFlame(ctx, col, sz);
  }

  _drawWallaYofi(ctx, col, sz) {
    const ac = this.accent || col;
    // Sleeker fuselage
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.1);
    ctx.lineTo(sz * 0.35, sz * 0.1);
    ctx.lineTo(sz * 0.5, sz * 0.6);
    ctx.lineTo(0, sz * 0.35);
    ctx.lineTo(-sz * 0.5, sz * 0.6);
    ctx.lineTo(-sz * 0.35, sz * 0.1);
    ctx.closePath();
    ctx.stroke();
    // Delta wings — accent colored
    glow(ctx, ac, 10);
    ctx.strokeStyle = ac; ctx.lineWidth = 1.8;
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
    const glowColor = ac;
    ctx.fillStyle = `${glowColor}55`;
    glow(ctx, glowColor, 14);
    ctx.beginPath(); ctx.ellipse(0, -sz * 0.35, sz * 0.2, sz * 0.3, 0, 0, TAU); ctx.fill();
    this._drawFlame(ctx, col, sz);
  }

  _drawVeryScary(ctx, col, sz) {
    const purp = this.skinColor || '#bb44ff';

    // Engine glow aura
    glow(ctx, purp, 22);
    ctx.strokeStyle = purp + '44'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(0, sz * 0.3, sz * 0.45, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Delta-body fill
    ctx.fillStyle = purp + '22';
    ctx.beginPath();
    ctx.moveTo(0, -sz * 1.05);
    ctx.lineTo(sz * 0.55, sz * 0.35);
    ctx.lineTo(0, sz * 0.55);
    ctx.lineTo(-sz * 0.55, sz * 0.35);
    ctx.closePath(); ctx.fill();

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

    ctx.shadowBlur = 0;
    this._drawFlame(ctx, purp, sz);
  }

  _drawFlame(ctx, col, sz) {
    if (!this.thrusting) return;
    const flameSz = rng(6, 10);
    ctx.strokeStyle = this.golden ? C.golden : '#ff6600';
    glow(ctx, '#ff6600', 16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.25, sz * 0.55);
    ctx.lineTo(0, sz * 0.55 + flameSz);
    ctx.lineTo(sz * 0.25, sz * 0.55);
    ctx.stroke();
  }

  canFire() { return this.fireCooldown <= 0; }
  get effectiveLaser() { return this.hasLaser || this.tempLaserUntil > 0 || this.tempPinkBeamUntil > 0; }
  get isPinkBeam()    { return this.tempPinkBeamUntil > 0; }
  get effectiveFireRate() {
    if (this.tempRapidUntil > 0) return Math.max(Math.floor(this.fireRate / 3), 2);
    return this.fireRate;
  }

  fire(bullets, fireballs) {
    if (!this.canFire()) return;
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

    if (this.effectiveLaser) {
      const pink = this.isPinkBeam;
      if (this.hasTripple && this.hasShplit) {
        // laser + triple + shplit: 6 pink/laser beams
        [-0.22, 0, 0.22].forEach(spread => {
          const perp = (this.angle + spread) + Math.PI / 2;
          const ox = Math.cos(perp) * 9, oy = Math.sin(perp) * 9;
          bullets.push(new Laser(nose.x + ox, nose.y + oy, this.angle + spread, pink));
          bullets.push(new Laser(nose.x - ox, nose.y - oy, this.angle + spread, pink));
        });
      } else if (this.hasTripple) {
        [-0.22, 0, 0.22].forEach(spread =>
          bullets.push(new Laser(nose.x, nose.y, this.angle + spread, pink)));
      } else if (this.hasShplit) {
        const perp = this.angle + Math.PI / 2;
        const ox = Math.cos(perp) * 10, oy = Math.sin(perp) * 10;
        bullets.push(new Laser(nose.x + ox, nose.y + oy, this.angle, pink));
        bullets.push(new Laser(nose.x - ox, nose.y - oy, this.angle, pink));
      } else {
        bullets.push(new Laser(nose.x, nose.y, this.angle, pink));
      }
      SFX.laser();
      return;
    }

    if (this.hasTripple && this.hasShplit) {
      // shplit + triple = 6 bullets: 2 parallel per direction
      [-0.22, 0, 0.22].forEach(spread => {
        const perp = (this.angle + spread) + Math.PI / 2;
        const ox = Math.cos(perp) * 8, oy = Math.sin(perp) * 8;
        bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle + spread, this.golden));
        bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle + spread, this.golden));
      });
      SFX.shoot();
    } else if (this.hasTripple) {
      [-0.22, 0, 0.22].forEach(spread =>
        bullets.push(new Bullet(nose.x, nose.y, this.angle + spread, this.golden)));
      SFX.shoot();
    } else if (this.hasShplit) {
      const perp = this.angle + Math.PI / 2;
      const ox = Math.cos(perp) * 10, oy = Math.sin(perp) * 10;
      bullets.push(new Bullet(nose.x + ox, nose.y + oy, this.angle, this.golden));
      bullets.push(new Bullet(nose.x - ox, nose.y - oy, this.angle, this.golden));
      SFX.shoot();
    } else {
      bullets.push(new Bullet(nose.x, nose.y, this.angle, this.golden));
      SFX.shoot();
    }
  }

  fireRocket(bullets) {
    if (this.rocketAmmo <= 0) {
      new FloatingText(this.x, this.y - 30, 'NO ROCKETS!', '#ff4444');
      return false;
    }
    if (this.rocketCooldown > 0) return false;
    this.rocketAmmo--;
    this.rocketCooldown = this.rocketRate;
    const nose = { x: this.x + Math.cos(this.angle) * 16, y: this.y + Math.sin(this.angle) * 16 };
    bullets.push(new PlayerRocket(nose.x, nose.y, this.angle, this.smartRocket));
    SFX.rocketFire();
    // Update shield HUD counter
    _updateShieldHUD(this.shieldCharges);
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
    if (this.shieldUp) {
      this.shieldUp = false;
      this.invincible = true;
      this.invTimer = 60;
      return false;
    }
    burst(particles, this.x, this.y, this.golden ? C.golden : this.color, 20, 4, 40);
    this.lives--;
    SFX.playerHit();
    if (this.lives <= 0) { this.alive = false; return true; }
    this.invincible = true;
    this.invTimer   = Math.floor(CFG.invincibleMs / 16);
    this.blinkTimer = 0;
    this.vx = 0; this.vy = 0;
    return false;
  }

  get radius() { return this.golden ? 14 : 10; }
}

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, golden = false) {
    this.x = x; this.y = y;
    const spd = CFG.bulletSpeed + (golden ? 3 : 0);
    this.vx = Math.cos(angle) * spd;
    this.vy = Math.sin(angle) * spd;
    this.life = CFG.bulletLife;
    this.golden = golden;
    this.radius = 3;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    const col = this.golden ? C.golden : C.bullet;
    glow(ctx, col, 10);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Laser ─────────────────────────────────────────────────────────────────────
class Laser {
  constructor(x, y, angle, pink = false) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.pink  = pink;
    this.len   = pink ? 220 : 80;
    this.life  = pink ? Math.floor(CFG.laserLife * 1.8) : CFG.laserLife;
    this.vx    = Math.cos(angle) * (pink ? 20 : 14);
    this.vy    = Math.sin(angle) * (pink ? 20 : 14);
    this.radius = pink ? 10 : 4;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    const col = this.pink ? '#ff00ee' : C.laser;
    const width = this.pink ? 10 : 3;
    glow(ctx, col, this.pink ? 40 : 16);
    ctx.strokeStyle = col; ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(this.angle) * this.len, this.y - Math.sin(this.angle) * this.len);
    ctx.stroke();
    if (this.pink) {
      // outer bloom
      glow(ctx, '#ff88ff', 20);
      ctx.strokeStyle = '#ff88ff44'; ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - Math.cos(this.angle) * this.len, this.y - Math.sin(this.angle) * this.len);
      ctx.stroke();
      // inner white core
      glow(ctx, '#ffffff', 10);
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 3;
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
    this.radius = CFG.asteroidSizes[size];
    const speedMult = 0.35 + Math.min(level - 1, 15) * 0.035;
    const baseSpd = size === 'large' ? rng(0.20, 0.45) : size === 'medium' ? rng(0.40, 0.80) : rng(0.65, 1.2);
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
    if (this.size === 'large')  { SFX.explodeLarge(); return [new Asteroid(this.x, this.y, 'medium'), new Asteroid(this.x, this.y, 'medium')]; }
    if (this.size === 'medium') { SFX.explodeMed();   return [new Asteroid(this.x, this.y, 'small'),  new Asteroid(this.x, this.y, 'small')];  }
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
    this.shootRate  = 350; // slower firing
    this.shotsLeft = 2;   // fewer shots per fighter
    this.health = 3;
    this.radius = 14;
    this.bobTimer = 0;
  }
  update(ship, bullets, W, H, particles) {
    this.bobTimer++;
    const dx = ship.x - this.x, dy = ship.y - this.y;
    this.angle = Math.atan2(dy, dx);
    this.vx += Math.cos(this.angle) * 0.08;
    this.vy += Math.sin(this.angle) * 0.08;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > this.speed) { this.vx = (this.vx / spd) * this.speed; this.vy = (this.vy / spd) * this.speed; }
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.shootTimer++;
    if (this.shootTimer >= this.shootRate && this.shotsLeft > 0) {
      this.shootTimer = 0; this.shotsLeft--;
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
    this.vx = Math.cos(ang) * rng(0.8, 1.5);
    this.vy = Math.sin(ang) * rng(0.8, 1.5);
    this.angle = 0;
    this.lifeTimer = 0; this.maxLife = 180; // 3 seconds then vanish
    this.swoops = 0; this.health = 1; // one-shot
    this.radius = 16; this.bobTimer = 0;
    this.dead = false;
  }
  update(_bullets, W, H, _particles) {
    this.bobTimer++; this.lifeTimer++;
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
    this.dead = this.lifeTimer > this.maxLife; // vanish after 3s
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
  constructor(x, y, angle, smart = false) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 3;
    this.vy = Math.sin(angle) * 3;
    this.angle = angle;
    this.life = smart ? 2400 : 180;
    this.radius = 5;
    this.isPlayerRocket = true;
    this._hit = false;
  }
  destroy() { this._hit = true; }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle + Math.PI / 2);
    glow(ctx, '#ff6600', 14); ctx.strokeStyle = '#ff6600'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath(); ctx.stroke();
    ctx.strokeStyle = '#ffee00'; glow(ctx, '#ffee00', 10);
    ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(0, 4 + rng(4, 8)); ctx.lineTo(2, 4); ctx.stroke();
    ctx.restore(); ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0 || this._hit; }
}

// ── Orange Homing Rocket (enemy) ──────────────────────────────────────────────
class OrangeHomingRocket {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.angle = 0;
    this.vx = 0; this.vy = 0;
    this.speed = 2.2;
    this.lifeTimer = 0;
    this.fuseTime = 240; // 4 seconds
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
    for (let i = 0; i < 20; i++) {
      const ang = rng(0, TAU);
      const spd = rng(1.5, 4.5);
      particles.push(new Particle(this.x, this.y, Math.cos(ang)*spd, Math.sin(ang)*spd,
        ['#ffee00','#ffcc00','#ffffaa','#ff8800'][Math.floor(Math.random()*4)], rng(2,4)));
    }
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
    ctx.globalAlpha = (Math.sin(tick*.011+s.phase)*.25+.75)*(s.r>1?.55:.38);
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
function drawHUD(ctx, W, { score, level, lives, maxLives, flares, multiplier, rocketAmmo, shieldCharges }) {
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = '#0a0018';
  roundRect(ctx, 6, 6, 162, 92, 0); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00ffcc33'; ctx.lineWidth = 1;
  roundRect(ctx, 6, 6, 162, 92, 0); ctx.stroke();

  const FONT = '"Press Start 2P", "Courier New", monospace';
  ctx.textAlign = 'left';

  ctx.font = `8px ${FONT}`; glow(ctx, C.hud, 6);
  ctx.fillStyle = '#00ffcc88'; ctx.fillText('SCORE', 14, 24);
  ctx.font = `12px ${FONT}`; glow(ctx, C.hud, 10);
  ctx.fillStyle = C.hud; ctx.fillText(score.toLocaleString(), 14, 42);

  ctx.font = `8px ${FONT}`; ctx.fillStyle = C.hudLevel; glow(ctx, C.hudLevel, 6);
  ctx.fillText(`LV ${level}`, 14, 58);

  ctx.fillStyle = C.hud; glow(ctx, C.hud, 5);
  ctx.fillText('LIVES', 14, 76);

  // Draw up to 6 life triangles
  const displayLives = Math.min(lives, 6);
  const displayMax   = Math.min(maxLives, 6);
  for (let i = 0; i < displayMax; i++) {
    const lx = 68 + i * 15, ly = 76;
    ctx.fillStyle   = i < displayLives ? C.hud : '#0a0020';
    ctx.shadowBlur  = i < displayLives ? 8 : 0;
    ctx.shadowColor = C.hud;
    ctx.beginPath();
    ctx.moveTo(lx+4, ly-7); ctx.lineTo(lx+9, ly); ctx.lineTo(lx, ly);
    ctx.closePath(); ctx.fill();
  }
  // If lives > 6, show bonus count
  if (lives > 6) {
    ctx.font = `7px ${FONT}`; ctx.fillStyle = '#ffee00';
    glow(ctx, '#ffee00', 6);
    ctx.fillText(`+${lives - 6}`, 68 + displayMax * 15 + 2, 76);
  }

  ctx.shadowBlur = 0; ctx.font = `8px ${FONT}`;
  ctx.textAlign = 'right';

  // Always-visible counters stacked at top-right (dim when zero)
  const dimAlpha = 0.35;

  // Flare
  ctx.globalAlpha = flares > 0 ? 1 : dimAlpha;
  ctx.fillStyle = C.hudFlare; glow(ctx, C.hudFlare, flares > 0 ? 8 : 2);
  ctx.fillText(`FLARE ${flares}`, W - 10, 24);

  // Rocket
  ctx.globalAlpha = rocketAmmo > 0 ? 1 : dimAlpha;
  ctx.fillStyle = '#ffaa00'; glow(ctx, '#ffaa00', rocketAmmo > 0 ? 8 : 2);
  ctx.fillText(`ROCKET ${rocketAmmo}`, W - 10, 42);

  // Shield
  ctx.globalAlpha = shieldCharges > 0 ? 1 : dimAlpha;
  ctx.fillStyle = '#00aaff'; glow(ctx, '#00aaff', shieldCharges > 0 ? 8 : 2);
  ctx.fillText(`SHIELD ${shieldCharges}`, W - 10, 60);

  ctx.globalAlpha = 1;

  // Multiplier
  if (multiplier > 1) {
    ctx.fillStyle = '#ffee00'; glow(ctx, '#ffee00', 10);
    ctx.fillText(`${multiplier}x`, W - 10, 78);
  }

  ctx.textAlign = 'left'; ctx.shadowBlur = 0; ctx.lineWidth = 1;
}

// Shield HUD DOM element updater (for mobile shield button)
function _updateShieldHUD(charges) {
  const el = document.getElementById('shield-count');
  if (el) el.textContent = charges;
  const btn = document.getElementById('ctrl-shield');
  if (btn) btn.style.opacity = charges > 0 ? '1' : '0.35';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ── Case Reel (CS:GO style) ───────────────────────────────────────────────────
const CASE_CARD_W = 70;
const CASE_WIN_POS = 50; // which card index holds the winning reward

function _buildCaseReelCards(winSegIdx) {
  // Generate 70 cards, place winning segment at CASE_WIN_POS
  const cards = [];
  for (let i = 0; i < 70; i++) {
    const idx = i === CASE_WIN_POS
      ? winSegIdx
      : Math.floor(Math.random() * SPIN_WHEEL_SEGMENTS.length);
    cards.push(idx);
  }
  return cards;
}

function _renderCaseReel(cards) {
  const reel = document.getElementById('case-reel');
  if (!reel) return;
  reel.innerHTML = '';
  reel.style.transform = 'translateX(0px)';
  cards.forEach((segIdx, i) => {
    const seg = SPIN_WHEEL_SEGMENTS[segIdx];
    const el = document.createElement('div');
    el.className = 'case-card' + (i === CASE_WIN_POS ? ' case-win' : '');
    el.innerHTML = `<div class="cc-icon" style="color:${seg.color};text-shadow:0 0 8px ${seg.color}">${_caseCardIcon(seg.rewardGroup)}</div><div class="cc-label" style="color:${seg.color}">${seg.label}</div>`;
    reel.appendChild(el);
  });
}

function _caseCardIcon(group) {
  const icons = { cash_5:'$', cash_10:'$$', cash_25:'$$$', boost:'*', skin:'~', magneto:'M' };
  return icons[group] || '?';
}

function _animateCaseReel(containerEl, winPos, duration = 5000) {
  return new Promise(resolve => {
    const containerW = containerEl.clientWidth || 340;
    const centerX = containerW / 2;
    // Winning card center in reel coords
    const winCenter = winPos * CASE_CARD_W + CASE_CARD_W / 2;
    // Add a small random offset so it doesn't always land dead-center
    const jitter = (Math.random() - 0.5) * (CASE_CARD_W * 0.5);
    const finalX = centerX - winCenter + jitter;
    const startX = centerX - CASE_CARD_W / 2; // card 0 centered at start

    const reel = document.getElementById('case-reel');
    reel.style.transform = `translateX(${startX}px)`;

    let startTime = null;
    // Decelerate with quintic ease-out
    const easeOut = t => 1 - Math.pow(1 - t, 5);

    let lastTick = 0;
    function frame(ts) {
      if (!startTime) startTime = ts;
      const t = Math.min((ts - startTime) / duration, 1);
      const eased = easeOut(t);
      const current = startX + (finalX - startX) * eased;
      reel.style.transform = `translateX(${current}px)`;
      // Tick sound proportional to speed (more at start, none at end)
      const speed = Math.abs((finalX - startX) * (1 - eased));
      if (speed > 40 && ts - lastTick > 80) { SFX.spinTick(); lastTick = ts; }
      else if (speed > 15 && ts - lastTick > 200) { SFX.spinTick(); lastTick = ts; }
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// ── Main Game Class ───────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx    = this.canvas.getContext('2d');
    this.W = 0; this.H = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.state    = 'loading';
    this.userData = null;
    this.upgrades = {};

    this.ship = null;
    this.asteroids = []; this.bullets = []; this.enemyBullets = [];
    this.rockets = []; this.playerRockets = []; this.fireballs = []; this.particles = [];
    this.redFighters = []; this.yellowAliens = []; this.orangeRockets = [];
    this.coins = []; this.mysteryPickups = [];

    this.score = 0; this.level = 1; this.tick = 0; this.paused = false;
    this.activeMultiplier = 1.0;
    this.redFighterTimer = 0; this.yellowAlienTimer = 0; this.orangeRocketTimer = 0;
    this.runShmipsBonus = 0; this.pickupSpawnTimer = 0;

    this.keys = { left:false, right:false, up:false, fire:false, flare:false, rocket:false, shield:false, joyActive:false, joyAngle:null };
    this._lastFrameTs = 0; this._accum = 0;

    this._bindInputs();
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

    bar.style.width = '15%'; label.textContent = 'WARMING ENGINES...';
    _ss('CALIBRATING RETRO RADAR...','#ffee00');

    const tgUser = await waitForTelegramUser();
    if (tgUser) TG_USER = tgUser;

    const tid = TG_USER?.id;
    const hasWebApp = !!window.Telegram?.WebApp;
    _ss(tid ? 'PILOT LINK ESTABLISHED' : (hasWebApp ? 'WAITING FOR PILOT LINK...' : 'COMM CHANNEL OFFLINE'), tid ? '#00ffcc' : '#ff4466');

    if (!tid) { this._goOffline(bar, label); return; }

    label.textContent = 'SYNCING HANGAR...';
    bar.style.width = '40%';
    let data = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        _ss(`SYNCING HANGAR DATA... (${attempt}/5)`,'#ffee00');
        data = await dbGetOrCreateUser(tid);
        break;
      } catch(e) {
        if (attempt < 5) { _ss('RETRYING COMMS LINK...','#ff9900'); await this._sleep(2000); }
        else { _ss('HANGAR LINK LOST — OFFLINE MODE','#ff4466'); await this._sleep(2500); this._goOffline(bar, label); return; }
      }
    }

    try {
      bar.style.width = '85%';
      _ss(`WELCOME ${data.isNew ? 'PILOT' : data.user.nickname}`,'#00ffcc');
      this.userData = data.user;
      this._parseUpgrades(data.upgrades || []);
      if (data.user.multiplier_end && new Date(data.user.multiplier_end) > new Date()) {
        this.activeMultiplier = Number(data.user.multiplier_value);
        this._showMultiplierBanner();
      }
      bar.style.width = '100%'; label.textContent = 'READY FOR LAUNCH';
      await this._sleep(2500);
      document.getElementById('loading-screen').style.display = 'none';
      if (data.isNew) {
        const saved = localStorage.getItem('meyaret_callsign');
        if (saved && saved !== 'ACE') {
          try { const u = await dbSaveCallsign(tid, saved); this.userData = u; this._loadMenu(); this._showScreen('menu'); }
          catch { this._showScreen('onboarding'); }
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
    bar.style.width = '100%'; label.textContent = 'OFFLINE';
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

  // ── Screen Management ──────────────────────────────────────────────────────
  _showScreen(name) {
    ['onboarding','menu','profile','spin','store','arsenal','gameover'].forEach(s => {
      const el = document.getElementById(`${s}-screen`);
      if (el) el.classList.add('hidden');
    });
    this.canvas.style.display = 'none';
    document.getElementById('controls-overlay').classList.add('hidden');
    const shieldHud = document.getElementById('shield-hud');
    if (shieldHud) shieldHud.classList.add('hidden');

    if (name === 'game') {
      this.canvas.style.display = 'block';
      if (this._isMobile()) document.getElementById('controls-overlay').classList.remove('hidden');
      if (shieldHud) shieldHud.classList.remove('hidden');
      SFX.startGameMusic(this.level);
    } else {
      const el = document.getElementById(`${name}-screen`);
      if (el) el.classList.remove('hidden');
      SFX.startMenuMusic();
    }
    this.state = name;
  }

  _isMobile() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  // ── UI Binding ─────────────────────────────────────────────────────────────
  _bindUI() {
    const unlockOnce = () => { SFX.unlock(); document.removeEventListener('touchstart', unlockOnce); document.removeEventListener('mousedown', unlockOnce); };
    document.addEventListener('touchstart', unlockOnce, { once: true });
    document.addEventListener('mousedown',  unlockOnce, { once: true });
    document.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') SFX.btnClick(); });

    document.getElementById('callsign-confirm').addEventListener('click', () => this._submitCallsign());
    document.getElementById('callsign-input').addEventListener('keydown', e => { if (e.key === 'Enter') this._submitCallsign(); });

    document.getElementById('btn-play').addEventListener('click',    () => this._startGame());
    document.getElementById('btn-spin').addEventListener('click',    () => this._openSpin());
    document.getElementById('btn-store').addEventListener('click',   () => this._openStore());
    document.getElementById('btn-arsenal').addEventListener('click', () => this._openArsenal());
    document.getElementById('btn-quit').addEventListener('click',    () => { if (tg) tg.close(); });
    document.getElementById('profile-btn').addEventListener('click', () => this._openProfile());
    document.getElementById('leaderboard-strip').addEventListener('click', () => this._showTop5Popup());

    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      const applyVolUi = (mode) => {
        muteBtn.classList.toggle('low', mode==='low'); muteBtn.classList.toggle('muted', mode==='mute');
        const icon = mode==='high'?'VOL':mode==='low'?'LOW':'MUTE';
        muteBtn.textContent = `${icon} ${mode.toUpperCase()}`; muteBtn.title = `Volume: ${mode}`;
      };
      applyVolUi(SFX.getVolumeMode());
      muteBtn.addEventListener('click', () => applyVolUi(SFX.cycleVolume()));
    }

    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => { this._loadMenu(); this._showScreen('menu'); });
    });

    document.getElementById('change-nick-btn').addEventListener('click', () => {
      document.getElementById('change-nick-area').classList.toggle('hidden');
    });
    document.getElementById('new-nick-confirm').addEventListener('click', () => this._changeNickname());

    document.getElementById('spin-btn').addEventListener('click', () => this._doSpin());
    document.getElementById('arsenal-open-store').addEventListener('click', () => this._openStore());

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._lastStoreTab = btn.dataset.tab;
        this._renderStoreTab(btn.dataset.tab);
      });
    });

    document.getElementById('go-play-again').addEventListener('click', () => this._startGame());
    document.getElementById('go-menu').addEventListener('click', () => { this._loadMenu(); this._showScreen('menu'); });
  }

  _bindInputs() {
    const kmap = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
                   ArrowUp:'up', KeyW:'up', Space:'fire', KeyF:'flare', ShiftLeft:'flare',
                   KeyR:'rocket', KeyE:'shield' };
    window.addEventListener('keydown', e => { const k=kmap[e.code]; if(k){this.keys[k]=true; e.preventDefault();} });
    window.addEventListener('keyup',   e => { const k=kmap[e.code]; if(k) this.keys[k]=false; });

    const joyBase = document.getElementById('vjoy-base');
    const joyKnob = document.getElementById('vjoy-knob');
    const applyJoy = (cx2, cy2) => {
      const rect = joyBase.getBoundingClientRect();
      const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
      const dx=cx2-cx, dy=cy2-cy, d=Math.hypot(dx,dy);
      const maxR=rect.width/2-6, dead=maxR*0.15, ang=Math.atan2(dy,dx);
      const clampedD=Math.min(d,maxR);
      joyKnob.style.transform=`translate(calc(-50% + ${Math.cos(ang)*clampedD}px), calc(-50% + ${Math.sin(ang)*clampedD}px))`;
      if(d<dead){this.keys.joyAngle=null;this.keys.joyActive=false;this.keys.left=this.keys.right=false;}
      else{this.keys.joyAngle=ang;this.keys.joyActive=true;this.keys.left=this.keys.right=false;}
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
    this._loadSpinTimer();
  }

  async _loadLeaderboard() {
    try {
      const rows = await dbGetLeaderboard();
      const entries = rows.map((e,i) => `${i+1}.${e.nickname} ${Number(e.best_score).toLocaleString()}`).join('  ·  ');
      document.getElementById('lb-entries').textContent = entries || '—';
    } catch { /* non-critical */ }
  }

  async _loadSpinTimer() {
    const timerEl = document.getElementById('menu-spin-timer');
    if (!timerEl) return;
    try {
      const tid = TG_USER?.id || this.userData?.telegram_id;
      if (!tid) return;
      const status = await dbSpinStatus(tid);
      if (status.available) {
        timerEl.textContent = 'SHPIN READY!';
        timerEl.style.color = 'var(--cyan)';
      } else {
        timerEl.style.color = 'var(--muted2)';
        this._tickMenuSpinTimer(status.remainingMs, timerEl);
      }
    } catch { /* non-critical */ }
  }

  _tickMenuSpinTimer(ms, el) {
    const tick = () => {
      ms -= 1000;
      if (ms <= 0) { el.textContent = 'SHPIN READY!'; el.style.color = 'var(--cyan)'; return; }
      const h = Math.floor(ms/3_600_000);
      const m = Math.floor((ms%3_600_000)/60_000);
      const s = Math.floor((ms%60_000)/1000);
      el.textContent = `SHPIN: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      if (this.state === 'menu') setTimeout(tick, 1000);
    };
    tick();
  }

  // ── Start Game ─────────────────────────────────────────────────────────────
  async _startGame() {
    SFX.thrustStop(); this._wasThrusting = false;
    this.score=0; this.level=1; this.tick=0;
    this.asteroids=[]; this.bullets=[]; this.enemyBullets=[];
    this.rockets=[]; this.playerRockets=[]; this.fireballs=[]; this.particles=[];
    this.redFighters=[]; this.yellowAliens=[]; this.orangeRockets=[];
    this.coins=[]; this.mysteryPickups=[];
    this.runShmipsBonus=0; this.pickupSpawnTimer=0;
    this.redFighterTimer=0; this.yellowAlienTimer=0; this.orangeRocketTimer=0;

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
    const boostTypes = ['extra_life','extra_flare','extra_shield','extra_rocket'];
    const consumeList = [];
    boostTypes.forEach(id => {
      if ((this.upgrades[id] || 0) > 0) {
        ups[id] = 1;
        consumeList.push(id);
        // Decrement local copy
        this.upgrades[id] = (this.upgrades[id] || 1) - 1;
        if (this.upgrades[id] <= 0) delete this.upgrades[id];
      }
    });
    // Consume from DB in background (best-effort, non-blocking)
    if (tid && !OFFLINE_MODE && consumeList.length > 0) {
      consumeList.forEach(id => dbConsumeBoost(tid, id).catch(() => {}));
    }

    // ── Permanent upgrades ────────────────────────────────────────────────
    ['magen','pew_pew_15','pew_pew_3','jew_method','kurwa_raketa',
     'ace_upgrade','zep_zep_zep','shplit','tripple_threat','lazer_pew',
     'smart_rocket','collector'].forEach(id => {
      if (this.upgrades[id]) ups[id] = 1;
    });

    // ── Skin color ────────────────────────────────────────────────────────
    const skinColors = {
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
      skin_silver_surfer: { color:'#c0c0c0', accent:'#f0f8ff' },
    };

    if (equippedSkin && this.upgrades[equippedSkin] && skinColors[equippedSkin]) {
      ups.skinId = equippedSkin;
      const sc = skinColors[equippedSkin];
      if (sc.color !== 'rainbow' && sc.color !== 'acid') {
        ups.skin_color = sc.color;
        if (sc.accent) ups.skin_accent = sc.accent;
      }
    }

    if (this.userData?.has_golden_plane) ups.golden_plane = true;

    this.ship = new Ship(this.W/2, this.H/2, ups);
    _updateShieldHUD(this.ship.shieldCharges);
    this._spawnAsteroids(this.level);
    this._showScreen('game');
  }

  _spawnAsteroids(level) {
    const count = Math.min(CFG.baseAsteroids + Math.floor((level-1)*1.2), 18);
    for (let i = 0; i < count; i++) {
      let x, y;
      do { x=rng(0,this.W); y=rng(0,this.H); } while (dist({x,y},{x:this.W/2,y:this.H/2})<130);
      const roll=Math.random();
      const size = level<=2 ? (roll<0.15?'large':roll<0.55?'medium':'small')
                 : level<=5 ? (roll<0.25?'large':roll<0.65?'medium':'small')
                 : level<=10? (roll<0.35?'large':roll<0.7?'medium':'small')
                 :             (roll<0.4?'large':roll<0.75?'medium':'small');
      this.asteroids.push(new Asteroid(x, y, size, null, level));
    }
  }

  _nextLevel() {
    this.level++;
    // Clear all residue so the screen is clean at the start of each level
    this.particles     = [];
    this.bullets       = [];
    this.rockets       = [];
    this.orangeRockets = [];
    this.fireballs     = [];
    this.floatingTexts = [];
    SFX.levelUp();
    SFX.startGameMusic(this.level);
    this._spawnAsteroids(this.level);
  }

  // ── Main Loop ──────────────────────────────────────────────────────────────
  _loop(ts = performance.now()) {
    requestAnimationFrame(nextTs => this._loop(nextTs));
    if (!this._lastFrameTs) this._lastFrameTs = ts;
    const frameMs = Math.min(48, ts - this._lastFrameTs);
    this._lastFrameTs = ts;
    this._accum += frameMs;
    if (this.state !== 'game') {
      if (['menu','profile','store','spin','arsenal','onboarding'].includes(this.state))
        drawGrid(this.ctx, this.W, this.H, this.tick++);
      return;
    }
    const step = 1000/60;
    while (this._accum >= step) { this.tick++; this._update(); this._accum -= step; }
    this._draw();
  }

  _update() {
    if (!this.ship?.alive) return;

    // Input
    if (this.keys.fire)  this.ship.fire(this.bullets, this.fireballs);
    if (this.keys.flare) { this.ship.useFlare(this.rockets, this.particles, this.orangeRockets); this.keys.flare = false; }
    if (this.keys.rocket){ this.ship.fireRocket(this.playerRockets); this.keys.rocket = false; }
    if (this.keys.shield){ this.ship.deployShield(); this.keys.shield = false; }

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

    // JEW METHOD: magnet — strong pull with non-linear falloff
    if (this.ship.hasMagnet) {
      const MAGNET_R = 300, MAGNET_F = 1.8;
      [...this.coins, ...this.mysteryPickups].forEach(p => {
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
    const alienInterval = Math.max(1200 - this.level * 25, 600); // rarer — one every 10-20s
    const redInterval   = Math.max(1400 - this.level * 25, 600);
    this.yellowAlienTimer++;
    if (this.yellowAlienTimer > alienInterval && this.level >= 3) {
      this.yellowAlienTimer = 0;
      if (this.yellowAliens.length < 1) { // max 1 alien on screen at a time
        const{x,y} = this._edgeSpawn();
        this.yellowAliens.push(new YellowAlien(x, y));
      }
    }
    this.redFighterTimer++;
    if (this.redFighterTimer > redInterval && this.level >= 7) {
      this.redFighterTimer = 0;
      if (this.redFighters.length < Math.floor(this.level/6)) {
        const{x,y} = this._edgeSpawn();
        this.redFighters.push(new RedFighter(x, y));
      }
    }
    // Orange homing rockets: start level 5, one at a time per wave
    const orangeInterval = Math.max(900 - this.level * 18, 400);
    this.orangeRocketTimer++;
    if (this.orangeRocketTimer > orangeInterval && this.level >= 5) {
      this.orangeRocketTimer = 0;
      if (this.orangeRockets.length < 1 + Math.floor((this.level - 5) / 4)) {
        const{x,y} = this._edgeSpawn();
        this.orangeRockets.push(new OrangeHomingRocket(x, y));
      }
    }

    // Update entities
    this.asteroids.forEach(a => a.update(this.W, this.H));
    this.bullets.forEach(b => b.update(this.W, this.H));
    this.bullets = this.bullets.filter(b => !b.dead);
    this.enemyBullets.forEach(b => b.update(this.W, this.H));
    this.enemyBullets = this.enemyBullets.filter(b => !b.dead);
    this.rockets.forEach(r => r.update(this.W, this.H));
    this.rockets = this.rockets.filter(r => !r.dead);
    this.playerRockets.forEach(r => r.update(this.W, this.H));
    this.playerRockets = this.playerRockets.filter(r => !r.dead);
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
    this.redFighters.forEach(rf => rf.update(this.ship, this.enemyBullets, this.W, this.H, this.particles));
    this.yellowAliens.forEach(ya => ya.update(this.rockets, this.W, this.H, this.particles));
    this.yellowAliens = this.yellowAliens.filter(ya => !ya.dead);
    this.orangeRockets.forEach(or => or.update(this.ship, this.W, this.H, this.particles));
    this.orangeRockets = this.orangeRockets.filter(or => !or.dead);
    this.coins.forEach(c => c.update());
    this.coins = this.coins.filter(c => !c.dead);
    this.mysteryPickups.forEach(m => m.update());
    this.mysteryPickups = this.mysteryPickups.filter(m => !m.dead);

    // Spawn pickups
    this.pickupSpawnTimer++;
    if (this.pickupSpawnTimer > 360 && this.coins.length === 0 && this.mysteryPickups.length === 0) {
      this.pickupSpawnTimer = 0;
      const x = rng(60, this.W-60), y = rng(60, this.H-60);
      if (Math.random() < 0.6) this.coins.push(new CoinPickup(x, y));
      else this.mysteryPickups.push(new MysteryPickup(x, y));
    }

    this._collisions();
    if (this.asteroids.length === 0) this._nextLevel();
  }

  _edgeSpawn() {
    const side = rngInt(0, 3), m = 30;
    if (side===0) return{x:rng(0,this.W),y:-m};
    if (side===1) return{x:this.W+m,y:rng(0,this.H)};
    if (side===2) return{x:rng(0,this.W),y:this.H+m};
    return{x:-m,y:rng(0,this.H)};
  }

  _collisions() {
    const ship = this.ship;

    // ── COLLECTOR: bullets collect $ and ? ─────────────────────────────────
    if (ship.hasCollector) {
      for (let bi = this.bullets.length-1; bi >= 0; bi--) {
        const b = this.bullets[bi];
        let hit = false;
        for (let ci = this.coins.length-1; ci >= 0; ci--) {
          if (dist(b, this.coins[ci]) < this.coins[ci].radius + b.radius) {
            this.runShmipsBonus++;
            SFX.coinPickup();
            burst(this.particles, this.coins[ci].x, this.coins[ci].y, '#ffdd00', 6, 2, 15);
            new FloatingText(this.coins[ci].x, this.coins[ci].y - 20, '+1 SHMIP', '#ffdd00');
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
        if (hit) { this.bullets.splice(bi, 1); }
      }
    }

    // ── Ship vs coin ────────────────────────────────────────────────────────
    for (let ci = this.coins.length-1; ci >= 0; ci--) {
      if (dist(ship, this.coins[ci]) < ship.radius + this.coins[ci].radius) {
        const{x,y} = this.coins[ci];
        this.runShmipsBonus++;
        SFX.coinPickup();
        burst(this.particles, x, y, '#ffdd00', 8, 2, 20);
        this.coins.splice(ci, 1);
        new FloatingText(x, y-20, '+1 SHMIP', '#ffdd00');
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
            if (ship.hasAce) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); }
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
            if (ship.hasZepZep) { ship.rocketAmmo++; new FloatingText(ship.x, ship.y-30, '+1 ROCKET! (ZEP)', '#ffee00'); _updateShieldHUD(ship.shieldCharges); }
          }
          break;
        }
      }
    }

    // ── Player rockets vs asteroids ─────────────────────────────────────────
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      for (let ai = this.asteroids.length-1; ai >= 0; ai--) {
        if (dist(r, this.asteroids[ai]) < this.asteroids[ai].radius) {
          burst(this.particles, this.asteroids[ai].x, this.asteroids[ai].y, C.asteroid, 15, 4, 30);
          SFX.explodeLarge(); this._addScore(this.asteroids[ai].score*2);
          this.asteroids.splice(ai,1); r.destroy(); break;
        }
      }
    }

    // ── Player rockets vs red fighters ──────────────────────────────────────
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      for (let ei = this.redFighters.length-1; ei >= 0; ei--) {
        if (dist(r, this.redFighters[ei]) < this.redFighters[ei].radius) {
          burst(this.particles, this.redFighters[ei].x, this.redFighters[ei].y, C.enemyRed, 20, 5, 35);
          SFX.enemyDie(); this._addScore(CFG.enemyRedScore*2);
          this.redFighters.splice(ei,1); r.destroy();
          if (ship.hasAce) { ship.lives++; new FloatingText(ship.x, ship.y-30, '+1 LIFE! (ACE)', '#00ffcc'); }
          break;
        }
      }
    }

    // ── Player rockets vs yellow aliens ─────────────────────────────────────
    for (let ri = this.playerRockets.length-1; ri >= 0; ri--) {
      const r = this.playerRockets[ri];
      for (let ei = this.yellowAliens.length-1; ei >= 0; ei--) {
        if (dist(r, this.yellowAliens[ei]) < this.yellowAliens[ei].radius) {
          burst(this.particles, this.yellowAliens[ei].x, this.yellowAliens[ei].y, C.enemyYellow, 20, 5, 35);
          SFX.enemyDie(); this._addScore(CFG.enemyYellowScore*2);
          this.yellowAliens.splice(ei,1); r.destroy();
          if (ship.hasZepZep) { ship.rocketAmmo++; new FloatingText(ship.x, ship.y-30, '+1 ROCKET! (ZEP)', '#ffee00'); }
          break;
        }
      }
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

    // Red fighters vs asteroids
    for (let fi = this.redFighters.length-1; fi >= 0; fi--) {
      const rf = this.redFighters[fi];
      for (const a of this.asteroids) {
        if (dist(rf,a) < rf.radius+a.radius) {
          burst(this.particles, rf.x, rf.y, C.enemyRed, 15, 4, 30);
          SFX.enemyDie(); this.redFighters.splice(fi,1); break;
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

  _detonateFireball(fb) {
    const AOE = 190;
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
    // AOE: obliterate asteroids
    for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
      if (dist(fb, this.asteroids[ai]) < AOE) {
        burst(this.particles, this.asteroids[ai].x, this.asteroids[ai].y, C.asteroid, 10, 3, 25);
        this._addScore(this.asteroids[ai].score * 3);
        this.asteroids.splice(ai, 1);
      }
    }
    // AOE: destroy enemies
    for (let ei = this.redFighters.length - 1; ei >= 0; ei--) {
      if (dist(fb, this.redFighters[ei]) < AOE) {
        burst(this.particles, this.redFighters[ei].x, this.redFighters[ei].y, C.enemyRed, 16, 4, 35);
        this._addScore(CFG.enemyRedScore * 3);
        this.redFighters.splice(ei, 1);
      }
    }
    for (let ei = this.yellowAliens.length - 1; ei >= 0; ei--) {
      if (dist(fb, this.yellowAliens[ei]) < AOE) {
        burst(this.particles, this.yellowAliens[ei].x, this.yellowAliens[ei].y, C.enemyYellow, 16, 4, 35);
        this._addScore(CFG.enemyYellowScore * 3);
        this.yellowAliens.splice(ei, 1);
      }
    }
    for (let oi = this.orangeRockets.length - 1; oi >= 0; oi--) {
      if (dist(fb, this.orangeRockets[oi]) < AOE) {
        this._addScore(150);
        this.orangeRockets.splice(oi, 1);
      }
    }
    // AOE: enemy rockets caught in blast
    for (let ri = this.rockets.length - 1; ri >= 0; ri--) {
      if (dist(fb, this.rockets[ri]) < AOE) this.rockets.splice(ri, 1);
    }
    new FloatingText(fb.x, fb.y - 30, 'KABOOM!', '#ffff00');
  }

  _applyMysteryReward(mx, my) {
    const ship = this.ship;
    const roll = Math.random();
    let label;
    if      (roll < 0.16) { ship.tempRapidUntil    = 900;                          label = 'RAPID FIRE!'; }
    else if (roll < 0.32) {
      if (ship.hasLaser) { ship.tempPinkBeamUntil = 1200; label = 'SUPER LASER!'; }
      else               { ship.tempLaserUntil    = 1200; label = 'LASER!'; }
    }
    else if (roll < 0.44) { ship.lives++;                                           label = '+1 LIFE!'; }
    else if (roll < 0.56) { ship.shieldCharges++; _updateShieldHUD(ship.shieldCharges); label = '+1 SHIELD!'; }
    else if (roll < 0.68) { ship.flares = Math.min(ship.flares+1, 9);              label = '+1 FLARE!'; }
    else if (roll < 0.82) { ship.rocketAmmo++;                                     label = '+1 ROCKET!'; }
    else if (roll < 0.94) { ship.tempPowerBoostUntil = 1200;                       label = '2X DAMAGE!'; }
    else                  { ship.fireballReady = true;                             label = 'FIREBALL READY!'; }
    SFX.mysteryPickup();
    burst(this.particles, mx, my, '#aa00ff', 12, 3, 25);
    new FloatingText(mx, my - 20, label, roll >= 0.94 ? '#ff6600' : '#ff00ff');
  }

  _addScore(pts) { this.score += Math.floor(pts * this.activeMultiplier); }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const{ctx,W,H} = this;
    drawGrid(ctx, W, H, this.tick);
    this.particles.forEach(p=>p.draw(ctx));
    this.coins.forEach(c=>c.draw(ctx));
    this.mysteryPickups.forEach(m=>m.draw(ctx));
    this.asteroids.forEach(a=>a.draw(ctx));
    this.bullets.forEach(b=>b.draw(ctx));
    this.enemyBullets.forEach(b=>b.draw(ctx));
    this.rockets.forEach(r=>r.draw(ctx));
    this.playerRockets.forEach(r=>r.draw(ctx));
    this.redFighters.forEach(rf=>rf.draw(ctx));
    this.yellowAliens.forEach(ya=>ya.draw(ctx));
    this.orangeRockets.forEach(or=>or.draw(ctx));
    this.fireballs.forEach(fb=>fb.draw(ctx));
    if (this.ship?.alive) this.ship.draw(ctx);
    drawHUD(ctx, W, {
      score:        this.score,
      level:        this.level,
      lives:        this.ship?.lives    ?? 0,
      maxLives:     this.ship?.maxLives ?? 3,
      flares:       this.ship?.flares   ?? 0,
      multiplier:   this.activeMultiplier,
      rocketAmmo:   this.ship?.rocketAmmo ?? 0,
      shieldCharges:this.ship?.shieldCharges ?? 0,
    });
  }

  // ── Game Over ──────────────────────────────────────────────────────────────
  async _gameOver() {
    this.ship.alive = false;
    SFX.thrustStop(); SFX.gameOver();
    this._showScreen('gameover');

    const rawScore       = this.score;
    const effectiveScore = Math.floor(rawScore * this.activeMultiplier);
    const shmipsEarned   = (effectiveScore/1000) + (this.runShmipsBonus || 0);

    document.getElementById('go-score').textContent  = `SCORE  ${effectiveScore.toLocaleString()}`;
    document.getElementById('go-shmips').textContent = `+${shmipsEarned.toFixed(2)} $$ EARNED`;
    const isNew = effectiveScore > (this.userData?.best_score||0);
    document.getElementById('go-title').textContent = isNew ? 'NEW HIGH SCORE' : 'GAME OVER';
    setTimeout(() => isNew ? SFX.highScore() : SFX.shmipEarn(), 700);

    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (tid && !OFFLINE_MODE) {
      try {
        const result = await dbSaveScore(tid, rawScore, this.level);
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

    try {
      const rows = await dbGetLeaderboard();
      const lines = rows.map((e,i) => `${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('\n');
      document.getElementById('go-leaderboard').innerHTML =
        `<pre style="font-size:8px;letter-spacing:1px;line-height:2.2">${lines}</pre>`;
    } catch { /* non-critical */ }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async _openProfile() {
    document.getElementById('prof-nick').textContent   = this.userData?.nickname || '—';
    document.getElementById('prof-shmips').textContent = (this.userData?.shmips||0).toLocaleString();
    document.getElementById('prof-best').textContent   = (this.userData?.best_score||0).toLocaleString();
    document.getElementById('prof-games').textContent  = (this.userData?.total_games||0).toLocaleString();

    // Secret dev reset button — only visible for admin ID
    const devArea = document.getElementById('dev-reset-area');
    if (devArea) {
      if (this.userData?.telegram_id === 1357754255) {
        devArea.style.display = 'block';
        const btn = document.getElementById('dev-reset-btn');
        if (btn && !btn._bound) {
          btn._bound = true;
          btn.addEventListener('click', async () => {
            btn.textContent = 'RESETTING...';
            btn.disabled = true;
            try {
              await dbDevReset(this.userData.telegram_id);
              localStorage.removeItem('meyaret_equip_jet');
              localStorage.removeItem('meyaret_equip_skin');
              this.upgrades = {};
              this.userData.shmips = 30000;
              document.getElementById('prof-shmips').textContent = '30,000';
              btn.textContent = 'DONE! RELOAD TO APPLY';
            } catch(e) {
              btn.textContent = 'ERROR: ' + e.message;
              btn.disabled = false;
            }
          });
        }
      } else {
        devArea.style.display = 'none';
      }
    }

    this._showScreen('profile');
  }

  async _showTop5Popup() {
    const modal = document.getElementById('top5-modal');
    const entriesEl = document.getElementById('top5-entries');
    try {
      const rows = await dbGetLeaderboard();
      entriesEl.innerHTML = rows.length
        ? rows.map((e,i)=>`${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('<br>')
        : 'NO SCORES YET';
    } catch { entriesEl.textContent = 'NO SCORES YET'; }
    modal.classList.remove('hidden');
    document.getElementById('top5-close').onclick = () => modal.classList.add('hidden');
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
    const jetNames = { starter:'STARTER JET', plane_hamud:'F2 HAMUDI', plane_walla_yofi:'F16 KILLAJET', plane_very_scary:'F35 VERY SCARY JET' };
    const jetStats = {
      starter:          '3 LIVES · 1 FLARE',
      plane_hamud:      '3 LIVES · 2 FLARES · 2 ROCKETS',
      plane_walla_yofi: '3 LIVES · 3 FLARES · 3 ROCKETS · SHIELD · ×1.5 FIRE',
      plane_very_scary: '4 LIVES · 3 FLARES · 4 ROCKETS · SHIELD',
    };
    const el = document.getElementById('ars-jet');      if (el) el.textContent = jetNames[equippedJet] || equippedJet.toUpperCase();
    const el2 = document.getElementById('ars-weapon'); if (el2) el2.textContent = this.upgrades.lazer_pew ? 'LAZER PEW' : this.upgrades.tripple_threat ? 'TRIPPLE THREAT' : this.upgrades.shplit ? 'SHPLIT' : 'STANDARD';
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

  // ── Profile: change nickname ───────────────────────────────────────────────
  async _changeNickname() {
    const raw   = document.getElementById('new-nick-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('new-nick-error');
    if (!raw||raw.length<2){errEl.textContent='Min 2 characters.';return;}
    const tid = TG_USER?.id||this.userData?.telegram_id;
    if (!tid){errEl.textContent='Not logged in.';return;}
    try {
      if (raw !== this.userData?.nickname) {
        const{available} = await dbCheckCallsign(raw);
        if (!available){errEl.textContent='CALLSIGN TAKEN.';return;}
      }
      const updated = await dbSaveCallsign(tid, raw);
      this.userData = {...this.userData, ...updated};
      localStorage.setItem('meyaret_callsign', updated.nickname);
      document.getElementById('prof-nick').textContent = updated.nickname;
      document.getElementById('change-nick-area').classList.add('hidden');
      errEl.textContent=''; this._loadMenu();
    } catch(err){ errEl.textContent = err.message||'Error. Try again.'; }
  }

  // ── SHPIN (CS:GO case opening) ────────────────────────────────────────────
  async _openSpin() {
    this._showScreen('spin');

    // Render a static preview reel
    const previewCards = _buildCaseReelCards(0);
    _renderCaseReel(previewCards);
    // Scroll to middle of reel so it looks populated
    const reel = document.getElementById('case-reel');
    const outer = document.getElementById('case-reel-outer');
    const containerW = outer?.clientWidth || 340;
    reel.style.transform = `translateX(${containerW / 2 - 5 * CASE_CARD_W - CASE_CARD_W / 2}px)`;

    const tid   = TG_USER?.id || this.userData?.telegram_id;
    const btn   = document.getElementById('spin-btn');
    const timer = document.getElementById('spin-countdown');
    const result = document.getElementById('spin-result');
    result.classList.add('hidden');

    if (!tid) {
      btn.disabled = true; btn.style.opacity = '0.4';
      timer.textContent = 'OPEN VIA TELEGRAM'; timer.classList.remove('hidden');
      return;
    }

    let status = null;
    try { status = await dbSpinStatus(tid); } catch { /* non-critical */ }
    if (status?.available) {
      btn.disabled = false; btn.style.opacity = '1'; timer.classList.add('hidden');
    } else if (status) {
      btn.disabled = true; btn.style.opacity = '0.4';
      timer.classList.remove('hidden');
      this._startSpinCountdown(status.remainingMs, timer);
    }
  }

  _startSpinCountdown(ms, el) {
    const tick = () => {
      ms -= 1000;
      if (ms <= 0) { el.textContent = 'SHPIN READY!'; el.style.color = 'var(--cyan)'; return; }
      const h = Math.floor(ms/3_600_000), m = Math.floor((ms%3_600_000)/60_000), s = Math.floor((ms%60_000)/1000);
      el.textContent = `NEXT SHPIN: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      setTimeout(tick, 1000);
    };
    tick();
  }

  async _doSpin() {
    const btn    = document.getElementById('spin-btn');
    const result = document.getElementById('spin-result');
    const outer  = document.getElementById('case-reel-outer');
    btn.disabled = true; result.classList.add('hidden');

    if (OFFLINE_MODE) {
      result.textContent = 'OFFLINE — SHPIN REQUIRES CONNECTION';
      result.classList.remove('hidden'); btn.disabled = false; return;
    }

    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (!tid) { result.textContent = 'OPEN VIA TELEGRAM'; result.classList.remove('hidden'); btn.disabled = false; return; }

    // Fetch reward from Supabase
    let data = null;
    try {
      data = await dbDoSpin(tid);
    } catch(e) {
      result.textContent = (e.message || 'SHPIN FAILED').toUpperCase();
      result.classList.remove('hidden'); btn.disabled = false; return;
    }
    if (data?.error) {
      result.textContent = data.error.toUpperCase();
      result.classList.remove('hidden'); btn.disabled = false; return;
    }

    const reward = data?.reward;
    if (!reward) return;

    // Build reel with winning segment at CASE_WIN_POS, then animate
    const segIdx = reward.segmentIndex ?? 0;
    const cards  = _buildCaseReelCards(segIdx);
    _renderCaseReel(cards);
    await _animateCaseReel(outer, CASE_WIN_POS, 5000);

    result.textContent = `YOU GOT: ${reward.label}!`;
    result.classList.remove('hidden');
    SFX.shmipEarn && SFX.shmipEarn();

    // Refresh user data
    try {
      const me = await dbGetOrCreateUser(tid);
      if (me) { this.userData = me.user; this._parseUpgrades(me.upgrades || []); }
    } catch { /* non-critical */ }
    this._loadMenu();

    btn.disabled = true; btn.style.opacity = '0.4';
    const timerEl = document.getElementById('spin-countdown');
    timerEl.classList.remove('hidden');
    this._startSpinCountdown(9 * 60 * 60 * 1000, timerEl);
  }

  // ── Store ──────────────────────────────────────────────────────────────────
  async _openStore() {
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
    (this._catalog || []).filter(item => item.category === category).forEach(item => {
      const qty = this.upgrades[item.id] || 0;
      // Boosts: locked once 1 is owned (max 1 per round).
      // Upgrades/skins/jets: locked once owned (non-stackable only).
      const locked = item.category === 'boost'
        ? qty >= 1
        : (!item.stackable && qty > 0);
      const el = document.createElement('div'); el.className = 'store-item';
      const colorDot = (item.category==='skin' && item.color && item.color!=='rainbow' && item.color!=='acid')
        ? `<span style="display:inline-block;width:10px;height:10px;background:${item.color};border-radius:50%;margin-right:4px;vertical-align:middle;"></span>`
        : '';
      const btnLabel = locked
        ? (item.category === 'boost' ? 'READY' : 'OWNED')
        : 'BUY';
      el.innerHTML = `
        <div class="store-item-info">
          <div class="store-item-name">${colorDot}${item.name}</div>
          <div class="store-item-desc">${item.description}</div>
        </div>
        <span class="store-item-cost">${item.cost} $$</span>
        <button class="store-buy-btn${locked ? ' owned' : ''}" data-id="${item.id}">
          ${btnLabel}
        </button>`;
      if (!locked) el.querySelector('button').addEventListener('click', () => this._buyItem(item));
      grid.appendChild(el);
    });
  }

  async _buyItem(item) {
    const msg = document.getElementById('store-msg');
    if (OFFLINE_MODE) {
      msg.textContent = 'OFFLINE — CONNECT VIA TELEGRAM TO PURCHASE.';
      msg.className = 'store-msg fail'; msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000); return;
    }
    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (!tid) { msg.textContent = 'NOT LOGGED IN.'; msg.className = 'store-msg fail'; msg.classList.remove('hidden'); return; }
    try {
      SFX.btnClick();
      const{newBalance} = await dbBuyItem(tid, item.id);
      this.userData.shmips = newBalance;
      this.upgrades[item.id] = (this.upgrades[item.id]||0) + 1;
      document.getElementById('store-balance').textContent = `BALANCE: ${newBalance.toLocaleString()} $$`;
      msg.textContent = `${item.name} ACQUIRED!`; msg.className = 'store-msg success'; msg.classList.remove('hidden');
      SFX.shmipEarn && SFX.shmipEarn();
      setTimeout(() => msg.classList.add('hidden'), 3000);
      this._renderStoreTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'boost');
    } catch(e) {
      msg.textContent = e.message || 'PURCHASE FAILED.'; msg.className = 'store-msg fail'; msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => { new Game(); });
