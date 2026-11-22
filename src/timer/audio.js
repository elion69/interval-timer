/** Short beeps from the Web Audio API. No asset files. */

function tone(ctx, { freq, dur, gain, type = 'sine', when = 0 }) {
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

/** Four timbres so overlapping timers are easy to tell apart. */
const VOICES = [
  { wave: 'sine', tick: 990, work: [880, 1318.5], rest: 494, warm: 659, done: [523.25, 659.25, 783.99, 1046.5], fall: false, gain: 0.18 },
  { wave: 'square', tick: 1480, work: [1046, 1568], rest: 784, warm: 988, done: [784, 988, 1175, 1568], fall: false, gain: 0.055, doubleTick: true },
  { wave: 'sine', tick: 520, work: [698, 440], rest: 330, warm: 392, done: [349, 440, 523, 698], fall: true, gain: 0.18 },
  { wave: 'triangle', tick: 1760, work: [1568, 2093], rest: 1175, warm: 1397, done: [1319, 1568, 1976, 2637], fall: false, gain: 0.16 },
];

function voiceOf(voice) {
  const count = VOICES.length;
  const index = ((Number(voice) || 0) % count + count) % count;
  return VOICES[index];
}

export function createBeeps() {
  let ctx = null;

  function context() {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function play(cue, voice = 0) {
    const audio = context();
    if (!audio) return;
    const v = voiceOf(voice);
    if (cue.kind === 'tick' || cue.kind === 'lap') {
      tone(audio, { freq: v.tick, dur: 0.05, gain: Math.min(0.1, v.gain), type: v.wave });
      if (v.doubleTick) tone(audio, { freq: v.tick * 1.25, dur: 0.05, gain: Math.min(0.08, v.gain), type: v.wave, when: 0.07 });
      return;
    }
    if (cue.kind === 'complete') {
      v.done.forEach((freq, i) => {
        tone(audio, { freq, dur: 0.15, gain: v.gain, type: v.wave === 'square' ? 'square' : 'sine', when: i * 0.1 });
      });
      return;
    }
    if (cue.kind !== 'phase') return;
    const type = cue.phase?.type;
    if (type === 'work' || type === 'countdown') {
      const [low, high] = v.work;
      tone(audio, { freq: v.fall ? high : low, dur: 0.11, gain: v.gain, type: v.wave });
      tone(audio, { freq: v.fall ? low : high, dur: 0.14, gain: v.gain * 0.9, type: v.wave, when: 0.12 });
    } else if (type === 'rest') {
      tone(audio, { freq: v.rest, dur: 0.18, gain: v.gain * 0.9, type: v.wave });
    } else {
      tone(audio, { freq: v.warm, dur: 0.15, gain: v.gain, type: v.wave });
    }
  }

  return {
    unlock() {
      context();
    },
    play,
    close() {
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
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

/** Sound follows the mute toggle. Vibration stays on so a silenced phone still marks the change. */
export function createAlerts() {
  const beeps = createBeeps();
  let sound = true;

  function pattern(kind, voice, phaseType) {
    const index = Math.abs(Number(voice) || 0) % 4;
    if (kind === 'tick' || kind === 'lap') return BUZZ.tick[index];
    if (kind === 'complete') return BUZZ.complete[index];
    if (phaseType === 'work' || phaseType === 'countdown') return BUZZ.work[index];
    return BUZZ.rest[index];
  }

  function play(cue, voice = 0) {
    if (sound) beeps.play(cue, voice);
    vibrate(pattern(cue.kind, voice, cue.phase?.type));
  }

  return {
    get sound() {
      return sound;
    },
    setSound(on) {
      sound = !!on;
    },
    unlock() {
      beeps.unlock();
    },
    play,
    close() {
      beeps.close();
    },
  };
}
