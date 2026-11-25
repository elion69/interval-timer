import { DEFAULT_CONFIG } from './presets.js';
import { normalizePrefs } from './prefs.js';

const KEY = 'go-timer.v1';

function cleanConfig(config) {
  return { ...DEFAULT_CONFIG, ...(config || {}) };
}

function cleanLaps(laps) {
  if (!Array.isArray(laps)) return [];
  return laps.slice(0, 100).map((lap) => ({
    splitMs: Math.max(0, Number(lap.splitMs) || 0),
    totalMs: Math.max(0, Number(lap.totalMs) || 0),
  })).filter((lap) => lap.totalMs > 0);
}

function cleanRun(run) {
  if (!run || typeof run !== 'object') return null;
  const laps = cleanLaps(run.laps);
  if (run.status === 'running' && Number.isFinite(Number(run.origin))) {
    return { status: 'running', origin: Number(run.origin), laps };
  }
  if (run.status === 'paused' && Number.isFinite(Number(run.elapsedMs))) {
    return { status: 'paused', elapsedMs: Number(run.elapsedMs), laps };
  }
  if (run.status === 'complete') return { status: 'complete' };
  return null;
}

function cleanTimer(timer, index) {
  if (!timer || typeof timer !== 'object') return null;
  const voice = Number.isInteger(timer.voice) ? ((timer.voice % 4) + 4) % 4 : index % 4;
  return {
    id: String(timer.id || `t${index + 1}`),
    label: String(timer.label || '').slice(0, 24),
    voice,
    config: cleanConfig(timer.config),
    run: cleanRun(timer.run),
  };
}

export function normalizeSaved(data) {
  const customPresets = Array.isArray(data?.customPresets)
    ? data.customPresets.map(cleanPreset).filter(Boolean).slice(0, 24)
    : [];
  let timers = Array.isArray(data?.timers)
    ? data.timers.map(cleanTimer).filter(Boolean).slice(0, 6)
    : [];
  if (!timers.length) {
    timers = [cleanTimer({
      id: 't1',
      label: '',
      voice: 0,
      config: data?.config,
      run: data?.run,
    }, 0)];
  }
  const hiddenBuiltins = Array.isArray(data?.hiddenBuiltins)
    ? [...new Set(data.hiddenBuiltins.filter((id) => typeof id === 'string'))].slice(0, 50)
    : [];
  const focusId = timers.some((timer) => timer.id === data?.focusId) ? data.focusId : timers[0].id;
  return {
    sound: data?.sound !== false,
    prefs: normalizePrefs(data?.prefs),
    customPresets,
    hiddenBuiltins,
    focusId,
    timers,
  };
}

function cleanPreset(preset) {
  if (!preset || typeof preset !== 'object' || !preset.config) return null;
  const name = String(preset.name || 'Custom').slice(0, 24);
  return {
    id: String(preset.id || `custom-${Date.now()}`),
    name,
    short: String(preset.short || name).slice(0, 12),
    builtin: false,
    config: preset.config,
  };
}

function fallback() {
  return normalizeSaved(null);
}

export function loadState() {
  const base = fallback();
  try {
    if (typeof localStorage === 'undefined') return base;
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      saveState(base);
      return base;
    }
    return normalizeSaved(JSON.parse(raw));
  } catch {
    return base;
  }
}

export function saveState(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    const normalized = normalizeSaved(state);
    localStorage.setItem(KEY, JSON.stringify({
      version: 2,
      sound: normalized.sound,
      prefs: normalized.prefs,
      customPresets: normalized.customPresets,
      hiddenBuiltins: normalized.hiddenBuiltins,
      focusId: normalized.focusId,
      timers: normalized.timers,
    }));
  } catch {
    /* private mode or a full disk — the timer still runs */
  }
}
