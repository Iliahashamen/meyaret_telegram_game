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
  dbSpinStatus, dbDoSpin, dbAddBonusShmips,
  SPIN_WHEEL_SEGMENTS,
} from './db.js';

// ── Telegram WebApp Init ──────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.disableVerticalSwipes?.(); }
// TG_USER is resolved lazily in _init() with a retry loop — do not read here
let TG_USER = tg?.initDataUnsafe?.user || null;
const INIT_DATA = tg?.initData || '';

// Helper: wait up to 3s for Telegram to populate initDataUnsafe.user
async function waitForTelegramUser() {
  // Already available
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

// ── API ───────────────────────────────────────────────────────────────────────
// API_BASE: empty = same origin (Railway serves frontend+backend)
// Set window.MEYARET_API in config.js when using GitHub Pages
const API_BASE = (typeof window !== 'undefined' && window.MEYARET_API) || '';

// Offline/demo mode: set to true if backend is unreachable
let OFFLINE_MODE = false;

async function apiFetch(path, opts = {}, retries = 2) {
  const url = API_BASE + path;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': INIT_DATA,
          ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
      }
      OFFLINE_MODE = false;
      return res.json();
    } catch (err) {
      console.warn(`[API] attempt ${attempt + 1}/${retries + 1} — ${opts.method || 'GET'} ${url}:`, err.message);
      if (attempt < retries) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
      else throw err;
    }
  }
}

// Demo user used when backend is unreachable
const DEMO_USER = {
  telegram_id: 0,
  nickname: localStorage.getItem('meyaret_callsign') || null,
  shmips: 0,
  best_score: 0,
  total_games: 0,
  has_golden_plane: false,
  multiplier_value: 1.0,
  multiplier_end: null,
};

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:           '#020008',    // very dark, almost black with a hint of purple
  ship:         '#ff0077',    // hot magenta — clearly not white
  bullet:       '#ff0077',
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
  rotSpeed:     0.042,        // joystick rotation (still used for keyboard)
  thrustPower:  0.09,         // responsive thrust
  friction:     0.965,       // strong friction — ship points where it goes, no drift
  bulletSpeed:  6,
  bulletLife:   65,
  laserLife:    25,
  rocketSpeed:  1.7,
  flareRadius:  85,
  asteroidSizes: { large: 42, medium: 21, small: 10 },
  asteroidScores: { large: 20, medium: 50, small: 100 },
  enemyRedScore:    200,
  enemyYellowScore: 150,
  maxBullets:   6,
  respawnMs:    2400,
  invincibleMs: 3000,
  baseAsteroids: 2,           // level 1 starts with 2 asteroids
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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function glow(ctx, color, blur = 12) {
  ctx.shadowColor = color;
  ctx.shadowBlur  = blur;
}

// ── Particle ──────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = C.particle, speed = 3, life = 30) {
    this.x = x; this.y = y;
    this.vx = rng(-speed, speed);
    this.vy = rng(-speed, speed);
    this.life = life; this.maxLife = life;
    this.color = color;
    this.radius = rng(1, 3);
  }
  update() { this.x += this.vx; this.y += this.vy; this.vx *= 0.96; this.vy *= 0.96; this.life--; }
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    glow(ctx, this.color, 8);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

function burst(particles, x, y, color, count = 12, speed = 3, life = 30) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color, speed, life));
}

// ── Ship ──────────────────────────────────────────────────────────────────────
class Ship {
  constructor(x, y, upgrades = {}) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = -Math.PI / 2;   // pointing up
    this.alive = true;
    this.invincible = false;
    this.invTimer   = 0;
    this.blinkTimer = 0;

    // Upgrades & loadout
    this.maxLives  = 3 + (upgrades.extra_life || 0) + (upgrades.plane_lives || 0);
    this.lives     = this.maxLives;
    this.maxFlares = 2 + (upgrades.extra_flare || 0) + (upgrades.plane_flares || 0);
    this.flares    = this.maxFlares;
    this.hasLaser  = !!(upgrades.laser || upgrades.plane_laser);
    this.hasRapid  = !!(upgrades.rapid_fire || upgrades.plane_rapid);
    this.hasShield = !!(upgrades.shield || upgrades.plane_shield);
    this.shieldUp  = this.hasShield;

    this.color  = upgrades.skin_color  || C.ship;
    this.accent = upgrades.skin_accent || null;
    this.golden = !!(upgrades.golden_plane);

    this.fireCooldown  = 0;
    this.fireRate      = this.hasRapid ? 12 : 22;
    this.thrusting     = false;
    this.tempLaserUntil   = 0;
    this.tempRapidUntil   = 0;
    this.tempPowerBoostUntil = 0;
  }

  update(keys, W, H) {
    if (this.invincible) {
      this.invTimer--;
      this.blinkTimer++;
      if (this.invTimer <= 0) this.invincible = false;
    }

    if (keys.joyActive && keys.joyAngle !== null) {
      // Ship faces joystick; thrust aligns velocity with facing (no drift)
      this.angle = keys.joyAngle - Math.PI / 2;
      this.thrusting = keys.up;
      if (keys.up) {
        const tx = Math.cos(keys.joyAngle) * CFG.thrustPower;
        const ty = Math.sin(keys.joyAngle) * CFG.thrustPower;
        this.vx += tx;
        this.vy += ty;
        // Strong alignment: bias velocity toward thrust direction to reduce drift
        const spd = Math.hypot(this.vx, this.vy);
        if (spd > 0.3) {
          const want = Math.atan2(ty, tx);
          const cur = Math.atan2(this.vy, this.vx);
          let diff = want - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const blend = 0.25;
          const nang = cur + diff * blend;
          this.vx = Math.cos(nang) * spd;
          this.vy = Math.sin(nang) * spd;
        }
      }
    } else {
      // Keyboard / no joystick
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
  }

  draw(ctx) {
    if (this.invincible && this.blinkTimer % 6 < 3) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    const col = this.golden ? C.golden : this.color;
    const sz  = this.golden ? 18 : 14;
    glow(ctx, col, this.golden ? 20 : 12);

    // Ship body (triangle)
    ctx.strokeStyle = col;
    ctx.lineWidth   = this.golden ? 2.5 : 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.6, sz * 0.6);
    ctx.lineTo(0, sz * 0.3);
    ctx.lineTo(-sz * 0.6, sz * 0.6);
    ctx.closePath();
    ctx.stroke();

    // Accent trim
    if (this.accent) {
      ctx.strokeStyle = this.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.4, sz * 0.2);
      ctx.lineTo(sz * 0.4, sz * 0.2);
      ctx.stroke();
    }

    // Thrust flame
    if (this.thrusting) {
      const flameSz = rng(6, 10);
      ctx.strokeStyle = this.golden ? C.golden : '#ff6600';
      glow(ctx, '#ff6600', 16);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-sz * 0.3, sz * 0.5);
      ctx.lineTo(0, sz * 0.5 + flameSz);
      ctx.lineTo(sz * 0.3, sz * 0.5);
      ctx.stroke();
    }

    // Shield ring
    if (this.shieldUp) {
      ctx.strokeStyle = '#00aaff';
      glow(ctx, '#00aaff', 16);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, sz + 8, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  canFire() { return this.fireCooldown <= 0; }
  get effectiveLaser() { return this.hasLaser || this.tempLaserUntil > 0; }
  get effectiveRapid() { return this.hasRapid || this.tempRapidUntil > 0; }
  get effectiveFireRate() { return this.effectiveRapid ? 12 : 22; }

  fire(bullets) {
    if (!this.canFire()) return;
    this.fireCooldown = this.effectiveFireRate;
    const nose = { x: this.x + Math.cos(this.angle) * 16, y: this.y + Math.sin(this.angle) * 16 };
    if (this.effectiveLaser) {
      bullets.push(new Laser(nose.x, nose.y, this.angle));
      SFX.laser();
    } else {
      bullets.push(new Bullet(nose.x, nose.y, this.angle, this.golden));
      SFX.shoot();
    }
  }

  useFlare(rockets, particles) {
    if (this.flares <= 0) return;
    this.flares--;
    SFX.flare();
    // Destroy all rockets globally (panic-flare)
    for (let i = rockets.length - 1; i >= 0; i--) {
      burst(particles, rockets[i].x, rockets[i].y, C.flare, 10, 4);
      rockets.splice(i, 1);
    }
  }

  hit(particles) {
    if (this.invincible) return false;
    if (this.shieldUp)   { this.shieldUp = false; this.invincible = true; this.invTimer = 60; return false; }
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
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Laser ─────────────────────────────────────────────────────────────────────
class Laser {
  constructor(x, y, angle) {
    this.x = x; this.y = y;
    this.angle = angle;
    this.len  = 40;
    this.life = CFG.laserLife;
    this.vx = Math.cos(angle) * 14;
    this.vy = Math.sin(angle) * 14;
    this.radius = 4;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    glow(ctx, C.laser, 16);
    ctx.strokeStyle = C.laser;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - Math.cos(this.angle) * this.len, this.y - Math.sin(this.angle) * this.len);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const ASTEROID_SHAPES = 6;   // cached point offsets per size

class Asteroid {
  constructor(x, y, size = 'large', angle = null, level = 1) {
    this.x = x; this.y = y;
    this.size = size;
    this.radius = CFG.asteroidSizes[size];
    // Gentler difficulty ramp — level 3+ not as punishing
    const speedMult = 0.4 + Math.min(level - 1, 10) * 0.05;
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
    const n = rngInt(6, 9);
    const pts = [];
    const r = this.radius;
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i;
      const d = rng(r * 0.6, r * 1.0);
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
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    glow(ctx, C.asteroid, 10);
    ctx.strokeStyle = C.asteroid;
    ctx.fillStyle   = C.asteroidFill;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    this.points.forEach(([px, py], i) => i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  split(particles) {
    burst(particles, this.x, this.y, C.asteroid, 8, 2.5, 25);
    if (this.size === 'large')  { SFX.explodeLarge(); return [new Asteroid(this.x, this.y, 'medium'), new Asteroid(this.x, this.y, 'medium')]; }
    if (this.size === 'medium') { SFX.explodeMed();   return [new Asteroid(this.x, this.y, 'small'),  new Asteroid(this.x, this.y, 'small')];  }
    SFX.explodeSmall();
    return [];
  }
}

// ── Red Fighter (enemy, tracks player) ───────────────────────────────────────
class RedFighter {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.angle = 0;
    this.speed  = 1.6;
    this.shootTimer = 0;
    this.shootRate  = 130;
    this.health = 3;
    this.radius = 14;
    this.bobTimer = 0;
  }

  update(ship, bullets, W, H, particles) {
    this.bobTimer++;
    // Track player
    const dx = ship.x - this.x;
    const dy = ship.y - this.y;
    this.angle = Math.atan2(dy, dx);
    this.vx += Math.cos(this.angle) * 0.08;
    this.vy += Math.sin(this.angle) * 0.08;
    const spd = Math.hypot(this.vx, this.vy);
    if (spd > this.speed) { this.vx = (this.vx / spd) * this.speed; this.vy = (this.vy / spd) * this.speed; }
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);

    this.shootTimer++;
    if (this.shootTimer >= this.shootRate) {
      this.shootTimer = 0;
      const nose = { x: this.x + Math.cos(this.angle) * 18, y: this.y + Math.sin(this.angle) * 18 };
      bullets.push(new EnemyBullet(nose.x, nose.y, this.angle, '#ff3333'));
      SFX.enemyShoot();
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);

    glow(ctx, C.enemyRed, 14);
    ctx.strokeStyle = C.enemyRed;
    ctx.fillStyle   = '#110000';
    ctx.lineWidth   = 2;

    // Fighter jet silhouette (stylized triangle with wings)
    ctx.beginPath();
    ctx.moveTo(0, -16);          // nose
    ctx.lineTo(10, 8);           // right wing tip
    ctx.lineTo(5, 2);
    ctx.lineTo(0, 10);
    ctx.lineTo(-5, 2);
    ctx.lineTo(-10, 8);          // left wing tip
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Engine glow
    ctx.fillStyle = `rgba(255,80,0,${0.4 + 0.3 * Math.sin(this.bobTimer * 0.2)})`;
    ctx.beginPath(); ctx.arc(0, 9, 4, 0, TAU); ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  hit(particles) {
    burst(particles, this.x, this.y, C.enemyRed, 8, 3, 20);
    this.health--;
    if (this.health <= 0) SFX.enemyDie();
    return this.health <= 0;
  }
}

// ── Yellow Alien Ship ─────────────────────────────────────────────────────────
class YellowAlien {
  constructor(x, y) {
    this.x = x; this.y = y;
    const ang = rng(0, TAU);
    this.vx = Math.cos(ang) * rng(0.8, 1.5);
    this.vy = Math.sin(ang) * rng(0.8, 1.5);
    this.angle = 0;
    this.lifeTimer = 0;
    this.maxLife   = 720;
    this.swoops = 0;
    this.health = 2;
    this.radius = 16;
    this.bobTimer = 0;
  }

  update(_bullets, W, H, _particles) {
    this.bobTimer++;
    this.lifeTimer++;
    this.x += this.vx;
    this.y += this.vy;
    if (this.x < -20) { this.x = W + 20; this.swoops++; }
    if (this.x > W + 20) { this.x = -20; this.swoops++; }
    this.y = wrap(this.y, 0, H);
    // Bounce off edges (soft)
    if (this.x < 60 || this.x > W - 60) this.vx *= -1;
    if (this.y < 60 || this.y > H - 60) this.vy *= -1;

    // Green alien does 2 swoops then leaves (no shooting)
    this.dead = this.swoops >= 2 || this.lifeTimer > this.maxLife;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.bobTimer * 0.04) * 4);

    glow(ctx, '#00ff66', 16);
    ctx.strokeStyle = '#00ff66';
    ctx.fillStyle   = '#110f00';
    ctx.lineWidth   = 2;

    // Classic saucer shape
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 8, 0, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -5, 10, 7, 0, Math.PI, TAU);
    ctx.fill(); ctx.stroke();

    // Lights
    for (let i = 0; i < 5; i++) {
      const lx = (i - 2) * 7;
      const on = Math.floor(this.bobTimer / 8 + i) % 2 === 0;
      ctx.fillStyle = on ? '#00ff66' : '#005522';
      ctx.beginPath(); ctx.arc(lx, 1, 2, 0, TAU); ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
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
    this.vx = Math.cos(angle) * 4.2;
    this.vy = Math.sin(angle) * 4.2;
    this.life = 70;
    this.color = color;
    this.radius = 4;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
  }
  draw(ctx) {
    glow(ctx, this.color, 10);
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Coin Pickup (+1 shmip, lasts 5 sec) ───────────────────────────────────────
class CoinPickup {
  constructor(x, y, W, H) {
    this.x = x; this.y = y;
    this.radius = 12;
    this.life = 300;  // 5 sec at 60fps
  }
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
    ctx.globalAlpha = pulse;
    glow(ctx, '#ffdd00', 14);
    ctx.fillStyle = '#ffdd00';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#332200';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', this.x, this.y + 1);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Mystery Pickup (? — random boost) ─────────────────────────────────────────
class MysteryPickup {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 14;
    this.life = 420;  // 7 sec to collect
  }
  update() { this.life--; }
  draw(ctx) {
    const pulse = Math.sin(Date.now() * 0.01) * 0.25 + 0.75;
    ctx.globalAlpha = pulse;
    glow(ctx, '#aa00ff', 16);
    ctx.fillStyle = '#220033';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#aa00ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff00ff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', this.x, this.y + 1);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Rocket (from Yellow Alien, deflectable by flare) ──────────────────────────
class Rocket {
  constructor(x, y, angle) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * CFG.rocketSpeed;
    this.vy = Math.sin(angle) * CFG.rocketSpeed;
    this.angle = angle;
    this.life = 120;
    this.radius = 5;
    this.tailTimer = 0;
  }
  update(W, H) {
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    this.life--;
    this.tailTimer++;
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle + Math.PI / 2);
    glow(ctx, C.rocket, 14);
    ctx.strokeStyle = C.rocket;
    ctx.lineWidth = 2;
    // Body
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(3, 4); ctx.lineTo(-3, 4); ctx.closePath();
    ctx.stroke();
    // Tail flame
    ctx.strokeStyle = '#ff6600';
    glow(ctx, '#ff6600', 10);
    ctx.beginPath();
    ctx.moveTo(-2, 4); ctx.lineTo(0, 4 + rng(4, 8)); ctx.lineTo(2, 4);
    ctx.stroke();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
  get dead() { return this.life <= 0; }
}

// ── Background: Pure 1979-style Black + sparse dim stars ─────────────────────
// Three star layers: tiny background · medium · bright foreground
const STARS_BG  = Array.from({ length: 55 }, (_, i) => ({
  x: (i * 173 + 31)  % 1000,
  y: (i * 271 + 97)  % 1000,
  r: 0.35,
  phase: i * 0.37,
}));
const STARS_MID = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 229 + 61)  % 1000,
  y: (i * 347 + 113) % 1000,
  r: i % 5 === 0 ? 1.1 : 0.7,
  phase: i * 0.61,
  tint: i % 4 === 0 ? '#c4aaff' : '#ffffff',
}));
const STARS_FG  = Array.from({ length: 7 }, (_, i) => ({
  x: (i * 397 + 211) % 1000,
  y: (i * 503 + 89)  % 1000,
  r: 1.6,
  phase: i * 1.1,
}));

function drawGrid(ctx, W, H, tick) {
  ctx.clearRect(0, 0, W, H);

  // Near-black deep space base
  const bg = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.9);
  bg.addColorStop(0,   '#08001a');
  bg.addColorStop(0.5, '#040010');
  bg.addColorStop(1,   '#020008');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faint magenta nebula — top right
  const neb = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, W * 0.5);
  neb.addColorStop(0,   'rgba(180,0,80,0.055)');
  neb.addColorStop(0.5, 'rgba(100,0,50,0.02)');
  neb.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = neb;
  ctx.fillRect(0, 0, W, H);

  // Faint cyan nebula — bottom left
  const neb2 = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, W * 0.45);
  neb2.addColorStop(0,   'rgba(0,200,160,0.045)');
  neb2.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = neb2;
  ctx.fillRect(0, 0, W, H);

  // Layer 1 — tiny background stars
  for (const s of STARS_BG) {
    const twinkle = Math.sin(tick * 0.008 + s.phase) * 0.15 + 0.85;
    ctx.globalAlpha = twinkle * 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc((s.x / 1000) * W, (s.y / 1000) * H, s.r, 0, TAU);
    ctx.fill();
  }

  // Layer 2 — medium stars, some with purple tint
  for (const s of STARS_MID) {
    const twinkle = Math.sin(tick * 0.011 + s.phase) * 0.25 + 0.75;
    ctx.globalAlpha = twinkle * (s.r > 1 ? 0.55 : 0.38);
    ctx.fillStyle = s.tint || '#ffffff';
    ctx.beginPath();
    ctx.arc((s.x / 1000) * W, (s.y / 1000) * H, s.r, 0, TAU);
    ctx.fill();
  }

  // Layer 3 — bright foreground stars with soft glow
  for (const s of STARS_FG) {
    const twinkle = Math.sin(tick * 0.016 + s.phase) * 0.35 + 0.65;
    const sx = (s.x / 1000) * W;
    const sy = (s.y / 1000) * H;
    ctx.globalAlpha = twinkle * 0.85;
    ctx.shadowBlur  = 10;
    ctx.shadowColor = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, TAU);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD(ctx, W, { score, level, lives, maxLives, flares, multiplier }) {
  // HUD panel — semi-transparent pixel border style
  ctx.globalAlpha = 0.55;
  ctx.fillStyle   = '#0a0018';
  roundRect(ctx, 6, 6, 152, 88, 0);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#00ffcc33';
  ctx.lineWidth = 1;
  roundRect(ctx, 6, 6, 152, 88, 0);
  ctx.stroke();

  const FONT = '"Press Start 2P", "Courier New", monospace';
  ctx.textAlign = 'left';

  // SCORE label
  ctx.font = `8px ${FONT}`;
  glow(ctx, C.hud, 6);
  ctx.fillStyle = '#00ffcc88';
  ctx.fillText('SCORE', 14, 24);

  // Score value — bigger
  ctx.font = `12px ${FONT}`;
  glow(ctx, C.hud, 10);
  ctx.fillStyle = C.hud;
  ctx.fillText(score.toLocaleString(), 14, 42);

  // LV label
  ctx.font = `8px ${FONT}`;
  ctx.fillStyle = C.hudLevel;
  glow(ctx, C.hudLevel, 6);
  ctx.fillText(`LV ${level}`, 14, 60);

  // Lives label + ship triangles
  ctx.fillStyle = C.hud;
  glow(ctx, C.hud, 5);
  ctx.fillText('LIVES', 14, 78);
  for (let i = 0; i < maxLives; i++) {
    const lx = 68 + i * 16;
    const ly = 78;
    ctx.fillStyle   = i < lives ? C.hud : '#0a0020';
    ctx.shadowBlur  = i < lives ? 8 : 0;
    ctx.shadowColor = C.hud;
    ctx.beginPath();
    ctx.moveTo(lx + 4, ly - 7); ctx.lineTo(lx + 9, ly); ctx.lineTo(lx, ly);
    ctx.closePath(); ctx.fill();
  }

  // Flares — top right
  ctx.font = `8px ${FONT}`;
  ctx.fillStyle = C.hudFlare;
  glow(ctx, C.hudFlare, 8);
  ctx.textAlign = 'right';
  ctx.fillText(`FLARE ${flares}`, W - 10, 24);

  // Multiplier
  if (multiplier > 1) {
    ctx.fillStyle = '#ffee00';
    glow(ctx, '#ffee00', 10);
    ctx.fillText(`${multiplier}x`, W - 10, 44);
  }

  ctx.textAlign  = 'left';
  ctx.shadowBlur = 0;
  ctx.lineWidth  = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Spin Wheel (segments from db.js — must match rewards 1:1) ───────────────────
function drawSpinWheel(canvas, rotation) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, r = W / 2 - 8;
  ctx.clearRect(0, 0, W, H);
  const n = SPIN_WHEEL_SEGMENTS.length;

  SPIN_WHEEL_SEGMENTS.forEach((seg, i) => {
    const start = rotation + (TAU / n) * i;
    const end   = start + TAU / n;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = '#0a0a1e';
    ctx.fill();
    glow(ctx, seg.color, 8);
    ctx.strokeStyle = seg.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + TAU / n / 2);
    ctx.fillStyle = seg.color;
    ctx.font = 'bold 11px "Courier New"';
    ctx.textAlign = 'center';
    ctx.fillText(seg.label, r * 0.62, 4);
    ctx.restore();
  });

  // Pointer
  glow(ctx, '#ffffff', 10);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, 4); ctx.lineTo(cx - 7, 18); ctx.lineTo(cx + 7, 18);
  ctx.closePath(); ctx.fill();

  // Center cap
  ctx.fillStyle = '#0a0a1e';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── Main Game Class ───────────────────────────────────────────────────────────
class Game {
  constructor() {
    this.canvas  = document.getElementById('game-canvas');
    this.ctx     = this.canvas.getContext('2d');
    this.W = 0; this.H = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // State
    this.state    = 'loading';
    this.userData = null;
    this.upgrades = {};

    // Gameplay
    this.ship        = null;
    this.asteroids   = [];
    this.bullets     = [];
    this.enemyBullets = [];
    this.rockets     = [];
    this.particles   = [];
    this.redFighters = [];
    this.yellowAliens = [];

    this.score   = 0;
    this.level   = 1;
    this.tick    = 0;
    this.paused  = false;

    // Multiplier
    this.activeMultiplier = 1.0;

    // Enemy spawn timers
    this.redFighterTimer  = 0;
    this.yellowAlienTimer = 0;

    // Keys
    this.keys = { left: false, right: false, up: false, fire: false, flare: false, joyActive: false, joyAngle: null };
    this._lastFrameTs = 0;
    this._accum = 0;

    this._bindInputs();
    this._bindUI();
    this._init();

    requestAnimationFrame((ts) => this._loop(ts));
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
  }

  // ── Init: connect directly to Supabase (no Railway dependency) ────────────
  async _init() {
    const bar    = document.getElementById('loading-bar');
    const label  = document.getElementById('loading-label') || { textContent: '' };
    const status = document.getElementById('loading-status');
    const _setStatus = (msg, color) => { if (status) { status.textContent = msg; status.style.color = color || '#00ffcc'; } };

    bar.style.width = '15%';
    label.textContent = 'WARMING ENGINES...';
    _setStatus('CALIBRATING RETRO RADAR...', '#ffee00');

    // Wait up to 3 seconds for Telegram to provide user data
    const tgUser = await waitForTelegramUser();
    if (tgUser) TG_USER = tgUser; // update module-level var

    const tid = TG_USER?.id;
    const hasWebApp = !!window.Telegram?.WebApp;
    const rawData   = window.Telegram?.WebApp?.initData || '';
    _setStatus(
      tid ? 'PILOT LINK ESTABLISHED' : (hasWebApp ? 'WAITING FOR PILOT LINK...' : 'COMM CHANNEL OFFLINE'),
      tid ? '#00ffcc' : '#ff4466'
    );
    console.log('[init] tg present:', hasWebApp, '| initData:', rawData.slice(0, 60), '| user:', TG_USER);

    if (!tid) {
      console.warn('[init] No Telegram user — going offline');
      this._goOffline(bar, label);
      return;
    }

    label.textContent = 'SYNCING HANGAR...';
    bar.style.width   = '40%';

    // Retry Supabase up to 5 times (handles cold-start / project waking up)
    let data = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        _setStatus(`SYNCING HANGAR DATA... (${attempt}/5)`, '#ffee00');
        data = await dbGetOrCreateUser(tid);
        break; // success
      } catch (e) {
        console.warn(`[init] DB attempt ${attempt} failed:`, e.message);
        if (attempt < 5) {
          _setStatus('RETRYING COMMS LINK...', '#ff9900');
          await this._sleep(2000);
        } else {
          _setStatus('HANGAR LINK LOST — OFFLINE MODE', '#ff4466');
          await this._sleep(2500);
          this._goOffline(bar, label);
          return;
        }
      }
    }

    try {
      bar.style.width = '85%';
      _setStatus(`WELCOME ${data.isNew ? 'PILOT' : data.user.nickname}`, '#00ffcc');

      this.userData = data.user;
      this._parseUpgrades(data.upgrades || []);

      if (data.user.multiplier_end && new Date(data.user.multiplier_end) > new Date()) {
        this.activeMultiplier = Number(data.user.multiplier_value);
        this._showMultiplierBanner();
      }

      bar.style.width   = '100%';
      label.textContent = 'READY FOR LAUNCH';
      await this._sleep(2500);
      document.getElementById('loading-screen').style.display = 'none';

      if (data.isNew) {
        // Check if we have a locally saved callsign — auto-restore it
        const savedCallsign = localStorage.getItem('meyaret_callsign');
        if (savedCallsign && savedCallsign !== 'ACE') {
          try {
            const updated = await dbSaveCallsign(tid, savedCallsign);
            this.userData = updated;
            this._loadMenu();
            this._showScreen('menu');
          } catch {
            // Callsign might be taken — show onboarding
            this._showScreen('onboarding');
          }
        } else {
          this._showScreen('onboarding');
        }
      } else {
        // Always sync localStorage with DB nickname
        localStorage.setItem('meyaret_callsign', data.user.nickname);
        this._loadMenu();
        this._showScreen('menu');
      }
      this.state = 'menu';

    } catch (err) {
      console.error('[init] Supabase error:', err.message);
      _setStatus(`DB ERROR: ${err.message}`.slice(0, 60), '#ff4466');
      await this._sleep(2500); // show error so user can read it
      this._goOffline(bar, label);
    }
  }

  _goOffline(bar, label) {
    OFFLINE_MODE = true;
    bar.style.width   = '100%';
    label.textContent = 'OFFLINE';
    const saved = localStorage.getItem('meyaret_callsign');
    this.userData = { ...DEMO_USER, nickname: saved || null };
    this._sleep(2500).then(() => {
      document.getElementById('loading-screen').style.display = 'none';
      if (!saved) {
        this._showScreen('onboarding');
      } else {
        this._loadMenu();
        this._showScreen('menu');
        const b = document.getElementById('multiplier-banner');
        b.textContent = 'OFFLINE — SCORES NOT SAVED';
        b.style.borderColor = 'var(--magenta)';
        b.style.color       = 'var(--magenta)';
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

    if (name === 'game') {
      this.canvas.style.display = 'block';
      if (this._isMobile()) document.getElementById('controls-overlay').classList.remove('hidden');
      SFX.startGameMusic();
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
    // Unlock audio context on first interaction (required by browsers)
    const unlockOnce = () => { SFX.unlock(); document.removeEventListener('touchstart', unlockOnce); document.removeEventListener('mousedown', unlockOnce); };
    document.addEventListener('touchstart', unlockOnce, { once: true });
    document.addEventListener('mousedown',  unlockOnce, { once: true });

    // Generic click sound for all buttons
    document.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') SFX.btnClick(); });

    // Onboarding confirm
    document.getElementById('callsign-confirm').addEventListener('click', () => this._submitCallsign());
    document.getElementById('callsign-input').addEventListener('keydown', e => { if (e.key === 'Enter') this._submitCallsign(); });

    // Main menu buttons
    document.getElementById('btn-play').addEventListener('click',  () => this._startGame());
    document.getElementById('btn-spin').addEventListener('click',  () => this._openSpin());
    document.getElementById('btn-store').addEventListener('click', () => this._openStore());
    document.getElementById('btn-arsenal').addEventListener('click', () => this._openArsenal());
    document.getElementById('btn-quit').addEventListener('click',  () => { if (tg) tg.close(); });
    document.getElementById('profile-btn').addEventListener('click', () => this._openProfile());
    document.getElementById('leaderboard-strip').addEventListener('click', () => this._showTop5Popup());

    // Mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      const applyVolumeUi = (mode) => {
        muteBtn.classList.toggle('low', mode === 'low');
        muteBtn.classList.toggle('muted', mode === 'mute');
        const icon = mode === 'high' ? '🔊' : mode === 'low' ? '♪' : '🔇';
        muteBtn.textContent = `${icon} ${mode.toUpperCase()}`;
        muteBtn.title = `Volume: ${mode}`;
      };
      applyVolumeUi(SFX.getVolumeMode());
      muteBtn.addEventListener('click', () => applyVolumeUi(SFX.cycleVolume()));
    }

    // Back buttons
    document.querySelectorAll('.back-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._loadMenu();
        this._showScreen('menu');
      });
    });

    // Profile
    document.getElementById('change-nick-btn').addEventListener('click', () => {
      document.getElementById('change-nick-area').classList.toggle('hidden');
    });
    document.getElementById('new-nick-confirm').addEventListener('click', () => this._changeNickname());

    // Spin
    document.getElementById('spin-btn').addEventListener('click', () => this._doSpin());
    document.getElementById('arsenal-open-store').addEventListener('click', () => this._openStore());

    // Store tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._lastStoreTab = btn.dataset.tab;
        this._renderStoreTab(btn.dataset.tab);
      });
    });

    // Game Over
    document.getElementById('go-play-again').addEventListener('click', () => this._startGame());
    document.getElementById('go-menu').addEventListener('click', () => { this._loadMenu(); this._showScreen('menu'); });
  }

  _bindInputs() {
    // Keyboard
    const kmap = { ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right',
                   ArrowUp:'up', KeyW:'up', Space:'fire', KeyF:'flare', ShiftLeft:'flare' };

    window.addEventListener('keydown', e => {
      const k = kmap[e.code];
      if (k) { this.keys[k] = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', e => {
      const k = kmap[e.code];
      if (k) this.keys[k] = false;
    });

    // ── Virtual Joystick ────────────────────────────────────────────────────────
    const joyBase = document.getElementById('vjoy-base');
    const joyKnob = document.getElementById('vjoy-knob');

    const applyJoy = (clientX, clientY) => {
      const rect = joyBase.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = clientX - cx;
      const dy   = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const maxR = rect.width / 2 - 6;
      const dead = maxR * 0.15;      // 15% deadzone

      const clampedD = Math.min(dist, maxR);
      const ang      = Math.atan2(dy, dx);
      joyKnob.style.transform =
        `translate(calc(-50% + ${Math.cos(ang) * clampedD}px), calc(-50% + ${Math.sin(ang) * clampedD}px))`;

      if (dist < dead) {
        // Inside deadzone — no movement
        this.keys.joyAngle  = null;
        this.keys.joyActive = false;
        this.keys.left      = false;
        this.keys.right     = false;
      } else {
        // 360° looking: ship faces joystick, thrust is controlled by THRUST button
        this.keys.joyAngle  = ang;          // angle in radians (Math.atan2)
        this.keys.joyActive = true;
        this.keys.left      = false;
        this.keys.right     = false;
      }
    };

    const resetJoy = () => {
      joyKnob.style.transform = 'translate(-50%, -50%)';
      this.keys.joyAngle  = null;
      this.keys.joyActive = false;
      this.keys.left      = false;
      this.keys.right     = false;
    };

    if (joyBase) {
      // Track the specific touch that owns the joystick so multi-touch works
      let joyTouchId = null;

      joyBase.addEventListener('touchstart', e => {
        e.preventDefault();
        if (joyTouchId !== null) return; // already tracking a touch
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        applyJoy(t.clientX, t.clientY);
      }, { passive: false });

      joyBase.addEventListener('touchmove', e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === joyTouchId) {
            applyJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            break;
          }
        }
      }, { passive: false });

      const endJoy = e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === joyTouchId) {
            joyTouchId = null;
            resetJoy();
            break;
          }
        }
      };
      joyBase.addEventListener('touchend',    endJoy, { passive: false });
      joyBase.addEventListener('touchcancel', endJoy, { passive: false });

      // Mouse fallback for desktop testing
      let joyDown = false;
      joyBase.addEventListener('mousedown',  e => { joyDown = true;  applyJoy(e.clientX, e.clientY); });
      joyBase.addEventListener('mousemove',  e => { if (joyDown) applyJoy(e.clientX, e.clientY); });
      joyBase.addEventListener('mouseup',    ()  => { joyDown = false; resetJoy(); });
      joyBase.addEventListener('mouseleave', ()  => { joyDown = false; resetJoy(); });
    }

    // ── Action Buttons ──────────────────────────────────────────────────────────
    const bindAction = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      let btnTouchId = null;
      el.addEventListener('touchstart', e => {
        e.preventDefault();
        if (btnTouchId !== null) return;
        btnTouchId = e.changedTouches[0].identifier;
        this.keys[key] = true;
      }, { passive: false });
      const endBtn = e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === btnTouchId) {
            btnTouchId = null;
            this.keys[key] = false;
            break;
          }
        }
      };
      el.addEventListener('touchend',    endBtn, { passive: false });
      el.addEventListener('touchcancel', endBtn, { passive: false });
      el.addEventListener('mousedown',  ()  => { this.keys[key] = true;  });
      el.addEventListener('mouseup',    ()  => { this.keys[key] = false; });
    };
    bindAction('ctrl-fire', 'fire');
    bindAction('ctrl-flare', 'flare');
    bindAction('ctrl-thrust', 'up');
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  async _submitCallsign() {
    const raw = document.getElementById('callsign-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('callsign-error');
    if (!raw || raw.length < 2) { errEl.textContent = 'MIN 2 CHARACTERS.'; return; }
    if (raw.length > 12)         { errEl.textContent = 'MAX 12 CHARACTERS.'; return; }

    // Always save locally first so the game remembers you even offline
    localStorage.setItem('meyaret_callsign', raw);

    if (OFFLINE_MODE) {
      this.userData = { ...DEMO_USER, nickname: raw };
      this._loadMenu();
      this._showScreen('menu');
      const banner = document.getElementById('multiplier-banner');
      banner.textContent = 'OFFLINE MODE — SCORES NOT SAVED';
      banner.style.borderColor = '#ff4466';
      banner.style.color = '#ff4466';
      banner.classList.remove('hidden');
      return;
    }

    errEl.textContent = 'CHECKING...';
    try {
      const { available, clean } = await dbCheckCallsign(raw);
      if (!available) { errEl.textContent = 'CALLSIGN TAKEN. CHOOSE ANOTHER.'; return; }

      const tid = String(TG_USER?.id || this.userData?.telegram_id);
      const updated = await dbSaveCallsign(tid, clean);
      localStorage.setItem('meyaret_callsign', updated.nickname);
      this.userData = updated;
      errEl.textContent = '';
      this._loadMenu();
      this._showScreen('menu');
    } catch(e) {
      // Supabase failed but localStorage saved — go to menu in offline mode
      OFFLINE_MODE = true;
      this.userData = { ...DEMO_USER, nickname: raw };
      this._loadMenu();
      this._showScreen('menu');
      const banner = document.getElementById('multiplier-banner');
      banner.textContent = 'OFFLINE — SCORES NOT SAVED';
      banner.style.borderColor = '#ff4466';
      banner.style.color = '#ff4466';
      banner.classList.remove('hidden');
    }
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  _loadMenu() {
    if (!this.userData) return;
    const nick = this.userData.nickname || localStorage.getItem('meyaret_callsign') || 'PILOT';
    document.getElementById('menu-nickname').textContent  = nick;
    document.getElementById('menu-trust-name').textContent = nick;
    const shmips = Number(this.userData.shmips || 0);
    document.getElementById('menu-shmips').textContent    = `${shmips % 1 === 0 ? shmips : shmips.toFixed(2)} $$`;
    this._loadLeaderboard();
  }

  async _loadLeaderboard() {
    try {
      const rows = await dbGetLeaderboard();
      const entries = rows
        .map((e, i) => `${i+1}.${e.nickname} ${Number(e.best_score).toLocaleString()}`)
        .join('  ·  ');
      document.getElementById('lb-entries').textContent = entries || '—';
    } catch { /* non-critical */ }
  }

  // ── Start Game ─────────────────────────────────────────────────────────────
  _startGame() {
    SFX.thrustStop();
    this._wasThrusting = false;
    this.score   = 0;
    this.level   = 1;
    this.tick    = 0;
    this.asteroids    = [];
    this.bullets      = [];
    this.enemyBullets = [];
    this.rockets      = [];
    this.particles    = [];
    this.redFighters  = [];
    this.yellowAliens = [];
    this.coins        = [];
    this.mysteryPickups = [];
    this.runShmipsBonus = 0;
    this.pickupSpawnTimer = 0;
    this.redFighterTimer  = 0;
    this.yellowAlienTimer = 0;

    // Build upgrade map for ship constructor
    const ups = {};
    if (this.upgrades.extra_life)  ups.extra_life  = this.upgrades.extra_life;
    if (this.upgrades.extra_flare) ups.extra_flare = this.upgrades.extra_flare;
    if (this.upgrades.laser)       ups.laser        = 1;
    if (this.upgrades.rapid_fire)  ups.rapid_fire   = 1;
    if (this.upgrades.shield)      ups.shield       = 1;

    // Plane upgrades
    if (this.upgrades.plane_stealth) { ups.plane_lives = 1; ups.plane_flares = 2; ups.plane_rapid = true; }
    if (this.upgrades.plane_titan)   { ups.plane_lives = 3; ups.plane_shield = true; ups.plane_laser = true; }
    if (this.upgrades.plane_phantom) { ups.plane_lives = 2; ups.plane_flares = 1; ups.plane_laser = true; }
    if (this.upgrades.plane_scout)   { ups.plane_lives = 1; ups.plane_flares = 0; ups.plane_rapid = true; }

    // Ship skin (order matters: later overrides if multiple owned)
    const skinColors = {
      ship_purple: '#bf5fff', ship_cyan: '#00ffff', ship_orange: '#ff6600',
      ship_pink: '#ff00cc', ship_red: '#ff2244', ship_blue: '#3388ff', ship_green: '#00ff88',
      ship_yellow: '#ffdd00', ship_white: '#eeeeff', ship_teal: '#00ddcc', ship_violet: '#9944ff',
      ship_coral: '#ff6644', ship_lime: '#aaff00', ship_gold: '#ffd700',
      ship_purple_gold: { color: '#bf5fff', accent: '#ffd700' },
      ship_green_purple: { color: '#00ff41', accent: '#bf5fff' },
      ship_rainbow: { color: '#ff0077', accent: '#00ffcc' },
    };
    for (const [key, val] of Object.entries(skinColors)) {
      if (this.upgrades[key]) {
        if (typeof val === 'string') ups.skin_color = val;
        else { ups.skin_color = val.color; ups.skin_accent = val.accent; }
        break;
      }
    }

    if (this.userData?.has_golden_plane) ups.golden_plane = true;

    this.ship = new Ship(this.W / 2, this.H / 2, ups);
    this._spawnAsteroids(this.level);
    this._showScreen('game');
  }

  _spawnAsteroids(level) {
    // Level 1: 2 slow asteroids. Each level adds 1 more, capped at 10.
    const count = Math.min(CFG.baseAsteroids + level - 1, 10);
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = rng(0, this.W); y = rng(0, this.H);
      } while (dist({ x, y }, { x: this.W / 2, y: this.H / 2 }) < 130);
      const roll = Math.random();
      const size =
        level <= 2 ? (roll < 0.7 ? 'medium' : 'small')
        : level <= 4 ? (roll < 0.3 ? 'large' : roll < 0.7 ? 'medium' : 'small')
        : (roll < 0.45 ? 'large' : roll < 0.8 ? 'medium' : 'small');
      this.asteroids.push(new Asteroid(x, y, size, null, level));
    }
  }

  _nextLevel() {
    this.level++;
    SFX.levelUp();
    this._spawnAsteroids(this.level);
  }

  // ── Main Loop ──────────────────────────────────────────────────────────────
  _loop(ts = performance.now()) {
    requestAnimationFrame((nextTs) => this._loop(nextTs));
    if (!this._lastFrameTs) this._lastFrameTs = ts;
    const frameMs = Math.min(48, ts - this._lastFrameTs);
    this._lastFrameTs = ts;
    this._accum += frameMs;

    if (this.state !== 'game') {
      if (this.state === 'menu' || this.state === 'profile' ||
          this.state === 'store' || this.state === 'spin' ||
          this.state === 'arsenal' || this.state === 'onboarding') {
        drawGrid(this.ctx, this.W, this.H, this.tick++);
      }
      return;
    }

    // Fixed timestep (60hz) so Android/iPhone behave the same.
    const step = 1000 / 60;
    while (this._accum >= step) {
      this.tick++;
      this._update();
      this._accum -= step;
    }
    this._draw();
  }

  _update() {
    if (!this.ship?.alive) return;

    // Input
    if (this.keys.fire)  this.ship.fire(this.bullets);
    if (this.keys.flare) {
      this.ship.useFlare(this.rockets, this.particles);
      this.keys.flare = false;
    }

    // Thrust sound
    if (this.keys.up && !this._wasThrusting) { SFX.thrustStart(); this._wasThrusting = true;  }
    if (!this.keys.up && this._wasThrusting)  { SFX.thrustStop();  this._wasThrusting = false; }

    this.ship.update(this.keys, this.W, this.H);

    // Spawn enemies
    const redInterval    = Math.max(750 - this.level * 25, 300);
    const yellowInterval = Math.max(1000 - this.level * 35, 400);

    this.redFighterTimer++;
    if (this.redFighterTimer > redInterval && this.level >= 5) {  // red fighters from level 5
      this.redFighterTimer = 0;
      if (this.redFighters.length < 1 + Math.floor(this.level / 4)) {
        const { x, y } = this._edgeSpawn();
        this.redFighters.push(new RedFighter(x, y));
      }
    }

    this.yellowAlienTimer++;
    if (this.yellowAlienTimer > yellowInterval && this.level >= 8) {  // yellow aliens from level 8
      this.yellowAlienTimer = 0;
      if (this.yellowAliens.length < 1 + Math.floor(this.level / 6)) {
        const { x, y } = this._edgeSpawn();
        this.yellowAliens.push(new YellowAlien(x, y));
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

    this.particles.forEach(p => p.update());
    this.particles = this.particles.filter(p => !p.dead);

    this.redFighters.forEach(rf => rf.update(this.ship, this.enemyBullets, this.W, this.H, this.particles));
    this.yellowAliens.forEach(ya => ya.update(this.rockets, this.W, this.H, this.particles));
    this.yellowAliens = this.yellowAliens.filter(ya => !ya.dead);

    this.coins.forEach(c => c.update());
    this.coins = this.coins.filter(c => !c.dead);
    this.mysteryPickups.forEach(m => m.update());
    this.mysteryPickups = this.mysteryPickups.filter(m => !m.dead);

    if (this.ship.tempLaserUntil > 0) this.ship.tempLaserUntil--;
    if (this.ship.tempRapidUntil > 0) this.ship.tempRapidUntil--;
    if (this.ship.tempPowerBoostUntil > 0) this.ship.tempPowerBoostUntil--;

    this.pickupSpawnTimer++;
    if (this.pickupSpawnTimer > 360 && this.coins.length === 0 && this.mysteryPickups.length === 0) {
      this.pickupSpawnTimer = 0;
      const x = rng(60, this.W - 60);
      const y = rng(60, this.H - 60);
      if (Math.random() < 0.6) {
        this.coins.push(new CoinPickup(x, y, this.W, this.H));
      } else {
        this.mysteryPickups.push(new MysteryPickup(x, y));
      }
    }

    this._collisions();

    if (this.asteroids.length === 0) this._nextLevel();
  }

  _edgeSpawn() {
    const side = rngInt(0, 3);
    const margin = 30;
    if (side === 0) return { x: rng(0, this.W), y: -margin };
    if (side === 1) return { x: this.W + margin, y: rng(0, this.H) };
    if (side === 2) return { x: rng(0, this.W), y: this.H + margin };
    return { x: -margin, y: rng(0, this.H) };
  }

  _collisions() {
    const ship = this.ship;

    // Ship vs coin
    for (let ci = this.coins.length - 1; ci >= 0; ci--) {
      if (dist(ship, this.coins[ci]) < ship.radius + this.coins[ci].radius) {
        this.runShmipsBonus += 1;
        SFX.shmipEarn();
        burst(this.particles, this.coins[ci].x, this.coins[ci].y, '#ffdd00', 8, 2, 20);
        this.coins.splice(ci, 1);
      }
    }

    // Ship vs mystery ?
    for (let mi = this.mysteryPickups.length - 1; mi >= 0; mi--) {
      if (dist(ship, this.mysteryPickups[mi]) < ship.radius + this.mysteryPickups[mi].radius) {
        const roll = Math.random();
        if (roll < 0.34) ship.tempRapidUntil = 900;       // 15 sec rapid fire
        else if (roll < 0.67) ship.tempLaserUntil = 1200; // 20 sec laser
        else ship.tempPowerBoostUntil = 1200;             // 20 sec 2x damage
        SFX.levelUp();
        burst(this.particles, this.mysteryPickups[mi].x, this.mysteryPickups[mi].y, '#aa00ff', 12, 3, 25);
        this.mysteryPickups.splice(mi, 1);
      }
    }

    // Player bullets vs asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (dist(b, a) < a.radius) {
          this.bullets.splice(bi, 1);
          const frags = a.split(this.particles);
          this.asteroids.splice(ai, 1, ...frags);
          const dmg = ship.tempPowerBoostUntil > 0 ? 2 : 1;
          this._addScore(a.score * dmg);
          break;
        }
      }
    }

    // Player bullets vs red fighters
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ei = this.redFighters.length - 1; ei >= 0; ei--) {
        if (dist(b, this.redFighters[ei]) < this.redFighters[ei].radius) {
          this.bullets.splice(bi, 1);
          if (this.redFighters[ei].hit(this.particles)) {
            burst(this.particles, this.redFighters[ei].x, this.redFighters[ei].y, C.enemyRed, 20, 5, 35);
            const dmg = ship.tempPowerBoostUntil > 0 ? 2 : 1;
            this._addScore(CFG.enemyRedScore * dmg);
            this.redFighters.splice(ei, 1);
          }
          break;
        }
      }
    }

    // Player bullets vs yellow aliens
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ei = this.yellowAliens.length - 1; ei >= 0; ei--) {
        if (dist(b, this.yellowAliens[ei]) < this.yellowAliens[ei].radius) {
          this.bullets.splice(bi, 1);
          if (this.yellowAliens[ei].hit(this.particles)) {
            burst(this.particles, this.yellowAliens[ei].x, this.yellowAliens[ei].y, C.enemyYellow, 20, 5, 35);
            const dmg = ship.tempPowerBoostUntil > 0 ? 2 : 1;
            this._addScore(CFG.enemyYellowScore * dmg);
            this.yellowAliens.splice(ei, 1);
          }
          break;
        }
      }
    }

    // Asteroids vs ship
    for (const a of this.asteroids) {
      if (dist(ship, a) < a.radius + ship.radius) {
        if (ship.hit(this.particles)) { this._gameOver(); return; }
      }
    }

    // Enemy bullets vs ship
    for (let ei = this.enemyBullets.length - 1; ei >= 0; ei--) {
      if (dist(this.enemyBullets[ei], ship) < ship.radius + this.enemyBullets[ei].radius) {
        this.enemyBullets.splice(ei, 1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
      }
    }

    // Rockets vs ship
    for (let ri = this.rockets.length - 1; ri >= 0; ri--) {
      if (dist(this.rockets[ri], ship) < ship.radius + this.rockets[ri].radius) {
        burst(this.particles, this.rockets[ri].x, this.rockets[ri].y, C.rocket, 12, 4);
        this.rockets.splice(ri, 1);
        if (ship.hit(this.particles)) { this._gameOver(); return; }
      }
    }

    // Rockets can be evaded by crashing them into asteroids
    for (let ri = this.rockets.length - 1; ri >= 0; ri--) {
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        if (dist(this.rockets[ri], this.asteroids[ai]) < this.asteroids[ai].radius + this.rockets[ri].radius) {
          burst(this.particles, this.rockets[ri].x, this.rockets[ri].y, C.rocket, 8, 3);
          this.rockets.splice(ri, 1);
          break;
        }
      }
    }

    // Red fighters vs ship (ram)
    for (const rf of this.redFighters) {
      if (dist(rf, ship) < rf.radius + ship.radius) {
        if (ship.hit(this.particles)) { this._gameOver(); return; }
      }
    }
  }

  _addScore(pts) {
    this.score += Math.floor(pts * this.activeMultiplier);
  }

  // ── Draw ───────────────────────────────────────────────────────────────────
  _draw() {
    const { ctx, W, H } = this;
    drawGrid(ctx, W, H, this.tick);

    this.particles.forEach(p => p.draw(ctx));
    this.coins.forEach(c => c.draw(ctx));
    this.mysteryPickups.forEach(m => m.draw(ctx));
    this.asteroids.forEach(a => a.draw(ctx));
    this.bullets.forEach(b => b.draw(ctx));
    this.enemyBullets.forEach(b => b.draw(ctx));
    this.rockets.forEach(r => r.draw(ctx));
    this.redFighters.forEach(rf => rf.draw(ctx));
    this.yellowAliens.forEach(ya => ya.draw(ctx));
    if (this.ship?.alive) this.ship.draw(ctx);

    drawHUD(ctx, W, {
      score:      this.score,
      level:      this.level,
      lives:      this.ship?.lives    ?? 0,
      maxLives:   this.ship?.maxLives ?? 3,
      flares:     this.ship?.flares   ?? 0,
      multiplier: this.activeMultiplier,
    });
  }

  // ── Game Over ──────────────────────────────────────────────────────────────
  async _gameOver() {
    this.ship.alive = false;
    SFX.thrustStop();
    SFX.gameOver();
    this._showScreen('gameover');

    const rawScore       = this.score;
    const effectiveScore = Math.floor(rawScore * this.activeMultiplier);
    const shmipsEarned   = (effectiveScore / 1000) + (this.runShmipsBonus || 0);

    document.getElementById('go-score').textContent  = `SCORE  ${effectiveScore.toLocaleString()}`;
    document.getElementById('go-shmips').textContent = `+${shmipsEarned.toFixed(2)} $$ EARNED`;

    const isNew = effectiveScore > (this.userData?.best_score || 0);
    document.getElementById('go-title').textContent = isNew ? 'NEW HIGH SCORE' : 'GAME OVER';
    // Delayed shmip/fanfare sounds
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
      } catch (e) { console.warn('[gameOver] score save failed:', e.message); }
    } else {
      this.userData.shmips     = (this.userData.shmips || 0) + shmipsEarned;
      this.userData.best_score = Math.max(this.userData.best_score || 0, effectiveScore);
    }

    try {
      const rows  = await dbGetLeaderboard();
      const lines = rows
        .map((e, i) => `${i+1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`)
        .join('\n');
      document.getElementById('go-leaderboard').innerHTML =
        `<pre style="font-size:8px;letter-spacing:1px;line-height:2.2">${lines}</pre>`;
    } catch { /* non-critical */ }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async _openProfile() {
    document.getElementById('prof-nick').textContent   = this.userData?.nickname || '—';
    document.getElementById('prof-shmips').textContent = (this.userData?.shmips || 0).toLocaleString();
    document.getElementById('prof-best').textContent   = (this.userData?.best_score || 0).toLocaleString();
    document.getElementById('prof-games').textContent  = (this.userData?.total_games || 0).toLocaleString();

    this._showScreen('profile');

    // Personal best list removed by request.
  }

  async _showTop5Popup() {
    const modal = document.getElementById('top5-modal');
    const entriesEl = document.getElementById('top5-entries');
    try {
      const rows = await dbGetLeaderboard();
      entriesEl.innerHTML = rows.length
        ? rows.map((e, i) => `${i + 1}. ${e.nickname}  ${Number(e.best_score).toLocaleString()}`).join('<br>')
        : 'NO SCORES YET';
    } catch {
      entriesEl.textContent = 'NO SCORES YET';
    }
    modal.classList.remove('hidden');
    document.getElementById('top5-close').onclick = () => modal.classList.add('hidden');
  }

  _openArsenal() {
    this._showScreen('arsenal');
    const hasTitan = !!this.upgrades.plane_titan;
    const hasStealth = !!this.upgrades.plane_stealth;
    const weapon = this.upgrades.laser ? 'LASER' : this.upgrades.rapid_fire ? 'RAPID FIRE' : 'BULLETS';
    const ability = this.upgrades.shield ? 'SHIELD' : this.upgrades.extra_flare ? 'EXTRA FLARE' : 'NONE';
    document.getElementById('ars-jet').textContent = hasTitan ? 'TITAN' : hasStealth ? 'STEALTH' : 'STARTER';
    document.getElementById('ars-weapon').textContent = weapon;
    document.getElementById('ars-ability').textContent = ability;
  }

  async _changeNickname() {
    const raw   = document.getElementById('new-nick-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('new-nick-error');
    if (!raw || raw.length < 2) { errEl.textContent = 'Min 2 characters.'; return; }

    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (!tid) { errEl.textContent = 'Not logged in.'; return; }

    try {
      if (raw !== this.userData?.nickname) {
        const { available } = await dbCheckCallsign(raw);
        if (!available) { errEl.textContent = 'CALLSIGN TAKEN.'; return; }
      }
      const updated = await dbSaveCallsign(tid, raw);
      this.userData = { ...this.userData, ...updated };
      localStorage.setItem('meyaret_callsign', updated.nickname);
      document.getElementById('prof-nick').textContent = updated.nickname;
      document.getElementById('change-nick-area').classList.add('hidden');
      errEl.textContent = '';
      this._loadMenu();
    } catch (err) { errEl.textContent = err.message || 'Error. Try again.'; }
  }

  // ── Daily Spin ─────────────────────────────────────────────────────────────
  async _openSpin() {
    this._showScreen('spin');
    this._wheelRot  = 0;
    this._wheelAnim = null;

    const spinCanvas = document.getElementById('spin-canvas');
    drawSpinWheel(spinCanvas, 0);

    let status = await apiFetch('/api/spin/status').catch(() => null);
    if (!status && TG_USER?.id) status = await dbSpinStatus(TG_USER.id).catch(() => null);
    const btn    = document.getElementById('spin-btn');
    const timer  = document.getElementById('spin-countdown');

    if (status?.available) {
      btn.disabled = false;
      btn.style.opacity = '1';
      timer.classList.add('hidden');
    } else if (status) {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      timer.classList.remove('hidden');
      this._startSpinCountdown(status.remainingMs, timer);
    }
  }

  _startSpinCountdown(ms, el) {
    const tick = () => {
      ms -= 1000;
      if (ms <= 0) { el.textContent = 'SPIN READY!'; el.style.color = 'var(--green)'; return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      el.textContent = `NEXT SPIN: ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      setTimeout(tick, 1000);
    };
    tick();
  }

  async _doSpin() {
    const btn        = document.getElementById('spin-btn');
    const result     = document.getElementById('spin-result');
    const spinCanvas = document.getElementById('spin-canvas');
    btn.disabled = true;
    result.classList.add('hidden');

    if (OFFLINE_MODE) {
      result.textContent = 'OFFLINE — SPIN REQUIRES CONNECTION';
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    const tid = TG_USER?.id || this.userData?.telegram_id;
    let data = null;
    try {
      data = await apiFetch('/api/spin', { method: 'POST' });
    } catch {
      if (tid) {
        try { data = await dbDoSpin(tid); } catch (e) {
          result.textContent = (e.message || 'SPIN FAILED').toUpperCase();
          result.classList.remove('hidden');
          btn.disabled = false;
          return;
        }
      } else {
        result.textContent = 'OPEN VIA TELEGRAM TO SPIN';
        result.classList.remove('hidden');
        btn.disabled = false;
        return;
      }
    }
    if (data?.error) {
      result.textContent = data.error.toUpperCase();
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }
    const reward = data?.reward;
    if (!reward) return;

    // Animate wheel to land on the ACTUAL reward (wheel display = reward received)
    const apiLabelMap = { '5 $$':0, '10 $$':1, '15 $$':2, '20 $$':3, '30 $$':4, '50 $$':5,
      '2x points (1h)':6, '2x pts (1h)':6, '2x 1h':6,
      '3x points (1h)':7, '3x pts (1h)':7, '3x 1h':7,
      'golden plane':8, 'gold':8, 'random upgrade':9, 'upgrd':9 };
    const norm = (s) => (s || '').toLowerCase().replace(/\s/g, ' ').trim();
    let segIdx = reward.segmentIndex;
    if (segIdx == null) {
      segIdx = SPIN_WHEEL_SEGMENTS.findIndex(s => norm(s.label) === norm(reward.label));
      if (segIdx < 0) segIdx = apiLabelMap[norm(reward.label)] ?? 0;
    }
    const n = SPIN_WHEEL_SEGMENTS.length;
    const targetSeg = segIdx >= 0 ? segIdx : 0;
    const finalRot = TAU * (6 + Math.random() * 4) - (targetSeg + 0.5) * (TAU / n);

    let gone = 0, rot = 0, speed = 0.04;
    let lastTickRot = 0;
    const tickEvery = TAU / n;
    await new Promise(resolve => {
      const frame = () => {
        gone += speed;
        rot += speed;
        if (gone < finalRot * 0.3) speed = Math.min(speed + 0.018, 0.42);
        else if (gone > finalRot * 0.7) speed = Math.max(speed * 0.975, 0.008);
        if (rot - lastTickRot >= tickEvery) { lastTickRot = rot; SFX.spinTick(); }
        drawSpinWheel(spinCanvas, rot);
        if (gone < finalRot || speed > 0.009) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    result.textContent = `YOU GOT: ${reward.label}!`;
    result.classList.remove('hidden');
    if (tid) {
      const me = await dbGetOrCreateUser(tid).catch(() => null);
      if (me) { this.userData = me.user; this._parseUpgrades(me.upgrades || []); }
    }
    this._loadMenu();

    // Spin is now locked — next open will show countdown
    btn.disabled = true;
    btn.style.opacity = '0.4';
    const timer = document.getElementById('spin-countdown');
    timer.classList.remove('hidden');
    this._startSpinCountdown(6 * 60 * 60 * 1000, timer);
  }

  // ── Store ──────────────────────────────────────────────────────────────────
  async _openStore() {
    this._showScreen('store');
    document.getElementById('store-balance').textContent =
      `BALANCE: ${(this.userData?.shmips || 0).toLocaleString()} $$`;
    this._catalog = CATALOG;
    // Restore last active tab (so re-opening store keeps your position)
    const activeTab = this._lastStoreTab || 'upgrade';
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === activeTab);
    });
    this._renderStoreTab(activeTab);
  }

  _renderStoreTab(category) {
    const grid = document.getElementById('store-items');
    grid.innerHTML = '';
    (this._catalog || [])
      .filter(item => item.category === category)
      .forEach(item => {
        const owned = this.upgrades[item.id] > 0;
        const el = document.createElement('div');
        el.className = 'store-item';
        el.innerHTML = `
          <div class="store-item-info">
            <div class="store-item-name">${item.icon || ''} ${item.name}</div>
            <div class="store-item-desc">${item.description}</div>
          </div>
          <span class="store-item-cost">${item.cost} $$</span>
          <button class="store-buy-btn${owned ? ' owned' : ''}" data-id="${item.id}">
            ${owned ? 'OWNED' : 'BUY'}
          </button>`;
        if (!owned) {
          el.querySelector('button').addEventListener('click', () => this._buyItem(item));
        }
        grid.appendChild(el);
      });
  }

  async _buyItem(item) {
    const msg = document.getElementById('store-msg');
    if (OFFLINE_MODE) {
      msg.textContent = 'OFFLINE — CONNECT VIA TELEGRAM TO PURCHASE.';
      msg.className = 'store-msg fail';
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
      return;
    }
    const tid = TG_USER?.id || this.userData?.telegram_id;
    if (!tid) { msg.textContent = 'NOT LOGGED IN.'; msg.className = 'store-msg fail'; msg.classList.remove('hidden'); return; }

    try {
      SFX.btnClick();
      const { newBalance } = await dbBuyItem(tid, item.id);
      this.userData.shmips = newBalance;
      this.upgrades[item.id] = (this.upgrades[item.id] || 0) + 1;
      document.getElementById('store-balance').textContent = `BALANCE: ${newBalance.toLocaleString()} $$`;
      msg.textContent = `${item.name} ACQUIRED!`;
      msg.className = 'store-msg success';
      msg.classList.remove('hidden');
      SFX.unlock && SFX.shmipEarn && SFX.shmipEarn();
      setTimeout(() => msg.classList.add('hidden'), 3000);
      this._renderStoreTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'upgrade');
    } catch(e) {
      msg.textContent = e.message || 'PURCHASE FAILED.';
      msg.className = 'store-msg fail';
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => { new Game(); });
