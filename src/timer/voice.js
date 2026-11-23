/**
 * Spoken cues through the Web Speech API (the phone's own text-to-speech).
 * If speech is missing or doesn't start within a moment, the fallback runs
 * instead, so a silent phone voice never means a silent countdown.
 */

export function countdownWord(second) {
  return String(second);
}

/** What to say when a work round starts. Null means say nothing. */
export function roundPhrase(round, rounds) {
  if (!Number.isFinite(round) || round < 1) return null;
  if (Number.isFinite(rounds) && rounds > 1 && round === rounds) return 'Last round';
  return `Round ${round}`;
}

export function createVoice() {
  const synth = typeof globalThis !== 'undefined' ? globalThis.speechSynthesis : undefined;
  const Utterance = typeof globalThis !== 'undefined' ? globalThis.SpeechSynthesisUtterance : undefined;
  const supported = !!(synth && Utterance);
  let voice = null;
  let unlocked = false;

  function pickVoice() {
    if (!supported) return null;
    const voices = synth.getVoices?.() || [];
    const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
    voice = english.find((v) => v.localService && /en[-_]US/i.test(v.lang))
      || english.find((v) => v.localService)
      || english.find((v) => /en[-_]US/i.test(v.lang))
      || english[0]
      || null;
    return voice;
  }

  if (supported) {
    pickVoice();
    synth.addEventListener?.('voiceschanged', pickVoice);
  }

  /**
   * @param {string} text
   * @param {{ interrupt?: boolean, rate?: number, volume?: number, fallback?: Function }} [opts]
   */
  function say(text, { interrupt = false, rate = 1.05, volume = 1, fallback } = {}) {
    if (!supported) {
      fallback?.();
      return false;
    }
    try {
      if (interrupt) synth.cancel();
      // Android Chrome can leave the queue paused after the app was backgrounded.
      if (synth.paused) synth.resume();
      const u = new Utterance(text);
      u.lang = voice?.lang || 'en-US';
      if (voice) u.voice = voice;
      u.rate = rate;
      u.volume = Math.min(1, Math.max(0, volume));
      let started = false;
      const guard = fallback ? setTimeout(() => {
        if (!started) fallback();
      }, 600) : 0;
      u.onstart = () => {
        started = true;
        clearTimeout(guard);
      };
      u.onerror = () => {
        clearTimeout(guard);
        if (!started) fallback?.();
      };
      synth.speak(u);
      return true;
    } catch {
      fallback?.();
      return false;
    }
  }

  return {
    supported,
    say,
    cancel() {
      try { synth?.cancel(); } catch { /* ignore */ }
    },
    /** Must run inside a tap once, or Chrome may refuse later speech. */
    unlock() {
      if (!supported || unlocked) return;
      unlocked = true;
      try {
        if (synth.paused) synth.resume();
        if (!synth.speaking && !synth.pending) {
          const u = new Utterance(' ');
          u.volume = 0;
          synth.speak(u);
        }
      } catch {
        /* ignore */
      }
    },
  };
}
