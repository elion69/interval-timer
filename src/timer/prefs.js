import { SOUND_IDS } from './sounds.js';

/** Sound and voice settings. Saved on the phone with the rest of the app state. */
export const DEFAULT_PREFS = Object.freeze({
  voiceCountdown: true,
  voiceRounds: true,
  workSound: 'bell',
  restSound: 'double',
  volume: 0.85,
  keepAlive: true,
});

export function normalizePrefs(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  const volume = Number(p.volume);
  return {
    voiceCountdown: p.voiceCountdown !== undefined ? !!p.voiceCountdown : DEFAULT_PREFS.voiceCountdown,
    voiceRounds: p.voiceRounds !== undefined ? !!p.voiceRounds : DEFAULT_PREFS.voiceRounds,
    workSound: SOUND_IDS.includes(p.workSound) ? p.workSound : DEFAULT_PREFS.workSound,
    restSound: SOUND_IDS.includes(p.restSound) ? p.restSound : DEFAULT_PREFS.restSound,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_PREFS.volume,
    keepAlive: p.keepAlive !== undefined ? !!p.keepAlive : DEFAULT_PREFS.keepAlive,
  };
}
