import assert from 'node:assert/strict';
import test from 'node:test';
import { planCue } from '../src/timer/audio.js';
import { roundPhrase } from '../src/timer/voice.js';
import { DEFAULT_PREFS, normalizePrefs } from '../src/timer/prefs.js';
import { normalizeSaved } from '../src/timer/storage.js';
import { SOUND_CHOICES } from '../src/timer/sounds.js';

const work = (round) => ({ kind: 'phase', phase: { type: 'work', round } });

test('there are at least four sound choices, including the loud ones asked for', () => {
  const ids = SOUND_CHOICES.map((s) => s.id);
  for (const id of ['bell', 'horn', 'double', 'whistle']) assert.ok(ids.includes(id), id);
});

test('round phrases: numbered, and "Last round" on the final one', () => {
  assert.equal(roundPhrase(1, 8), 'Round 1');
  assert.equal(roundPhrase(3, 8), 'Round 3');
  assert.equal(roundPhrase(8, 8), 'Last round');
  assert.equal(roundPhrase(5, null), 'Round 5');
  assert.equal(roundPhrase(1, 1), 'Round 1');
  assert.equal(roundPhrase(0, 8), null);
});

test('3-2-1 is spoken when voice countdown is on, beeped when off', () => {
  const on = planCue({ kind: 'tick', second: 2 }, { prefs: DEFAULT_PREFS });
  assert.deepEqual(on.map((a) => [a.type, a.text]), [['say', '2']]);
  assert.equal(on[0].fallbackTick, true);
  assert.equal(on[0].interrupt, true);
  const clicks = planCue({ kind: 'tick', second: 1 }, { prefs: { ...DEFAULT_PREFS, countdownStyle: 'clicks' } });
  assert.deepEqual(clicks, [{ type: 'tick', last: true }]);
  assert.deepEqual(planCue({ kind: 'tick', second: 2 }, { prefs: { ...DEFAULT_PREFS, countdownStyle: 'off' } }), []);
});

test('work start plays the work sound then announces the round', () => {
  const actions = planCue(work(8), { rounds: 8, prefs: { ...DEFAULT_PREFS, workSound: 'horn' } });
  assert.deepEqual(actions, [
    { type: 'sound', id: 'horn' },
    { type: 'say', text: 'Last round', interrupt: false },
  ]);
  const quiet = planCue(work(3), { rounds: 8, prefs: { ...DEFAULT_PREFS, voiceRounds: false } });
  assert.deepEqual(quiet, [{ type: 'sound', id: 'bell' }]);
});

test('rest start plays the rest sound, no announcement', () => {
  const actions = planCue({ kind: 'phase', phase: { type: 'rest', round: 2 } }, { rounds: 8, prefs: { ...DEFAULT_PREFS, restSound: 'whistle' } });
  assert.deepEqual(actions, [{ type: 'sound', id: 'whistle' }]);
});

test('extra timers keep their own beeps and never speak', () => {
  assert.deepEqual(planCue({ kind: 'tick', second: 3 }, { primary: false }), [{ type: 'legacy' }]);
  assert.deepEqual(planCue(work(2), { primary: false, rounds: 4 }), [{ type: 'legacy' }]);
});

test('prefs are cleaned and survive a save round-trip', () => {
  assert.deepEqual(normalizePrefs({ workSound: 'nope', volume: 7 }), { ...DEFAULT_PREFS, volume: 1 });
  const saved = normalizeSaved({ prefs: { voiceRounds: false, restSound: 'chime', volume: 0.4, keepAlive: false } });
  assert.equal(saved.prefs.voiceRounds, false);
  assert.equal(saved.prefs.restSound, 'chime');
  assert.equal(saved.prefs.volume, 0.4);
  assert.equal(saved.prefs.keepAlive, false);
  assert.equal(saved.prefs.countdownStyle, 'voice');
  assert.equal(normalizeSaved({ prefs: { voiceCountdown: false } }).prefs.countdownStyle, 'clicks');
  assert.deepEqual(normalizeSaved(null).prefs, { ...DEFAULT_PREFS });
});

test('clicks + round call with no bell: only the voice says the round', () => {
  const prefs = { ...DEFAULT_PREFS, countdownStyle: 'clicks', workSound: 'none' };
  assert.deepEqual(planCue({ kind: 'tick', second: 3 }, { prefs }), [{ type: 'tick', last: false }]);
  assert.deepEqual(planCue(work(3), { rounds: 10, prefs }), [{ type: 'say', text: 'Round 3', interrupt: false }]);
  assert.deepEqual(planCue({ kind: 'phase', phase: { type: 'rest', round: 3 } }, { prefs: { ...prefs, restSound: 'none' } }), []);
});

import { cuesBetween } from '../src/timer/timeline.js';

test('timeline lists every cue ahead: phase starts, 3-2-1 ticks, finish', () => {
  const cfg = { mode: 'interval', workMs: 5000, restMs: 4000, warmupMs: 0, rounds: 2 };
  const list = cuesBetween(cfg, 0, 60000).map((e) => `${e.at}:${e.cue.kind}${e.cue.second ?? ''}:${e.cue.phase.type}${e.cue.phase.round}`);
  assert.deepEqual(list, [
    '0:phase:work1', '2000:tick3:work1', '3000:tick2:work1', '4000:tick1:work1',
    '5000:phase:rest1', '6000:tick3:rest1', '7000:tick2:rest1', '8000:tick1:rest1',
    '9000:phase:work2', '11000:tick3:work2', '12000:tick2:work2', '13000:tick1:work2',
    '14000:complete:done2',
  ]);
});

test('timeline handles unlimited rounds from the middle of a workout', () => {
  const cfg = { mode: 'interval', workMs: 30000, restMs: 10000, warmupMs: 0, rounds: null };
  const list = cuesBetween(cfg, 400000, 445000).filter((e) => e.cue.kind === 'phase');
  assert.deepEqual(list.map((e) => [e.at, e.cue.phase.type, e.cue.phase.round]), [
    [400000, 'work', 11], [430000, 'rest', 11], [440000, 'work', 12],
  ]);
});

import { clipKey, CLIP_KEYS } from '../src/timer/audio.js';
import { existsSync } from 'node:fs';

test('every phrase the timer says has a recorded clip', () => {
  assert.equal(clipKey('3'), 'n3');
  assert.equal(clipKey('Round 42'), 'r42');
  assert.equal(clipKey('Last round'), 'last');
  assert.equal(clipKey('Done'), 'done');
  assert.equal(clipKey('Round 101'), null);
  for (const key of CLIP_KEYS) assert.ok(existsSync(new URL(`../public/voice/${key}.ogg`, import.meta.url)), key);
});

test('deleted built-in presets are remembered', () => {
  const saved = normalizeSaved({ hiddenBuiltins: ['tabata', 'tabata', 5] });
  assert.deepEqual(saved.hiddenBuiltins, ['tabata']);
  assert.deepEqual(normalizeSaved(null).hiddenBuiltins, []);
});
