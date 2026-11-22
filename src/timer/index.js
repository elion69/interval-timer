/**
 * Public timer API.
 *
 * Standalone app: mountTimer(element).
 * Embed in another app (no UI):
 *
 *   import { createIntervalTimer } from './timer/engine.js';
 *   const timer = createIntervalTimer({ mode: 'interval', workMs: 30_000, restMs: 30_000, rounds: 10 });
 *   timer.onPhaseChange((snap) => console.log(snap.phase.label));
 *   timer.start();
 */

export { createIntervalTimer, planTimer, normalizeConfig } from './engine.js';
export { createTimerRack } from './rack.js';
export { createBeeps, createAlerts } from './audio.js';
export { createWakeLock } from './wake.js';
export { loadState, saveState, normalizeSaved } from './storage.js';
export { mountTimer } from './mount.js';
export {
  PHASES,
  BUILTIN_PRESETS,
  DEFAULT_CONFIG,
  chipLabel,
  configsEqual,
} from './presets.js';
export { formatHMS, formatPhase, formatShort } from './format.js';
