// ============================================================
// MEYARET — Full Game Engine
// Asteroids-style physics, Synthwave aesthetics
// ============================================================

// ── Telegram WebApp Init ──────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); tg.disableVerticalSwipes?.(); }
const TG_USER = tg?.initDataUnsafe?.user || null;
const INIT_DATA = tg?.initData || '';

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
  bg:       '#050510',
  grid:     '#003318',
  gridLine: '#00ff4133',
  ship:     '#00ff41',
  bullet:   '#00ff41',
  laser:    '#ff00cc',
  asteroid: '#bf5fff',
  asteroidFill: '#0a0018',
  enemyRed:  '#ff3333',
  enemyYellow: '#ffdd00',
  rocket:   '#ffdd00',
  flare:    '#ff6600',
  particle: '#ffffff',
  golden:   '#ffd700',
  hud:      '#00ff41',
  hudSub:   '#4a8a5a',
};

// ── Config ────────────────────────────────────────────────────────────────────
const CFG = {
  rotSpeed:     0.030,
  thrustPower:  0.11,
  friction:     0.991,
  bulletSpeed:  6,
  bulletLife:   65,
  laserLife:    25,
  rocketSpeed:  2.6,
  flareRadius:  85,
  asteroidSizes: { large: 42, medium: 21, small: 10 },
  asteroidScores: { large: 20, medium: 50, small: 100 },
  enemyRedScore:    200,
  enemyYellowScore: 150,
  maxBullets:   6,
  respawnMs:    2400,
  invincibleMs: 3000,
  baseAsteroids: 4,
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
  }

  update(keys, W, H) {
    if (this.invincible) {
      this.invTimer--;
      this.blinkTimer++;
      if (this.invTimer <= 0) this.invincible = false;
    }

    if (keys.left)   this.angle -= CFG.rotSpeed;
    if (keys.right)  this.angle += CFG.rotSpeed;
    this.thrusting = keys.up;
    if (keys.up) {
      this.vx += Math.cos(this.angle) * CFG.thrustPower;
      this.vy += Math.sin(this.angle) * CFG.thrustPower;
      const spd = Math.hypot(this.vx, this.vy);
      const max = this.golden ? 9 : 6;
      if (spd > max) { this.vx = (this.vx / spd) * max; this.vy = (this.vy / spd) * max; }
    }
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

  fire(bullets) {
    if (!this.canFire()) return;
    this.fireCooldown = this.fireRate;
    const nose = { x: this.x + Math.cos(this.angle) * 16, y: this.y + Math.sin(this.angle) * 16 };
    if (this.hasLaser) {
      bullets.push(new Laser(nose.x, nose.y, this.angle));
    } else {
      bullets.push(new Bullet(nose.x, nose.y, this.angle, this.golden));
    }
  }

  useFlare(rockets, particles) {
    if (this.flares <= 0) return;
    this.flares--;
    // Destroy nearby rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      if (dist(this, rockets[i]) < CFG.flareRadius) {
        burst(particles, rockets[i].x, rockets[i].y, C.flare, 10, 4);
        rockets.splice(i, 1);
      }
    }
  }

  hit(particles) {
    if (this.invincible) return false;
    if (this.shieldUp)   { this.shieldUp = false; this.invincible = true; this.invTimer = 60; return false; }
    burst(particles, this.x, this.y, this.golden ? C.golden : this.color, 20, 4, 40);
    this.lives--;
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
  constructor(x, y, size = 'large', angle = null) {
    this.x = x; this.y = y;
    this.size = size;
    this.radius = CFG.asteroidSizes[size];
    const spd = size === 'large' ? rng(0.25, 0.55) : size === 'medium' ? rng(0.45, 0.9) : rng(0.7, 1.4);
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
    if (this.size === 'large')  return [new Asteroid(this.x, this.y, 'medium'), new Asteroid(this.x, this.y, 'medium')];
    if (this.size === 'medium') return [new Asteroid(this.x, this.y, 'small'),  new Asteroid(this.x, this.y, 'small')];
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
    this.shootRate  = 90;
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
    this.shootTimer = 0;
    this.shootRate  = 120;
    this.health = 2;
    this.radius = 16;
    this.bobTimer = 0;
  }

  update(bullets, W, H, particles) {
    this.bobTimer++;
    this.x = wrap(this.x + this.vx, 0, W);
    this.y = wrap(this.y + this.vy, 0, H);
    // Bounce off edges (soft)
    if (this.x < 60 || this.x > W - 60) this.vx *= -1;
    if (this.y < 60 || this.y > H - 60) this.vy *= -1;

    this.shootTimer++;
    if (this.shootTimer >= this.shootRate) {
      this.shootTimer = 0;
      // Fire rocket in random direction
      const ang = rng(0, TAU);
      const nose = { x: this.x + Math.cos(ang) * 20, y: this.y + Math.sin(ang) * 20 };
      bullets.push(new Rocket(nose.x, nose.y, ang));
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.bobTimer * 0.04) * 4);

    glow(ctx, C.enemyYellow, 16);
    ctx.strokeStyle = C.enemyYellow;
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
      ctx.fillStyle = on ? C.enemyYellow : '#555500';
      ctx.beginPath(); ctx.arc(lx, 1, 2, 0, TAU); ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  hit(particles) {
    burst(particles, this.x, this.y, C.enemyYellow, 8, 3, 20);
    this.health--;
    return this.health <= 0;
  }
}

// ── Enemy Bullet ──────────────────────────────────────────────────────────────
class EnemyBullet {
  constructor(x, y, angle, color = '#ff3333') {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * 5.5;
    this.vy = Math.sin(angle) * 5.5;
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
const STARS = Array.from({ length: 40 }, (_, i) => ({
  x:     (i * 197 + 83)  % 1000,
  y:     (i * 311 + 149) % 1000,
  r:     i % 9 === 0 ? 1.4 : 0.7,
  phase: i * 0.41,
}));

function drawGrid(ctx, W, H, tick) {
  ctx.clearRect(0, 0, W, H);

  // Pure black — as close to the original CRT as possible
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  // Very subtle, sparse stars — mostly white, almost invisible
  for (const s of STARS) {
    const sx      = (s.x / 1000) * W;
    const sy      = (s.y / 1000) * H;
    const twinkle = Math.sin(tick * 0.012 + s.phase) * 0.3 + 0.7;

    ctx.globalAlpha = twinkle * (s.r > 1 ? 0.55 : 0.35);
    ctx.fillStyle   = '#ffffff';
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur  = 0;
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function drawHUD(ctx, W, { score, level, lives, maxLives, flares, multiplier }) {
  ctx.font = '13px "Courier New", monospace';
  ctx.textAlign = 'left';

  glow(ctx, C.hud, 8);
  ctx.fillStyle = C.hud;
  // Score as plain whole number, big and clear
  ctx.fillText(`SCORE  ${score.toLocaleString()}`, 14, 24);
  ctx.fillText(`LEVEL  ${level}`, 14, 42);

  // Lives as small ship triangles
  ctx.fillText('LIVES  ', 14, 60);
  for (let i = 0; i < maxLives; i++) {
    const lx = 78 + i * 16;
    const ly = 60;
    ctx.fillStyle   = i < lives ? C.hud : '#1a1a2a';
    ctx.shadowBlur  = i < lives ? 8 : 0;
    ctx.shadowColor = C.hud;
    ctx.beginPath();
    ctx.moveTo(lx + 5, ly - 8); ctx.lineTo(lx + 10, ly); ctx.lineTo(lx, ly);
    ctx.closePath(); ctx.fill();
  }

  // Flares
  ctx.fillStyle = '#ff6600';
  glow(ctx, '#ff6600', 8);
  ctx.fillText(`FLARES ${flares}`, 14, 80);

  // Multiplier top-right only if active
  if (multiplier > 1) {
    ctx.fillStyle = '#ffdd00';
    glow(ctx, '#ffdd00', 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${multiplier}x BONUS`, W - 14, 24);
    ctx.textAlign = 'left';
  }

  ctx.shadowBlur = 0;
}

// ── Spin Wheel ────────────────────────────────────────────────────────────────
const WHEEL_SEGMENTS = [
  { label: '15 ⬡',        color: '#00ff41' },
  { label: '20 ⬡',        color: '#00cc33' },
  { label: '2× PTS',      color: '#bf5fff' },
  { label: '3× PTS',      color: '#ffdd00' },
  { label: 'GOLDEN PLANE', color: '#ffd700' },
  { label: 'UPGRADE',     color: '#ff6600' },
];

function drawSpinWheel(canvas, rotation) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, r = W / 2 - 8;
  ctx.clearRect(0, 0, W, H);
  const n = WHEEL_SEGMENTS.length;

  WHEEL_SEGMENTS.forEach((seg, i) => {
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
    this.keys = { left: false, right: false, up: false, fire: false, flare: false };

    this._bindInputs();
    this._bindUI();
    this._init();

    requestAnimationFrame(() => this._loop());
  }

  resize() {
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W;
    this.canvas.height = this.H;
  }

  // ── Init: load user, then show menu or onboarding ──────────────────────────
  async _init() {
    const bar = document.getElementById('loading-bar');
    bar.style.width = '30%';

    try {
      const data = await apiFetch('/api/users/me');
      bar.style.width = '80%';
      this.userData = data.user;
      this._parseUpgrades(data.upgrades || []);

      // Check active multiplier
      if (data.user.multiplier_end && new Date(data.user.multiplier_end) > new Date()) {
        this.activeMultiplier = Number(data.user.multiplier_value);
        this._showMultiplierBanner();
      }

      bar.style.width = '100%';
      await this._sleep(400);

      document.getElementById('loading-screen').style.display = 'none';

      if (data.isNew) {
        this._showScreen('onboarding');
      } else {
        this._loadMenu();
        this._showScreen('menu');
      }

    } catch (err) {
      console.warn('[init] Backend unreachable — starting in demo mode:', err.message);
      OFFLINE_MODE = true;
      bar.style.width = '100%';
      const savedCallsign = localStorage.getItem('meyaret_callsign');
      this.userData = { ...DEMO_USER, nickname: savedCallsign || null };
      await this._sleep(400);
      document.getElementById('loading-screen').style.display = 'none';

      if (!savedCallsign) {
        // No callsign yet — show onboarding even in offline mode
        this._showScreen('onboarding');
      } else {
        this._loadMenu();
        this._showScreen('menu');
        const banner = document.getElementById('multiplier-banner');
        banner.textContent = 'OFFLINE MODE — SCORES NOT SAVED';
        banner.style.borderColor = '#ff4466';
        banner.style.color = '#ff4466';
        banner.classList.remove('hidden');
      }
    }

    this.state = 'menu';
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
    ['onboarding','menu','profile','spin','store','gameover'].forEach(s => {
      const el = document.getElementById(`${s}-screen`);
      if (el) el.classList.add('hidden');
    });
    this.canvas.style.display = 'none';
    document.getElementById('controls-overlay').classList.add('hidden');

    if (name === 'game') {
      this.canvas.style.display = 'block';
      if (this._isMobile()) document.getElementById('controls-overlay').classList.remove('hidden');
    } else {
      const el = document.getElementById(`${name}-screen`);
      if (el) el.classList.remove('hidden');
    }
    this.state = name;
  }

  _isMobile() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  // ── UI Binding ─────────────────────────────────────────────────────────────
  _bindUI() {
    // Onboarding confirm
    document.getElementById('callsign-confirm').addEventListener('click', () => this._submitCallsign());
    document.getElementById('callsign-input').addEventListener('keydown', e => { if (e.key === 'Enter') this._submitCallsign(); });

    // Main menu buttons
    document.getElementById('btn-play').addEventListener('click',  () => this._startGame());
    document.getElementById('btn-spin').addEventListener('click',  () => this._openSpin());
    document.getElementById('btn-store').addEventListener('click', () => this._openStore());
    document.getElementById('btn-quit').addEventListener('click',  () => { if (tg) tg.close(); });
    document.getElementById('profile-btn').addEventListener('click', () => this._openProfile());

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

    // Store tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
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
      const rect  = joyBase.getBoundingClientRect();
      const cx    = rect.left + rect.width  / 2;
      const cy    = rect.top  + rect.height / 2;
      const dx    = clientX - cx;
      const dy    = clientY - cy;
      const maxR  = rect.width / 2 - 6;
      const d     = Math.min(Math.hypot(dx, dy), maxR);
      const ang   = Math.atan2(dy, dx);
      const kx    = Math.cos(ang) * d;
      const ky    = Math.sin(ang) * d;

      joyKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

      // Directional thresholds: 25% of radius for rotation, 20% for thrust
      const rotDead = maxR * 0.22;
      const thrDead = maxR * 0.18;
      this.keys.left  = dx < -rotDead;
      this.keys.right = dx >  rotDead;
      // Thrust: upper half of joystick — negative dy = upward
      this.keys.up    = dy < -thrDead;
    };

    const resetJoy = () => {
      joyKnob.style.transform = 'translate(-50%, -50%)';
      this.keys.left  = false;
      this.keys.right = false;
      this.keys.up    = false;
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
    bindAction('ctrl-fire',  'fire');
    bindAction('ctrl-flare', 'flare');
  }

  // ── Onboarding ─────────────────────────────────────────────────────────────
  async _submitCallsign() {
    const raw = document.getElementById('callsign-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('callsign-error');
    if (!raw || raw.length < 2) { errEl.textContent = 'MIN 2 CHARACTERS.'; return; }
    if (raw.length > 12)         { errEl.textContent = 'MAX 12 CHARACTERS.'; return; }

    // Always save locally first
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

    try {
      const data = await apiFetch('/api/users/me/nickname', { method: 'PATCH', body: { nickname: raw } });
      if (data.error) { errEl.textContent = data.error; return; }
      this.userData = data.user;
      this._loadMenu();
      this._showScreen('menu');
    } catch {
      // API failed but we have localStorage — proceed offline
      OFFLINE_MODE = true;
      this.userData = { ...DEMO_USER, nickname: raw };
      this._loadMenu();
      this._showScreen('menu');
    }
  }

  // ── Menu ───────────────────────────────────────────────────────────────────
  _loadMenu() {
    if (!this.userData) return;
    const nick = this.userData.nickname || localStorage.getItem('meyaret_callsign') || 'PILOT';
    document.getElementById('menu-nickname').textContent  = nick;
    document.getElementById('menu-trust-name').textContent = nick;
    const shmips = Number(this.userData.shmips || 0);
    document.getElementById('menu-shmips').textContent    = `${shmips % 1 === 0 ? shmips : shmips.toFixed(2)} ⬡`;
    this._loadLeaderboard();
  }

  async _loadLeaderboard() {
    try {
      const data = await apiFetch('/api/scores/leaderboard');
      const entries = (data.leaderboard || [])
        .map((e, i) => `${i+1}.${e.nickname} ${e.best_score.toLocaleString()}`)
        .join('  ·  ');
      document.getElementById('lb-entries').textContent = entries || '—';
    } catch { /* non-critical */ }
  }

  // ── Start Game ─────────────────────────────────────────────────────────────
  _startGame() {
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

    // Ship skin
    const skinColors = {
      ship_purple: '#bf5fff', ship_cyan: '#00ffff', ship_orange: '#ff6600',
      ship_pink: '#ff00cc',   ship_gold: '#ffd700',
      ship_purple_gold: { color: '#bf5fff', accent: '#ffd700' },
      ship_green_purple: { color: '#00ff41', accent: '#bf5fff' },
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
    const count = CFG.baseAsteroids + level - 1;
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = rng(0, this.W); y = rng(0, this.H);
      } while (dist({ x, y }, { x: this.W / 2, y: this.H / 2 }) < 120);
      this.asteroids.push(new Asteroid(x, y, 'large'));
    }
  }

  _nextLevel() {
    this.level++;
    this._spawnAsteroids(this.level);
  }

  // ── Main Loop ──────────────────────────────────────────────────────────────
  _loop() {
    requestAnimationFrame(() => this._loop());

    if (this.state !== 'game') {
      if (this.state === 'menu' || this.state === 'profile' ||
          this.state === 'store' || this.state === 'spin'   ||
          this.state === 'onboarding') {
        // Draw animated grid behind screens
        drawGrid(this.ctx, this.W, this.H, this.tick++);
      }
      return;
    }

    this.tick++;
    this._update();
    this._draw();
  }

  _update() {
    if (!this.ship?.alive) return;

    // Input
    if (this.keys.fire)  this.ship.fire(this.bullets);
    if (this.keys.flare) {
      this.ship.useFlare(this.rockets, this.particles);
      this.keys.flare = false; // consume single press
    }

    this.ship.update(this.keys, this.W, this.H);

    // Spawn enemies
    const redInterval    = Math.max(600 - this.level * 30, 250);
    const yellowInterval = Math.max(900 - this.level * 40, 350);

    this.redFighterTimer++;
    if (this.redFighterTimer > redInterval && this.level >= 2) {
      this.redFighterTimer = 0;
      if (this.redFighters.length < 2 + Math.floor(this.level / 3)) {
        const { x, y } = this._edgeSpawn();
        this.redFighters.push(new RedFighter(x, y));
      }
    }

    this.yellowAlienTimer++;
    if (this.yellowAlienTimer > yellowInterval && this.level >= 3) {
      this.yellowAlienTimer = 0;
      if (this.yellowAliens.length < 1 + Math.floor(this.level / 5)) {
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

    // Player bullets vs asteroids
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (let ai = this.asteroids.length - 1; ai >= 0; ai--) {
        const a = this.asteroids[ai];
        if (dist(b, a) < a.radius) {
          this.bullets.splice(bi, 1);
          const frags = a.split(this.particles);
          this.asteroids.splice(ai, 1, ...frags);
          this._addScore(a.score);
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
            this._addScore(CFG.enemyRedScore);
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
            this._addScore(CFG.enemyYellowScore);
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
    this._showScreen('gameover');

    const rawScore       = this.score;
    const effectiveScore = Math.floor(rawScore * this.activeMultiplier);
    const shmipsEarned   = (effectiveScore / 1000);

    document.getElementById('go-score').textContent  = `SCORE  ${effectiveScore.toLocaleString()}`;
    document.getElementById('go-shmips').textContent = `+${shmipsEarned.toFixed(2)} ⬡  SHMIPS EARNED`;

    const isNew = effectiveScore > (this.userData?.best_score || 0);
    document.getElementById('go-title').textContent = isNew ? '✦ NEW HIGH SCORE ✦' : 'GAME OVER';

    if (!OFFLINE_MODE) {
      try {
        const result = await apiFetch('/api/scores', {
          method: 'POST',
          body: { score: rawScore, level: this.level },
        });
        if (result.totalShmips !== undefined) {
          this.userData.shmips     = result.totalShmips;
          this.userData.best_score = result.newBestScore;
        }
      } catch { /* save failed silently */ }
    } else {
      // Demo mode: track locally
      this.userData.shmips     = (this.userData.shmips || 0) + shmipsEarned;
      this.userData.best_score = Math.max(this.userData.best_score || 0, effectiveScore);
    }

    try {
      const lb = await apiFetch('/api/scores/leaderboard');
      const lines = (lb.leaderboard || [])
        .map((e, i) => `${i+1}. ${e.nickname}  ${e.best_score.toLocaleString()}`)
        .join('\n');
      document.getElementById('go-leaderboard').innerHTML =
        `<pre style="font-size:11px;color:#4a8a5a;letter-spacing:1px">${lines}</pre>`;
    } catch { /* non-critical */ }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  async _openProfile() {
    document.getElementById('prof-nick').textContent   = this.userData?.nickname || '—';
    document.getElementById('prof-shmips').textContent = (this.userData?.shmips || 0).toLocaleString();
    document.getElementById('prof-best').textContent   = (this.userData?.best_score || 0).toLocaleString();
    document.getElementById('prof-games').textContent  = (this.userData?.total_games || 0).toLocaleString();

    this._showScreen('profile');

    try {
      const data = await apiFetch('/api/scores/me');
      const list = document.getElementById('prof-scores-list');
      list.innerHTML = '';
      (data.scores || []).forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        row.innerHTML = `<span>${i+1}. ${s.score.toLocaleString()} pts  Lvl ${s.level}</span><span>+${s.shmips_earned} ⬡</span>`;
        list.appendChild(row);
      });
    } catch { /* non-critical */ }
  }

  async _changeNickname() {
    const raw = document.getElementById('new-nick-input').value.trim().toUpperCase().replace(/[^A-Z0-9_]/g,'');
    const errEl = document.getElementById('new-nick-error');
    if (!raw || raw.length < 2) { errEl.textContent = 'Min 2 characters.'; return; }

    try {
      const data = await apiFetch('/api/users/me/nickname', { method: 'PATCH', body: { nickname: raw } });
      if (data.error) { errEl.textContent = data.error; return; }
      this.userData = data.user;
      document.getElementById('prof-nick').textContent = data.user.nickname;
      document.getElementById('change-nick-area').classList.add('hidden');
      errEl.textContent = '';
      this._loadMenu();
    } catch { errEl.textContent = 'Error. Try again.'; }
  }

  // ── Daily Spin ─────────────────────────────────────────────────────────────
  async _openSpin() {
    this._showScreen('spin');
    this._wheelRot  = 0;
    this._wheelAnim = null;

    const spinCanvas = document.getElementById('spin-canvas');
    drawSpinWheel(spinCanvas, 0);

    const status = await apiFetch('/api/spin/status').catch(() => null);
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

    // Always animate the wheel first, regardless of online/offline
    const totalRot = TAU * (5 + Math.random() * 5);
    let gone = 0, rot = 0, speed = 0.04;

    await new Promise(resolve => {
      const frame = () => {
        gone  += speed;
        rot   += speed;
        // Ease in then ease out
        if (gone < totalRot * 0.3)      speed = Math.min(speed + 0.018, 0.42);
        else if (gone > totalRot * 0.7) speed = Math.max(speed * 0.975, 0.008);
        drawSpinWheel(spinCanvas, rot);
        if (gone < totalRot || speed > 0.009) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

    // Now handle online/offline result
    if (OFFLINE_MODE) {
      result.textContent = 'OFFLINE — SPIN REQUIRES CONNECTION';
      result.classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    try {
      const data = await apiFetch('/api/spin', { method: 'POST' });
      if (data.error) {
        result.textContent = data.error.toUpperCase();
        result.classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      result.textContent = `YOU GOT: ${data.reward.label}!`;
      result.classList.remove('hidden');

      // Refresh user data
      const me = await apiFetch('/api/users/me');
      this.userData = me.user;
      this._parseUpgrades(me.upgrades || []);
      this._loadMenu();
    } catch (err) {
      result.textContent = 'CONNECTION ERROR — TRY AGAIN';
      result.classList.remove('hidden');
      console.error('[spin]', err.message);
      btn.disabled = false;
    }
  }

  // ── Store ──────────────────────────────────────────────────────────────────
  async _openStore() {
    this._showScreen('store');
    document.getElementById('store-balance').textContent =
      `BALANCE: ${(this.userData?.shmips || 0).toLocaleString()} ⬡`;

    try {
      const data = await apiFetch('/api/store/catalog');
      this._catalog = data.catalog || [];
    } catch { this._catalog = []; }

    this._renderStoreTab('upgrade');
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
          <span class="store-item-cost">${item.cost} ⬡</span>
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
    try {
      const data = await apiFetch('/api/store/buy', { method: 'POST', body: { itemId: item.id } });
      if (data.error) {
        msg.textContent = data.error;
        msg.className = 'store-msg fail';
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 3000);
        return;
      }
      this.userData.shmips = data.newBalance;
      this.upgrades[item.id] = (this.upgrades[item.id] || 0) + 1;
      document.getElementById('store-balance').textContent = `BALANCE: ${data.newBalance.toLocaleString()} ⬡`;
      msg.textContent = `${item.name} ACQUIRED!`;
      msg.className = 'store-msg success';
      msg.classList.remove('hidden');
      setTimeout(() => msg.classList.add('hidden'), 3000);
      // Re-render to mark owned
      this._renderStoreTab(document.querySelector('.tab-btn.active')?.dataset.tab || 'upgrade');
    } catch {
      msg.textContent = 'Purchase failed. Try again.';
      msg.className = 'store-msg fail';
      msg.classList.remove('hidden');
    }
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => { new Game(); });
