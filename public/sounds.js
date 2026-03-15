// ============================================================
// MEYARET — Procedural Audio Engine  (Web Audio API)
// All sounds are synthesized — zero audio files required.
// ============================================================

const _AudioCtx = window.AudioContext || window.webkitAudioContext;
let _ctx   = null;
let _master = null;
let _volumeMode = 'high'; // high | low | mute

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
let _musicTimer = null;
let _musicMode = null;

function _stopMusicLoop() {
  if (_musicTimer) clearInterval(_musicTimer);
  _musicTimer = null;
  _musicMode = null;
}

function _playTone(freq, start, dur, type = 'triangle', vol = 0.07) {
  const g = _gain(vol);
  const o = _osc(type, freq, g);
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.001, start + dur);
  o.start(start);
  o.stop(start + dur);
}

// ── Public API ────────────────────────────────────────────────────────────────
export const SFX = {
  muted: false,

  _applyVolumeMode(mode) {
    _volumeMode = mode;
    this.muted = mode === 'mute';
    const c = _getCtx();
    const target = mode === 'high' ? 0.7 : mode === 'med' ? 0.5 : mode === 'low' ? 0.32 : 0.0;
    _master.gain.setTargetAtTime(target, c.currentTime, 0.02);
    try { localStorage.setItem('meyaret_volume_mode', mode); } catch (_) {}
  },

  getVolumeMode() {
    return _volumeMode;
  },

  cycleVolume() {
    const next = _volumeMode === 'high' ? 'med' : _volumeMode === 'med' ? 'low' : _volumeMode === 'low' ? 'mute' : 'high';
    this._applyVolumeMode(next);
    if (next !== 'mute') this.btnClick();
    return next;
  },

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

  // ── XForce activate — godly laser beam ─────────────────────────────────────
  xforceActivate() {
    if (this.muted) return;
    const t = _now();
    const dur = 0.5;
    // Low rumble foundation
    const gLow = _gain(0.25);
    const oLow = _osc('sine', 80, gLow);
    gLow.gain.setValueAtTime(0, t);
    gLow.gain.linearRampToValueAtTime(0.25, t + 0.02);
    gLow.gain.exponentialRampToValueAtTime(0.001, t + dur);
    oLow.frequency.setValueAtTime(80, t);
    oLow.frequency.linearRampToValueAtTime(45, t + dur);
    oLow.start(t); oLow.stop(t + dur);
    // Main laser sweep — dramatic
    const gMain = _gain(0.22);
    const oMain = _osc('sawtooth', 2200, gMain);
    gMain.gain.setValueAtTime(0, t);
    gMain.gain.linearRampToValueAtTime(0.22, t + 0.01);
    gMain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    oMain.frequency.setValueAtTime(2200, t);
    oMain.frequency.exponentialRampToValueAtTime(180, t + dur);
    oMain.start(t); oMain.stop(t + dur);
    // High shimmer — divine overtone
    const gHi = _gain(0.12);
    const oHi = _osc('sine', 1760, gHi);
    gHi.gain.setValueAtTime(0.12, t);
    gHi.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    oHi.frequency.setValueAtTime(1760, t);
    oHi.frequency.linearRampToValueAtTime(1320, t + dur * 0.5);
    oHi.start(t); oHi.stop(t + dur);
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

  // ── Engine thrust (looping) — soft whoosh via filtered noise ────────────────
  thrustStart() {
    if (this.muted || _thrustOn) return;
    _thrustOn = true;
    const c = _getCtx();
    const t = c.currentTime;

    _thrustGain = _gain(0.0);
    _thrustGain.gain.setTargetAtTime(0.055, t, 0.18); // gentle fade-in

    // Pink-ish noise buffer (less harsh than white noise)
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d   = buf.getChannelData(0);
    let b0=0,b1=0,b2=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      d[i] = (b0 + b1 + b2 + w*0.0556) * 0.11; // pink noise
    }
    const ns = c.createBufferSource();
    ns.buffer = buf; ns.loop = true;

    // Bandpass — gives the "whoosh" body around 300 Hz
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.7;

    // Low shelf for warmth
    const ls = c.createBiquadFilter();
    ls.type = 'lowshelf'; ls.frequency.value = 160; ls.gain.value = 6;

    ns.connect(bp); bp.connect(ls); ls.connect(_thrustGain);

    // Very slow LFO wobbles the bandpass freq so it never sounds static
    const lfo = c.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.18;
    const lfoG = c.createGain(); lfoG.gain.value = 55;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    lfo.start(t);

    ns.start(t);
    _thrustOsc = null;
    _thrustGain._noiseNode = ns;
    _thrustGain._lfo = lfo;
  },

  thrustStop() {
    if (!_thrustOn || !_thrustGain) return;
    _thrustOn = false;
    const t = _now();
    _thrustGain.gain.setTargetAtTime(0.0, t, 0.09); // slightly slower fade-out
    const stopAt = t + 0.5;
    if (_thrustGain._noiseNode) {
      try { _thrustGain._noiseNode.stop(stopAt); } catch (_) {}
    }
    if (_thrustGain._lfo) {
      try { _thrustGain._lfo.stop(stopAt); } catch (_) {}
    }
    if (_thrustOsc) {
      try { _thrustOsc.stop(stopAt); } catch (_) {}
    }
    _thrustOsc = null;
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

  // ── Coin pickup — bright chime ──────────────────────────────────────────────
  coinPickup() {
    if (this.muted) return;
    const t = _now();
    [1568, 2093].forEach((freq, i) => {
      const d = i * 0.06;
      const g = _gain(0.15);
      const o = _osc('sine', freq, g);
      const s = t + d;
      g.gain.setValueAtTime(0.15, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.15);
      o.start(s); o.stop(s + 0.15);
    });
  },

  // ── Mystery pickup — ascending chord ──────────────────────────────────────
  mysteryPickup() {
    if (this.muted) return;
    const t = _now();
    [330, 415, 523, 659].forEach((freq, i) => {
      const d = i * 0.08;
      const g = _gain(0.12);
      const o = _osc('triangle', freq, g);
      const s = t + d;
      g.gain.setValueAtTime(0.12, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
      o.start(s); o.stop(s + 0.3);
    });
  },

  // ── Shield break — glass shatter ─────────────────────────────────────────
  shieldBreak() {
    if (this.muted) return;
    const t = _now();
    const flt = _filter('highpass', 1200, _master);
    const g = _gain(0.22, flt);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    const ns = _noise(0.45, g);
    ns.start(t); ns.stop(t + 0.45);
    const g2 = _gain(0.08);
    const o = _osc('square', 2200, g2);
    g2.gain.setValueAtTime(0.08, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.start(t); o.stop(t + 0.15);
  },

  // ── Player rocket launch ──────────────────────────────────────────────────
  rocketFire() {
    if (this.muted) return;
    const t = _now();
    const flt = _filter('bandpass', 600, _master);
    flt.Q.value = 1.0;
    const g = _gain(0.2, flt);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    const ns = _noise(0.35, g);
    ns.start(t); ns.stop(t + 0.35);
    const g2 = _gain(0.15);
    const o = _osc('sawtooth', 200, g2);
    g2.gain.setValueAtTime(0.15, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.frequency.setValueAtTime(200, t);
    o.frequency.linearRampToValueAtTime(800, t + 0.25);
    o.start(t); o.stop(t + 0.25);
  },

  // ── Rocket self-destruct explosion ────────────────────────────────────────
  rocketExplode() {
    if (this.muted) return;
    const t = _now();
    const flt = _filter('lowpass', 350, _master);
    const g = _gain(0.25, flt);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const ns = _noise(0.4, g);
    ns.start(t); ns.stop(t + 0.4);
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
    const next = this.muted ? 'high' : 'mute';
    this._applyVolumeMode(next);
    if (this.muted && _thrustOn) this.thrustStop();
    return this.muted;
  },

  // Call once on first user interaction to unlock AudioContext on mobile
  unlock() {
    _getCtx();
  },

  // ── Opening theme — loops until menu opens (stopOpeningMusic) ───────────────
  startOpeningMusic() {
    if (this.muted || _musicMode === 'opening') return;
    _stopMusicLoop();
    _musicMode = 'opening';
    const ARPS = [
      [392, 523, 659, 784, 523, 659, 392, 349],
      [330, 440, 554, 659, 440, 554, 330, 294],
      [349, 466, 587, 698, 523, 698, 392, 349],
      [294, 392, 494, 587, 392, 494, 294, 262],
    ];
    const arp = ARPS[Math.floor(Math.random() * ARPS.length)];
    const tempo = 200;
    let i = 0;
    _musicTimer = setInterval(() => {
      if (this.muted || _musicMode !== 'opening') return;
      const t = _now();
      const note = arp[i % arp.length];
      _playTone(note, t, 0.2, 'square', 0.05);
      _playTone(note * 0.5, t, 0.28, 'sine', 0.03);
      _playTone(note * 2, t + 0.02, 0.08, 'triangle', 0.02);
      if (i % 2 === 0) {
        const hg = _gain(0.02);
        const hf = _filter('highpass', 5000, hg);
        const hn = _noise(0.03, hf);
        hf.connect(hg);
        hn.start(t); hn.stop(t + 0.03);
      }
      i++;
    }, tempo);
  },

  stopOpeningMusic() {
    if (_musicMode === 'opening') {
      _stopMusicLoop();
      _musicMode = null;
    }
  },

  startMenuMusic() {
    if (this.muted || _musicMode === 'menu') return;
    _stopMusicLoop();
    _musicMode = 'menu';
    const VARIANTS = [
      { m: [330,311,294,277,311,330,294,262,247,277,294,330,311,277,262,247,262,294,277,247,220,208,247,262,294,277,247,220,196,220,220,247,262,294,330,349,330,294,311,330,370,392,370,349,330,294,311,330,370,392,415,392,370,349,330,294,277,262,247,262], p: [165,147,156], b: [82,73,87,73,98,87,73] },
      { m: [277,294,311,330,294,277,262,247,262,277,294,311,330,349,330,311,294,277,262,247,220,247,262,277,294,311,294,277,262,247], p: [185,196,175,165], b: [73,82,87,82,73,69,78,82] },
      { m: [392,370,349,330,349,370,392,415,392,370,349,330,311,294,277,262,247,262,277,294,311,330,349,330,311,294,277,262,247,220], p: [208,220,196,185], b: [98,87,82,87,98,92,87,82] },
      { m: [262,294,330,349,330,294,262,247,220,247,262,294,330,349,392,370,349,330,294,262,247,262,294,330,349,330,294,262,247,220], p: [147,156,139,131], b: [65,73,78,73,65,69,73] },
    ];
    const v = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    const tempo = 380 + Math.floor(Math.random() * 60);
    let i = 0;
    _musicTimer = setInterval(() => {
      if (this.muted || _musicMode !== 'menu') return;
      const t = _now();
      const idx = i % v.m.length;
      _playTone(v.m[idx], t, 0.36, 'triangle', 0.028);
      _playTone(v.p[idx % v.p.length], t, 0.42, 'sine', 0.014);
      _playTone(v.b[idx % v.b.length], t, 0.42, 'sine', 0.011);
      if (i % 2 === 0) {
        const hg = _gain(0.018);
        const hf = _filter('highpass', 6000, hg);
        const hn = _noise(0.038, hf);
        hf.connect(hg);
        hn.start(t); hn.stop(t + 0.038);
      }
      if (i % 4 === 0) {
        _playTone(v.m[idx] * 2, t + 0.02, 0.07, 'square', 0.01);
      }
      if (i % 8 === 0) {
        _playTone(v.m[idx] * 1.5, t + 0.04, 0.15, 'sine', 0.008);
      }
      i++;
    }, tempo);
  },

  // Level-based music — starts calm (lv1) and escalates to chaos (lv20)
  startGameMusic(level = 1) {
    if (this.muted) return;
    const tier = level <= 5 ? 1 : level <= 10 ? 2 : level <= 15 ? 3 : level <= 20 ? 4 : 5;
    const newMode = `game_${tier}`;
    if (_musicMode === newMode) return;   // already playing this tier
    _stopMusicLoop();
    _musicMode = newMode;

    // ── 80s Synthwave — wide variant pool per tier ─────────────────────────────
    const T1_BASS = [
      [82,82,87,82,78,73,78,82,87,92,87,82,78,73,69,73,78,82,87,92],
      [73,78,82,87,78,73,69,73,78,87,82,78,73,69,65,69,73,78,82,87],
      [87,82,78,73,78,82,87,92,87,82,78,73,78,82,87,78,73,69,73,78],
      [82,87,92,87,82,78,73,78,82,87,82,78,73,69,73,78,82,87,92,87],
      [69,73,78,82,78,73,69,65,69,73,78,82,87,82,78,73,69,73,78,82],
      [78,73,69,73,78,82,87,92,87,82,78,73,69,73,78,82,87,82,78,73],
    ];
    const T2_BASS = [
      [98,98,104,110,98,87,98,104,110,117,104,98,87,98,110,123,117,110,98,87],
      [87,92,98,104,98,92,87,98,104,110,104,98,92,87,98,110,104,98,92,87],
      [104,98,92,87,98,104,110,117,110,104,98,92,98,104,117,110,104,98,92,87],
      [110,104,98,104,110,117,104,98,110,117,123,117,110,104,98,104,110,117,123,117],
      [92,98,104,110,98,92,87,92,98,104,110,104,98,92,87,98,104,110,117,110],
    ];
    const T3_BASS = [
      [110,117,123,110,98,104,110,123,117,110,98,92,87,98,110,123,130,123,110,98],
      [98,104,110,117,110,104,98,110,117,123,117,110,104,98,110,117,123,117,110,104],
      [117,110,104,98,104,110,117,123,117,110,104,98,110,117,123,110,104,98,110,117],
      [104,110,117,123,110,104,98,104,110,117,123,117,110,104,98,110,117,123,130,123],
      [123,117,110,117,123,130,117,110,123,130,139,130,123,117,110,117,123,130,139,130],
      [110,104,98,104,110,117,104,98,110,117,123,110,104,98,104,110,117,123,117,110],
    ];
    const T4_BASS = [
      [110,110,123,98,110,82,98,110,123,146,110,98,82,110,123,98,82,73,98,110,117,131,147,131,117,110,98,87,98,110],
      [98,110,123,110,98,87,98,110,123,110,98,87,98,110,117,104,98,87,98,110,123,131,123,110,98,87,98,110,117,110],
      [123,110,98,110,123,131,110,98,110,123,147,123,110,98,123,110,98,110,123,131,147,123,110,98,110,123,131,123,110,98],
      [110,123,131,123,110,98,110,123,147,123,110,98,110,123,131,110,98,110,123,147,131,123,110,98,123,131,147,131,123,110],
      [98,87,98,110,123,131,110,98,110,123,110,98,87,98,110,123,110,98,87,98,110,117,123,110,98,87,98,110,117,110],
    ];
    const T5_BASS = [
      [147,139,131,147,156,147,139,131,139,147,156,165,156,147,139,131,123,131,139,147,156,165,175,165,156,147,139,131,123,110],
      [131,139,147,156,147,139,131,147,156,165,156,147,139,131,147,156,165,156,147,139,131,139,147,156,165,175,165,156,147,139],
      [156,147,139,147,156,165,147,139,147,156,175,165,156,147,156,165,175,165,156,147,139,147,156,165,175,165,156,147,139,131],
      [139,131,139,147,156,165,147,139,147,156,147,139,131,139,147,156,165,156,147,139,131,147,156,165,175,165,156,147,139,131],
      [147,156,165,156,147,139,131,139,147,156,165,175,165,156,147,139,131,139,147,156,165,156,147,139,131,147,156,165,175,165],
    ];

    const BASS_POOL = [null, T1_BASS, T2_BASS, T3_BASS, T4_BASS, T5_BASS];
    const pool = BASS_POOL[tier];
    const bass = pool[Math.floor(Math.random() * pool.length)];

    // Synthwave arpeggio layers — root-based, 80s feel
    const ARP_UP = (r) => [r, r*1.25, r*1.5, r*2];
    const ARP_DOWN = (r) => [r*2, r*1.5, r*1.25, r];
    const ARP_V = [
      (r,i) => ARP_UP(r)[i % 4],
      (r,i) => ARP_DOWN(r)[i % 4],
      (r,i) => (i % 2 ? r * 1.5 : r),
      (r,i) => (i % 4 < 2 ? r : r * 2),
    ];
    const arpFn = ARP_V[Math.floor(Math.random() * ARP_V.length)];

    // Tempo — slight variation for feel
    const TEMPO = [null, 340, 310, 285, 265, 240];
    const tempo = TEMPO[tier] + Math.floor(Math.random() * 20) - 10;

    let i = 0;
    _musicTimer = setInterval(() => {
      if (this.muted || _musicMode !== newMode) return;
      const t = _now();
      const root = bass[i % bass.length];
      const bassVol = 0.018 + tier * 0.006;

      // Deep sawtooth bass — classic 80s
      _playTone(root, t, 0.22, 'sawtooth', bassVol);

      // Sub layer — sine for weight
      _playTone(root * 0.5, t, 0.2, 'sine', 0.012);

      // Octave stab — punch
      if (tier >= 2) _playTone(root * 2, t + 0.02, 0.07, 'triangle', 0.009 + tier * 0.0025);

      // Synthwave arp — shimmer
      if (tier >= 2) {
        const arpNote = arpFn(root, i);
        _playTone(arpNote, t + 0.03, 0.1, 'square', 0.005 + tier * 0.002);
      }

      // Lush pad stab — every 4 beats
      if (tier >= 2 && i % 4 === 0) {
        _playTone(root * 1.5, t + 0.05, 0.25, 'sine', 0.006);
        _playTone(root * 2.5, t + 0.06, 0.2, 'sine', 0.004);
      }

      // Kick — 80s punch
      if (tier >= 2) {
        const kg = _gain(0.022 + tier * 0.007);
        const ko = _osc('sine', 85, kg);
        kg.gain.setValueAtTime(0.022 + tier * 0.007, t);
        kg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        ko.frequency.setValueAtTime(85, t);
        ko.frequency.exponentialRampToValueAtTime(22, t + 0.09);
        ko.start(t); ko.stop(t + 0.11);
      }

      // Gated-style hi-hat — 80s drum machine
      const hatEvery = tier >= 4 ? 1 : 2;
      if (tier >= 2 && i % hatEvery === 1) {
        const hg = _gain(0.007 + tier * 0.003);
        const hf = _filter('highpass', 7200, hg);
        const hn = _noise(0.028, hf);
        hf.connect(hg);
        hn.start(t + 0.035); hn.stop(t + 0.065);
      }

      // Crash / open hat — bar downbeat
      if (tier >= 3 && i % 8 === 0) {
        const cg = _gain(0.011 + tier * 0.0025);
        const cf = _filter('highpass', 3800, cg);
        const cn = _noise(0.22, cf);
        cf.connect(cg);
        cn.start(t); cn.stop(t + 0.22);
      }

      // Brass stab — tier 3+
      if (tier >= 3 && i % 4 === 2) {
        _playTone(root * 3, t + 0.04, 0.06, 'square', 0.006 + tier * 0.0015);
        _playTone(root * 2, t + 0.05, 0.04, 'sawtooth', 0.004);
      }

      // Harmonic pad fill — tier 4
      if (tier >= 4 && i % 8 === 4) {
        _playTone(root * 1.25, t + 0.06, 0.18, 'sine', 0.007);
        _playTone(root * 2.25, t + 0.08, 0.12, 'triangle', 0.005);
      }

      // Chaos layer — tier 5
      if (tier >= 5 && i % 2 === 0) {
        _playTone(root * 4, t + 0.01, 0.035, 'square', 0.006);
        _playTone(root * 0.5, t + 0.07, 0.038, 'sawtooth', 0.011);
      }

      i++;
    }, tempo);
  },

  stopMusic() {
    _stopMusicLoop();
  },
};

// Restore mute preference
try {
  const saved = localStorage.getItem('meyaret_volume_mode');
  if (saved === 'high' || saved === 'med' || saved === 'low' || saved === 'mute') {
    SFX._applyVolumeMode(saved);
  } else if (localStorage.getItem('meyaret_muted') === '1') {
    SFX._applyVolumeMode('mute');
  }
} catch (_) {}
