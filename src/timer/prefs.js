import { SOUND_IDS } from './sounds.js';

/** How the last 3 seconds are marked: spoken numbers, clicks, or nothing. */
export const COUNTDOWN_STYLES = ['voice', 'clicks', 'off'];

/** Sound and voice settings. Saved on the phone with the rest of the app state. */
export const DEFAULT_PREFS = Object.freeze({
  countdownStyle: 'voice',
  voiceRounds: true,
  workSound: 'bell',
  restSound: 'double',
  volume: 0.85,
  keepAlive: true,
  remoteListen: true, // keep listening for Captain/Claude starts while the app is in the background
});

export function normalizePrefs(prefs) {
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  const volume = Number(p.volume);
  return {
    countdownStyle: COUNTDOWN_STYLES.includes(p.countdownStyle)
      ? p.countdownStyle
      : p.voiceCountdown === false ? 'clicks' : DEFAULT_PREFS.countdownStyle,
    voiceRounds: p.voiceRounds !== undefined ? !!p.voiceRounds : DEFAULT_PREFS.voiceRounds,
    workSound: SOUND_IDS.includes(p.workSound) ? p.workSound : DEFAULT_PREFS.workSound,
    restSound: SOUND_IDS.includes(p.restSound) ? p.restSound : DEFAULT_PREFS.restSound,
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_PREFS.volume,
    keepAlive: p.keepAlive !== undefined ? !!p.keepAlive : DEFAULT_PREFS.keepAlive,
    remoteListen: p.remoteListen !== undefined ? !!p.remoteListen : DEFAULT_PREFS.remoteListen,
  };
}
