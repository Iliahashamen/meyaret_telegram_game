// ============================================================
// MEYARET — Procedural Audio Engine  (Web Audio API)
// All sounds are synthesized — zero audio files required.
// ============================================================

const _AudioCtx = window.AudioContext || window.webkitAudioContext;
let _ctx   = null;
let _master = null;

function _getCtx() {
  if (!_ctx) {
    _ctx    = new _AudioCtx();
    _master = _ctx.createGain();
    _master.gain.value = 0.7;
    _master.connect(_ctx.destination);
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function _now()  { return _getCtx().currentTime; }

// Create a gain node connected to master (or given dest)
function _gain(val, dest) {
  const g = _getCtx().createGain();
  g.gain.value = val;
  g.connect(dest || _master);
  return g;
}

// Create an oscillator connected to a node
function _osc(type, freq, dest) {
  const o = _getCtx().createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(dest);
  return o;
}

// Create a biquad filter connected to a node
function _filter(type, freq, dest) {
  const f = _getCtx().createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  if (dest) f.connect(dest);
  return f;
}

// White noise buffer source connected to a node
function _noise(duration, dest) {
  const c   = _getCtx();
  const len = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(dest);
  return src;
}

// ── Thrust loop state ─────────────────────────────────────────────────────────
let _thrustGain = null;
let _thrustOsc  = null;
let _thrustOn   = false;

// ── Public API ────────────────────────────────────────────────────────────────
export const SFX = {
  muted: false,

  // ── Player Bullet ─────────────────────────────────────────────────────────
  shoot() {
    if (this.muted) return;
    const t = _now();
    const g = _gain(0.16);
    const o = _osc('square', 880, g);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.frequency.setValueAtTime(900, t);
    o.frequency.linearRampToValueAtTime(420, t + 0.07);
    o.start(t); o.stop(t + 0.07);
  },

  // ── Laser beam ────────────────────────────────────────────────────────────
  laser() {
    if (this.muted) return;
    const t = _now();
    const g = _gain(0.18);
    const o = _osc('sawtooth', 1400, g);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.3);
    // Small sine undertone for body
    const g2 = _gain(0.08);
    const o2 = _osc('sine', 240, g2);
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.start(t); o.stop(t + 0.3);
    o2.start(t); o2.stop(t + 0.3);
  },

  // ── Asteroid split — large ────────────────────────────────────────────────
  explodeLarge() {
    if (this.muted) return;
    const t   = _now();
    // Low rumble
    const flt = _filter('lowpass', 280, _master);
    const g   = _gain(0.45, flt);
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    const ns = _noise(0.9, g);
    ns.start(t); ns.stop(t + 0.9);
    // Deep thud
    const g2 = _gain(0.3);
    const o  = _osc('sine', 75, g2);
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(18, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  },

  // ── Asteroid split — medium ───────────────────────────────────────────────
  explodeMed() {
    if (this.muted) return;
    const t   = _now();
    const flt = _filter('lowpass', 500, _master);
    const g   = _gain(0.3, flt);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const ns = _noise(0.5, g);
    ns.start(t); ns.stop(t + 0.5);
    const g2 = _gain(0.18);
    const o  = _osc('sine', 110, g2);
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  },

  // ── Asteroid split — small pop ────────────────────────────────────────────
  explodeSmall() {
    if (this.muted) return;
    const t   = _now();
    const flt = _filter('highpass', 800, _master);
    const g   = _gain(0.2, flt);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    const ns = _noise(0.18, g);
    ns.start(t); ns.stop(t + 0.18);
  },

  // ── Enemy destroyed (red fighter / yellow alien) ──────────────────────────
  enemyDie() {
    if (this.muted) return;
    const t  = _now();
    // Mid-range noise blast
    const flt = _filter('bandpass', 600, _master);
    flt.Q.value = 0.8;
    const g  = _gain(0.35, flt);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    const ns = _noise(0.6, g);
    ns.start(t); ns.stop(t + 0.6);
    // Descending tone
    const g2 = _gain(0.22);
    const o  = _osc('sawtooth', 440, g2);
    g2.gain.setValueAtTime(0.22, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.frequency.setValueAtTime(440, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
    o.start(t); o.stop(t + 0.4);
  },

  // ── Engine thrust (looping) ───────────────────────────────────────────────
  thrustStart() {
    if (this.muted || _thrustOn) return;
    _thrustOn = true;
    const c  = _getCtx();
    _thrustGain = _gain(0.0);
    _thrustGain.gain.setTargetAtTime(0.12, c.currentTime, 0.05);
    _thrustOsc  = _osc('sawtooth', 55, _thrustGain);
    // Add slight noise for texture
    const flt = _filter('lowpass', 200, _thrustGain);
    const ns  = c.createBufferSource();
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.4;
    ns.buffer = buf;
    ns.loop   = true;
    ns.connect(flt);
    flt.connect(_thrustGain);
    _thrustOsc.start();
    ns.start();
    // store noise source for stop
    _thrustGain._noiseNode = ns;
  },

  thrustStop() {
    if (!_thrustOn || !_thrustGain) return;
    _thrustOn = false;
    const t = _now();
    _thrustGain.gain.setTargetAtTime(0.0, t, 0.05);
    const stopAt = t + 0.3;
    _thrustOsc.stop(stopAt);
    if (_thrustGain._noiseNode) {
      try { _thrustGain._noiseNode.stop(stopAt); } catch (_) {}
    }
    _thrustOsc  = null;
    _thrustGain = null;
  },

  // ── Player hit (lose a life) ──────────────────────────────────────────────
  playerHit() {
    if (this.muted) return;
    const t = _now();
    // Noise blast
    const flt = _filter('lowpass', 800, _master);
    const g   = _gain(0.5, flt);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    const ns = _noise(0.7, g);
    ns.start(t); ns.stop(t + 0.7);
    // Descending wail
    const g2 = _gain(0.3);
    const o  = _osc('square', 660, g2);
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    o.frequency.setValueAtTime(660, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    o.start(t); o.stop(t + 0.8);
  },

  // ── Game over — dramatic ──────────────────────────────────────────────────
  gameOver() {
    if (this.muted) return;
    const t = _now();
    // Final explosion
    const flt = _filter('lowpass', 400, _master);
    const g   = _gain(0.6, flt);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    const ns = _noise(1.8, g);
    ns.start(t); ns.stop(t + 1.8);
    // Descending minor arpeggio  A4 → E4 → C4 → A3
    [[880, 0], [659, 0.25], [523, 0.5], [440, 0.8]].forEach(([freq, delay]) => {
      const gn = _gain(0.2);
      const o  = _osc('sine', freq, gn);
      const s = t + delay;
      gn.gain.setValueAtTime(0.2, s);
      gn.gain.exponentialRampToValueAtTime(0.001, s + 0.4);
      o.start(s); o.stop(s + 0.4);
    });
  },

  // ── Level up — ascending arpeggio ─────────────────────────────────────────
  levelUp() {
    if (this.muted) return;
    const t = _now();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const d = i * 0.1;
      const g = _gain(0.15);
      const o = _osc('triangle', freq, g);
      const s = t + d;
      g.gain.setValueAtTime(0.15, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.2);
      o.start(s); o.stop(s + 0.2);
    });
  },

  // ── Enemy fires ───────────────────────────────────────────────────────────
  enemyShoot() {
    if (this.muted) return;
    const t = _now();
    const g = _gain(0.1);
    const o = _osc('square', 400, g);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.frequency.setValueAtTime(400, t);
    o.frequency.linearRampToValueAtTime(200, t + 0.1);
    o.start(t); o.stop(t + 0.1);
  },

  // ── Rocket launch (alien) ─────────────────────────────────────────────────
  rocketLaunch() {
    if (this.muted) return;
    const t   = _now();
    const flt = _filter('bandpass', 900, _master);
    flt.Q.value = 1.5;
    const g   = _gain(0.18, flt);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    const ns = _noise(0.25, g);
    ns.start(t); ns.stop(t + 0.25);
    const g2 = _gain(0.12);
    const o  = _osc('sawtooth', 300, g2);
    g2.gain.setValueAtTime(0.12, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.frequency.setValueAtTime(300, t);
    o.frequency.linearRampToValueAtTime(600, t + 0.3);
    o.start(t); o.stop(t + 0.3);
  },

  // ── Flare deploy — whoosh ─────────────────────────────────────────────────
  flare() {
    if (this.muted) return;
    const t   = _now();
    const flt = _filter('bandpass', 1200, _master);
    flt.Q.value = 0.5;
    const g   = _gain(0.3, flt);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    const ns = _noise(0.5, g);
    ns.start(t); ns.stop(t + 0.5);
    const g2 = _gain(0.12);
    const o  = _osc('sine', 200, g2);
    g2.gain.setValueAtTime(0.12, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(600, t + 0.45);
    o.start(t); o.stop(t + 0.45);
  },

  // ── Spin wheel tick ───────────────────────────────────────────────────────
  spinTick() {
    if (this.muted) return;
    const t = _now();
    const g = _gain(0.12);
    const o = _osc('square', 600, g);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    o.start(t); o.stop(t + 0.04);
  },

  // ── Shmip earned (coin chime) ─────────────────────────────────────────────
  shmipEarn() {
    if (this.muted) return;
    const t = _now();
    [1047, 1319, 1568].forEach((freq, i) => {
      const d = i * 0.07;
      const g = _gain(0.18);
      const o = _osc('sine', freq, g);
      const s = t + d;
      g.gain.setValueAtTime(0.18, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
      o.start(s); o.stop(s + 0.25);
    });
  },

  // ── New high score fanfare ────────────────────────────────────────────────
  highScore() {
    if (this.muted) return;
    const t = _now();
    // C5 E5 G5 C6
    [523, 659, 784, 1047].forEach((freq, i) => {
      const d = i * 0.12;
      const g = _gain(0.2);
      const o = _osc('triangle', freq, g);
      const s = t + d;
      g.gain.setValueAtTime(0.2, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
      o.start(s); o.stop(s + 0.3);
    });
  },

  // ── UI button click ───────────────────────────────────────────────────────
  btnClick() {
    if (this.muted) return;
    const t = _now();
    const g = _gain(0.1);
    const o = _osc('sine', 720, g);
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.start(t); o.stop(t + 0.06);
  },

  // ── Mute toggle ───────────────────────────────────────────────────────────
  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && _thrustOn) this.thrustStop();
    // Persist preference
    try { localStorage.setItem('meyaret_muted', this.muted ? '1' : '0'); } catch (_) {}
    return this.muted;
  },

  // Call once on first user interaction to unlock AudioContext on mobile
  unlock() {
    _getCtx();
  },
};

// Restore mute preference
try {
  if (localStorage.getItem('meyaret_muted') === '1') SFX.muted = true;
} catch (_) {}
