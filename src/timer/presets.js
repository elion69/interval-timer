import { formatPart, formatShort } from './format.js';

/** Phase presentation shared by the standalone app and future embeds. */
export const PHASES = {
  work: { label: 'go', color: '#FF2B73' },
  rest: { label: 'rest', color: '#1EE08A' },
  warmup: { label: 'warm', color: '#FFAA1A' },
  countdown: { label: 'timer', color: '#00B3E6' },
  stopwatch: { label: 'stop', color: '#F4F4F5' },
  done: { label: 'done', color: '#F2F2F2' },
};

export const DEFAULT_CONFIG = {
  mode: 'interval',
  workMs: 60_000,
  restMs: 0,
  warmupMs: 0,
  rounds: 100,
  durationMs: 60_000,
};

export const BUILTIN_PRESETS = [
  {
    id: '1m',
    name: '1 min work',
    short: '1M',
    builtin: true,
    config: { mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 100, durationMs: 60_000 },
  },
  {
    id: '30-30',
    name: '30 / 30',
    short: '30/30',
    builtin: true,
    config: { mode: 'interval', workMs: 30_000, restMs: 30_000, warmupMs: 0, rounds: 10, durationMs: 30_000 },
  },
  {
    id: 'tabata',
    name: 'Tabata',
    short: 'Tabata',
    builtin: true,
    config: { mode: 'interval', workMs: 20_000, restMs: 10_000, warmupMs: 0, rounds: 8, durationMs: 20_000 },
  },
  {
    id: 'emom',
    name: 'EMOM 10',
    short: 'EMOM',
    builtin: true,
    config: { mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 10, durationMs: 60_000 },
  },
  {
    id: '5min',
    name: '5:00',
    short: '5:00',
    builtin: true,
    config: { mode: 'countdown', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 1, durationMs: 300_000 },
  },
  {
    id: '5x10',
    name: '5:00 x 10',
    short: '5x10',
    builtin: true,
    config: { mode: 'interval', workMs: 300_000, restMs: 0, warmupMs: 0, rounds: 10, durationMs: 300_000 },
  },
  {
    id: '20-5',
    name: '20 on / 5 off',
    short: '20/5',
    builtin: true,
    config: { mode: 'interval', workMs: 1_200_000, restMs: 300_000, warmupMs: 0, rounds: 4, durationMs: 1_200_000 },
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    short: 'Stop',
    builtin: true,
    config: { mode: 'stopwatch', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 1, durationMs: 60_000 },
  },
];

export function configsEqual(a, b) {
  if (!a || !b) return false;
  return a.mode === b.mode
    && a.workMs === b.workMs
    && a.restMs === b.restMs
    && a.warmupMs === b.warmupMs
    && a.rounds === b.rounds
    && a.durationMs === b.durationMs;
}

export function chipLabel(config, presets = BUILTIN_PRESETS) {
  const match = presets.find((preset) => configsEqual(preset.config, config));
  if (match) return match.short;
  if (!config) return 'Custom';
  if (config.mode === 'stopwatch') return 'Stop';
  if (config.mode === 'countdown') return formatShort(config.durationMs);
  if (config.restMs > 0) return `${formatPart(config.workMs)}/${formatPart(config.restMs)}`;
  return formatShort(config.workMs);
}
