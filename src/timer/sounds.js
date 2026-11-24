/**
 * Loud, synthesized alert sounds on the Web Audio API. No asset files.
 *
 * Everything runs through one chain: sound → master volume → compressor → speakers.
 * The compressor lets the sounds sit near full scale without clipping, which is
 * what makes them carry over music and through a pocket.
 */

export const SOUND_CHOICES = [
  { id: 'bell', name: 'Boxing bell' },
  { id: 'horn', name: 'Air horn' },
  { id: 'double', name: 'Double beep' },
  { id: 'whistle', name: 'Whistle' },
  { id: 'buzzer', name: 'Buzzer' },
  { id: 'chime', name: 'Chime' },
  { id: 'classic', name: 'Classic (soft)' },
  { id: 'none', name: 'No sound' },
];

export const SOUND_IDS = SOUND_CHOICES.map((sound) => sound.id);

function env(ctx, out, t, { attack = 0.004, peak = 0.8, decay = 0.5, hold = 0 }) {
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(peak, t + attack);
  if (hold > 0) amp.gain.setValueAtTime(peak, t + attack + hold);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  amp.connect(out);
  return { amp, end: t + attack + hold + decay + 0.05 };
}

function osc(ctx, dest, t, end, { type = 'sine', freq, detune = 0 }) {
  const node = ctx.createOscillator();
  node.type = type;
  node.frequency.setValueAtTime(freq, t);
  node.detune.setValueAtTime(detune, t);
  node.connect(dest);
  node.start(t);
  node.stop(end);
  return node;
}

let noiseCache = null;
function noiseBuffer(ctx) {
  if (noiseCache && noiseCache.sampleRate === ctx.sampleRate) return noiseCache;
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseCache = buffer;
  return buffer;
}

function noise(ctx, dest, t, end) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.connect(dest);
  src.start(t);
  src.stop(end);
  return src;
}

/** One strike of a ring bell: inharmonic partials, long ring. */
function bellStrike(ctx, out, t, base = 740, peak = 0.55) {
  const partials = [
    [1, 1, 2.4],
    [2.01, 0.55, 1.8],
    [2.76, 0.45, 1.4],
    [4.07, 0.3, 0.9],
    [5.43, 0.22, 0.6],
    [8.93, 0.12, 0.35],
  ];
  for (const [ratio, level, decay] of partials) {
    const { amp, end } = env(ctx, out, t, { attack: 0.002, peak: peak * level, decay });
    osc(ctx, amp, t, end, { freq: base * ratio });
  }
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const click = env(ctx, out, t, { attack: 0.001, peak: 0.35, decay: 0.03 });
  hp.connect(click.amp);
  noise(ctx, hp, t, click.end);
}

const SYNTHS = {
  bell(ctx, out, t) {
    bellStrike(ctx, out, t);
    bellStrike(ctx, out, t + 0.32);
    return 2.8;
  },
  horn(ctx, out, t) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3200;
    lp.Q.value = 0.8;
    const { amp, end } = env(ctx, out, t, { attack: 0.02, peak: 0.42, hold: 0.75, decay: 0.12 });
    lp.connect(amp);
    for (const [freq, detune] of [[349, -8], [349, 9], [440, -6], [440, 7], [523, 0]]) {
      osc(ctx, lp, t, end, { type: 'sawtooth', freq, detune });
    }
    return 1;
  },
  double(ctx, out, t) {
    for (const start of [0, 0.2]) {
      const { amp, end } = env(ctx, out, t + start, { attack: 0.003, peak: 0.5, hold: 0.11, decay: 0.03 });
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5000;
      lp.connect(amp);
      osc(ctx, lp, t + start, end, { type: 'square', freq: 1046 });
    }
    return 0.4;
  },
  whistle(ctx, out, t) {
    const { amp, end } = env(ctx, out, t, { attack: 0.015, peak: 0.55, hold: 0.62, decay: 0.08 });
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(2950, t);
    const trill = ctx.createOscillator();
    trill.frequency.value = 34;
    const depth = ctx.createGain();
    depth.gain.value = 170;
    trill.connect(depth);
    depth.connect(tone.frequency);
    tone.connect(amp);
    tone.start(t);
    trill.start(t);
    tone.stop(end);
    trill.stop(end);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    bp.Q.value = 6;
    const air = ctx.createGain();
    air.gain.value = 0.5;
    bp.connect(air);
    air.connect(amp);
    noise(ctx, bp, t, end);
    return 0.75;
  },
  buzzer(ctx, out, t) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const { amp, end } = env(ctx, out, t, { attack: 0.01, peak: 0.5, hold: 0.7, decay: 0.06 });
    lp.connect(amp);
    osc(ctx, lp, t, end, { type: 'sawtooth', freq: 196 });
    osc(ctx, lp, t, end, { type: 'square', freq: 98 });
    osc(ctx, lp, t, end, { type: 'sawtooth', freq: 293.7, detune: 6 });
    return 0.8;
  },
  chime(ctx, out, t) {
    [1046.5, 1318.5, 1568].forEach((freq, i) => {
      const start = t + i * 0.13;
      const { amp, end } = env(ctx, out, start, { attack: 0.004, peak: 0.42, decay: 1.1 });
      osc(ctx, amp, start, end, { freq });
      const shine = env(ctx, out, start, { attack: 0.004, peak: 0.1, decay: 0.5 });
      osc(ctx, shine.amp, start, shine.end, { freq: freq * 2 });
    });
    return 1.4;
  },
  classic(ctx, out, t) {
    const a = env(ctx, out, t, { attack: 0.01, peak: 0.3, decay: 0.11 });
    osc(ctx, a.amp, t, a.end, { freq: 880 });
    const b = env(ctx, out, t + 0.12, { attack: 0.01, peak: 0.28, decay: 0.14 });
    osc(ctx, b.amp, t + 0.12, b.end, { freq: 1318.5 });
    return 0.35;
  },
};

/** A sharp countdown click, like a metronome or a stopwatch clicker. */
export function playTick(ctx, out, { last = false, when = 0 } = {}) {
  const t = ctx.currentTime + when;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = last ? 3400 : 2600;
  bp.Q.value = 1.4;
  const snap = env(ctx, out, t, { attack: 0.0008, peak: last ? 0.95 : 0.85, decay: 0.035 });
  bp.connect(snap.amp);
  noise(ctx, bp, t, snap.end);
  const body = env(ctx, out, t, { attack: 0.0008, peak: 0.5, decay: 0.045 });
  osc(ctx, body.amp, t, body.end, { type: 'triangle', freq: last ? 2100 : 1600 });
}

/** A rising arpeggio for the end of the workout. */
export function playFinish(ctx, out, when = 0) {
  const t = ctx.currentTime + when;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const start = t + i * 0.11;
    const { amp, end } = env(ctx, out, start, { attack: 0.004, peak: 0.42, decay: i === 3 ? 0.9 : 0.2 });
    osc(ctx, amp, start, end, { type: 'triangle', freq });
  });
  return 1.4;
}

export function playSound(ctx, out, id, when = 0) {
  if (id === 'none') return 0;
  const synth = SYNTHS[id] || SYNTHS.bell;
  return synth(ctx, out, ctx.currentTime + when);
}

/**
 * Builds the shared output chain.
 * Returns { input, setVolume } where input is what sounds connect to.
 */
export function createOutput(ctx, volume = 0.9) {
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.002;
  comp.release.value = 0.2;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.2;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  const trim = ctx.createGain();
  trim.gain.value = 0.92;
  master.connect(comp);
  comp.connect(makeup);
  makeup.connect(limiter);
  limiter.connect(trim);
  trim.connect(ctx.destination);
  function setVolume(value) {
    const v = Math.min(1, Math.max(0, Number(value)));
    master.gain.setTargetAtTime(v * v * 1.6, ctx.currentTime, 0.01);
  }
  setVolume(volume);
  return { input: master, setVolume };
}

/**
 * A barely-there noise bed (about -60 dB) that keeps Chrome treating the page as
 * "playing audio" while the screen is off, so the timer keeps firing on time.
 * It plays through Web Audio, not a media element, so it doesn't grab the
 * phone's media session and stop your music.
 */
export function createKeepAlive(ctx) {
  let src = null;
  let gain = null;
  return {
    start() {
      if (src) return;
      gain = ctx.createGain();
      gain.gain.value = 0.0012;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 400;
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      src.loop = true;
      src.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    },
    stop() {
      try { src?.stop(); } catch { /* already stopped */ }
      src?.disconnect();
      gain?.disconnect();
      src = null;
      gain = null;
    },
    get running() {
      return !!src;
    },
  };
}
