/**
 * Alerts: synthesized sounds (Web Audio), spoken cues (Web Speech), vibration,
 * and a quiet keep-alive so the timer keeps running with the screen off.
 */

import { createKeepAlive, createOutput, playFinish, playSound, playTick } from './sounds.js';
import { createVoice, roundPhrase } from './voice.js';
import { DEFAULT_PREFS, normalizePrefs } from './prefs.js';

function tone(ctx, out, { freq, dur, gain, type = 'sine', when = 0 }) {
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Four timbres so the extra timers in the stack are easy to tell apart. */
const VOICES = [
  { wave: 'sine', tick: 990, work: [880, 1318.5], rest: 494, warm: 659, done: [523.25, 659.25, 783.99, 1046.5], fall: false, gain: 0.5 },
  { wave: 'square', tick: 1480, work: [1046, 1568], rest: 784, warm: 988, done: [784, 988, 1175, 1568], fall: false, gain: 0.25, doubleTick: true },
  { wave: 'sine', tick: 520, work: [698, 440], rest: 330, warm: 392, done: [349, 440, 523, 698], fall: true, gain: 0.5 },
  { wave: 'triangle', tick: 1760, work: [1568, 2093], rest: 1175, warm: 1397, done: [1319, 1568, 1976, 2637], fall: false, gain: 0.45 },
];

function voiceOf(voice) {
  const count = VOICES.length;
  const index = ((Number(voice) || 0) % count + count) % count;
  return VOICES[index];
}

function playLegacy(ctx, out, cue, voice) {
  const v = voiceOf(voice);
  if (cue.kind === 'tick' || cue.kind === 'lap') {
    tone(ctx, out, { freq: v.tick, dur: 0.06, gain: Math.min(0.3, v.gain), type: v.wave });
    if (v.doubleTick) tone(ctx, out, { freq: v.tick * 1.25, dur: 0.06, gain: Math.min(0.25, v.gain), type: v.wave, when: 0.08 });
    return;
  }
  if (cue.kind === 'complete') {
    v.done.forEach((freq, i) => {
      tone(ctx, out, { freq, dur: 0.18, gain: v.gain, type: v.wave === 'square' ? 'square' : 'sine', when: i * 0.1 });
    });
    return;
  }
  if (cue.kind !== 'phase') return;
  const type = cue.phase?.type;
  if (type === 'work' || type === 'countdown') {
    const [low, high] = v.work;
    tone(ctx, out, { freq: v.fall ? high : low, dur: 0.13, gain: v.gain, type: v.wave });
    tone(ctx, out, { freq: v.fall ? low : high, dur: 0.16, gain: v.gain * 0.9, type: v.wave, when: 0.13 });
  } else if (type === 'rest') {
    tone(ctx, out, { freq: v.rest, dur: 0.22, gain: v.gain * 0.9, type: v.wave });
  } else {
    tone(ctx, out, { freq: v.warm, dur: 0.18, gain: v.gain, type: v.wave });
  }
}

/**
 * Pure decision: what a cue should do. Kept separate so it can be tested
 * without audio hardware.
 *
 * @returns {Array<{ type: 'sound'|'tick'|'say'|'finish'|'legacy', id?: string, last?: boolean, text?: string, interrupt?: boolean, fallbackTick?: boolean }>}
 */
export function planCue(cue, { primary = true, rounds = null, prefs = DEFAULT_PREFS } = {}) {
  if (!cue) return [];
  if (!primary) return [{ type: 'legacy' }];
  const p = normalizePrefs(prefs);
  if (cue.kind === 'tick') {
    const last = cue.second === 1;
    if (p.voiceCountdown) return [{ type: 'say', text: String(cue.second), interrupt: true, fallbackTick: true, last }];
    return [{ type: 'tick', last }];
  }
  if (cue.kind === 'lap') return [{ type: 'tick', last: false }];
  if (cue.kind === 'complete') {
    const actions = [{ type: 'finish' }];
    if (p.voiceRounds && cue.phase?.type !== 'stopwatch') actions.push({ type: 'say', text: 'Done', interrupt: false });
    return actions;
  }
  if (cue.kind !== 'phase') return [];
  const type = cue.phase?.type;
  if (type === 'stopwatch') return [{ type: 'tick', last: true }];
  if (type === 'work' || type === 'countdown') {
    const actions = [{ type: 'sound', id: p.workSound }];
    if (type === 'work' && p.voiceRounds) {
      const text = roundPhrase(cue.phase.round, rounds);
      if (text) actions.push({ type: 'say', text, interrupt: false });
    }
    return actions;
  }
  return [{ type: 'sound', id: p.restSound }];
}

function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    /* some browsers throw if vibration is blocked */
  }
}

const BUZZ = {
  tick: [12, 16, 10, 20],
  work: [[30, 40, 30], [12, 28, 12, 28, 36], [64], [16, 16, 16, 16, 16]],
  rest: [20, 36, 14, 26],
  complete: [[50, 40, 50, 40, 90], [18, 18, 18, 18, 70], [80, 30, 40], [14, 22, 14, 22, 14, 22, 70]],
};

function buzzPattern(kind, voice, phaseType) {
  const index = Math.abs(Number(voice) || 0) % 4;
  if (kind === 'tick' || kind === 'lap') return BUZZ.tick[index];
  if (kind === 'complete') return BUZZ.complete[index];
  if (phaseType === 'work' || phaseType === 'countdown') return BUZZ.work[index];
  return BUZZ.rest[index];
}

/** Kept for embedders: the old four-voice beeper, now through the loud chain. */
export function createBeeps() {
  let ctx = null;
  let out = null;
  function context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      out = createOutput(ctx, DEFAULT_PREFS.volume).input;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  return {
    unlock() { context(); },
    play(cue, voice = 0) {
      const audio = context();
      if (audio) playLegacy(audio, out, cue, voice);
    },
    close() {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}

/**
 * Sound follows the mute toggle (mute silences the voice too).
 * Vibration stays on so a silenced phone still marks the change.
 */
export function createAlerts(initialPrefs = DEFAULT_PREFS) {
  let prefs = normalizePrefs(initialPrefs);
  let sound = true;
  let ctx = null;
  let output = null;
  let keepAlive = null;
  let wantAlive = false;
  const voice = createVoice();

  // Let the timer's sounds mix with music instead of taking it over, where the browser supports it.
  try {
    if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'ambient';
  } catch {
    /* not supported */
  }

  function context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        ctx = new AC();
      }
      output = createOutput(ctx, prefs.volume);
      keepAlive = createKeepAlive(ctx);
      ctx.addEventListener?.('statechange', () => {
        if (ctx?.state === 'interrupted' || ctx?.state === 'suspended') ctx.resume().catch(() => {});
      });
    }
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
    return ctx;
  }

  function applyKeepAlive() {
    if (!ctx) return;
    if (wantAlive && prefs.keepAlive) keepAlive.start();
    else keepAlive.stop();
  }

  function run(actions, cue, voiceIndex) {
    const audio = context();
    for (const action of actions) {
      if (action.type === 'legacy') {
        if (audio) playLegacy(audio, output.input, cue, voiceIndex);
      } else if (action.type === 'sound') {
        if (audio) playSound(audio, output.input, action.id);
      } else if (action.type === 'tick') {
        if (audio) playTick(audio, output.input, { last: action.last });
      } else if (action.type === 'finish') {
        if (audio) playFinish(audio, output.input);
      } else if (action.type === 'say') {
        const fallback = action.fallbackTick && audio
          ? () => playTick(audio, output.input, { last: action.last })
          : undefined;
        voice.say(action.text, {
          interrupt: action.interrupt,
          rate: action.fallbackTick ? 1.15 : 1.05,
          volume: Math.min(1, prefs.volume + 0.15),
          fallback,
        });
      }
    }
  }

  /**
   * @param {object} cue engine cue
   * @param {number|{ voice?: number, primary?: boolean, rounds?: number|null }} [opts]
   */
  function play(cue, opts = {}) {
    const o = typeof opts === 'number' ? { voice: opts, primary: true } : opts;
    const voiceIndex = o.voice ?? 0;
    if (sound) run(planCue(cue, { primary: o.primary !== false, rounds: o.rounds ?? null, prefs }), cue, voiceIndex);
    vibrate(buzzPattern(cue.kind, voiceIndex, cue.phase?.type));
  }

  return {
    get sound() {
      return sound;
    },
    setSound(on) {
      sound = !!on;
      if (!sound) voice.cancel();
    },
    get prefs() {
      return { ...prefs };
    },
    setPrefs(next) {
      prefs = normalizePrefs({ ...prefs, ...next });
      output?.setVolume(prefs.volume);
      applyKeepAlive();
      return { ...prefs };
    },
    /** Running timers → keep the page alive in the background. */
    setRunning(on) {
      wantAlive = !!on;
      if (wantAlive) context();
      applyKeepAlive();
    },
    get keepingAlive() {
      return !!keepAlive?.running;
    },
    get voiceSupported() {
      return voice.supported;
    },
    unlock() {
      context();
      voice.unlock();
    },
    preview(id) {
      const audio = context();
      if (audio) playSound(audio, output.input, id);
    },
    previewVoice() {
      context();
      voice.say('3', { interrupt: true, rate: 1.15, volume: Math.min(1, prefs.volume + 0.15) });
      voice.say('2', { rate: 1.15, volume: Math.min(1, prefs.volume + 0.15) });
      voice.say('1', { rate: 1.15, volume: Math.min(1, prefs.volume + 0.15) });
      voice.say('Round 3', { volume: Math.min(1, prefs.volume + 0.15) });
    },
    play,
    close() {
      keepAlive?.stop();
      voice.cancel();
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
