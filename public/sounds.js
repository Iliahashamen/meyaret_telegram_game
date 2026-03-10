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
    const target = mode === 'high' ? 0.7 : mode === 'low' ? 0.32 : 0.0;
    _master.gain.setTargetAtTime(target, c.currentTime, 0.02);
    try { localStorage.setItem('meyaret_volume_mode', mode); } catch (_) {}
  },

  getVolumeMode() {
    return _volumeMode;
  },

  cycleVolume() {
    const next = _volumeMode === 'high' ? 'low' : _volumeMode === 'low' ? 'mute' : 'high';
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
    _thrustGain = _gain(0.0);
    _thrustGain.gain.setTargetAtTime(0.04, c.currentTime, 0.12);
    const flt = _filter('lowpass', 100, _thrustGain);
    const ns = c.createBufferSource();
    const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.08;
    ns.buffer = buf;
    ns.loop = true;
    ns.connect(flt);
    flt.connect(_thrustGain);
    ns.start();
    _thrustOsc = null;
    _thrustGain._noiseNode = ns;
  },

  thrustStop() {
    if (!_thrustOn || !_thrustGain) return;
    _thrustOn = false;
    const t = _now();
    _thrustGain.gain.setTargetAtTime(0.0, t, 0.05);
    const stopAt = t + 0.3;
    if (_thrustGain._noiseNode) {
      try { _thrustGain._noiseNode.stop(stopAt); } catch (_) {}
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

  startMenuMusic() {
    if (this.muted || _musicMode === 'menu') return;
    _stopMusicLoop();
    _musicMode = 'menu';
    const a = [330,311,294,277,311,330,294,262,247,277,294,330,311,277,262,247,262,294,277,247,220,208,247,262,294,277,247,220,196,220];
    const b = [220,247,262,294,330,349,330,294,311,330,370,392,370,349,330,294,311,330,370,392,415,392,370,349,330,294,277,262,247,262];
    const c = [196,185,208,220,233,196,185,175,196,208,220,185,175,165,175,165,185,196,220,233,247,220,196,185,175,165,156,175,185,196];
    const melody = [...a, ...b, ...c];
    const padR = [165,165,165,165,165,165,165,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147,147];
    const padB = [175,175,175,175,175,185,185,185,185,185,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196,196];
    const padC = [147,147,147,156,156,156,156,139,139,139,139,131,131,131,131,131,131,131,131,131,131,131,131,131,131,131,131,131,131,131];
    const pad = [...padR, ...padB, ...padC];
    const bassA = [82,82,82,82,82,82,82,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73,73];
    const bassBs = [87,87,87,87,87,92,92,92,92,92,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98,98];
    const bassCs = [73,73,73,78,78,78,78,69,69,69,69,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65];
    const bass = [...bassA, ...bassBs, ...bassCs];
    let i = 0;
    _musicTimer = setInterval(() => {
      if (this.muted || _musicMode !== 'menu') return;
      const t = _now();
      const idx = i % melody.length;
      _playTone(melody[idx], t, 0.38, 'triangle', 0.032);
      _playTone(pad[idx % pad.length], t, 0.45, 'sine', 0.016);
      _playTone(bass[idx % bass.length], t, 0.45, 'sine', 0.012);
      // Funky hi-hat percussion on every 2nd beat
      if (i % 2 === 0) {
        const hg = _gain(0.02);
        const hf = _filter('highpass', 6000, hg);
        const hn = _noise(0.04, hf);
        hf.connect(hg);
        hn.start(t); hn.stop(t + 0.04);
      }
      // Synth stab on every 4th beat
      if (i % 4 === 0) {
        _playTone(melody[idx] * 2, t + 0.02, 0.08, 'square', 0.012);
      }
      i++;
    }, 420);
  },

  // Level-based music — starts calm (lv1) and escalates to chaos (lv20)
  startGameMusic(level = 1) {
    if (this.muted) return;
    const tier = level <= 4 ? 1 : level <= 8 ? 2 : level <= 12 ? 3 : level <= 16 ? 4 : 5;
    const newMode = `game_${tier}`;
    if (_musicMode === newMode) return;   // already playing this tier
    _stopMusicLoop();
    _musicMode = newMode;

    // ── Note sequences per tier ─────────────────────────────────────────────
    // Tier 1 (L1-4): Calm space drift, minimal
    const T1_BASS = [82,82,87,82,78,73,78,82,87,82,78,73,69,73,78,82,87,92,87,82];
    // Tier 2 (L5-8): Building — more movement
    const T2_BASS = [98,98,104,110,98,87,98,104,110,117,104,98,87,98,110,123,117,110,98,87];
    // Tier 3 (L9-12): Medium intensity — syncopated
    const T3_BASS = [110,117,123,110,98,104,110,123,117,110,98,92,87,98,110,123,130,123,110,98];
    // Tier 4 (L13-16): High intensity — funk groove
    const T4_BASS = [110,110,123,98,110,82,98,110,123,146,110,98,82,110,123,98,82,73,98,110,117,131,147,131,117,110,98,87,98,110];
    // Tier 5 (L17-20): Chaos — fast aggressive riff
    const T5_BASS = [147,139,131,147,156,147,139,131,139,147,156,165,156,147,139,131,123,131,139,147,156,165,175,165,156,147,139,131,123,110];

    const BASS_MAP = [null, T1_BASS, T2_BASS, T3_BASS, T4_BASS, T5_BASS];
    const bass = BASS_MAP[tier];

    // Tempo per tier (ms per note)
    const TEMPO = [null, 340, 310, 285, 265, 240];
    const tempo = TEMPO[tier];

    let i = 0;
    _musicTimer = setInterval(() => {
      if (this.muted || _musicMode !== newMode) return;
      const t = _now();
      const root = bass[i % bass.length];

      // Bass note — sawtooth, gets louder with tier
      const bassVol = 0.018 + tier * 0.006;
      _playTone(root, t, 0.2, 'sawtooth', bassVol);

      // Octave accent — triangle
      if (tier >= 2) _playTone(root * 2, t + 0.02, 0.08, 'triangle', 0.010 + tier * 0.003);

      // Kick drum — from tier 2
      if (tier >= 2) {
        const kg = _gain(0.02 + tier * 0.008);
        const ko = _osc('sine', 80, kg);
        kg.gain.setValueAtTime(0.02 + tier * 0.008, t);
        kg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        ko.frequency.setValueAtTime(80, t);
        ko.frequency.exponentialRampToValueAtTime(25, t + 0.1);
        ko.start(t); ko.stop(t + 0.12);
      }

      // Hi-hat — from tier 2, density increases
      const hatEvery = tier >= 4 ? 1 : 2;
      if (tier >= 2 && i % hatEvery === 1) {
        const hg = _gain(0.008 + tier * 0.003);
        const hf = _filter('highpass', 7000, hg);
        const hn = _noise(0.03, hf);
        hf.connect(hg);
        hn.start(t + 0.04); hn.stop(t + 0.07);
      }

      // Open hi-hat / crash on bar downbeats — from tier 3
      if (tier >= 3 && i % 8 === 0) {
        const cg = _gain(0.012 + tier * 0.003);
        const cf = _filter('highpass', 4000, cg);
        const cn = _noise(0.25, cf);
        cf.connect(cg);
        cn.start(t); cn.stop(t + 0.25);
      }

      // Synth arp accent — from tier 3
      if (tier >= 3 && i % 3 === 0) {
        _playTone(root * 3, t + 0.05, 0.05, 'square', 0.006 + tier * 0.002);
      }

      // Harmonic fill — from tier 4
      if (tier >= 4 && i % 4 === 2) {
        _playTone(root * 1.5, t + 0.04, 0.12, 'sine', 0.009);
      }

      // Distorted synth hits — tier 5 only
      if (tier >= 5 && i % 2 === 0) {
        _playTone(root * 4, t + 0.01, 0.04, 'square', 0.007);
        _playTone(root * 0.5, t + 0.08, 0.04, 'sawtooth', 0.012);
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
  if (saved === 'high' || saved === 'low' || saved === 'mute') {
    SFX._applyVolumeMode(saved);
  } else if (localStorage.getItem('meyaret_muted') === '1') {
    SFX._applyVolumeMode('mute');
  }
} catch (_) {}
