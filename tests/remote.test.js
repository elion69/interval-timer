import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCommand, findWorkout } from '../src/timer/remote.js';

const workouts = [
  { name: '20 on / 5 off', short: '20/5', config: { mode: 'interval', workMs: 1_200_000, restMs: 300_000, rounds: 4 } },
  { name: 'EMOM 10', short: 'EMOM', config: { mode: 'interval', workMs: 60_000, rounds: 10 } },
];

const now = Date.parse('2026-11-22T14:00:00Z');

test('a fresh named command matches case-insensitively', () => {
  const decision = evaluateCommand({
    id: 'abc',
    issued: '2026-11-22T13:59:30Z',
    action: 'start',
    workout: '20 ON / 5 OFF',
  }, { now, lastId: null, workouts });
  assert.equal(decision.action, 'start');
  assert.equal(decision.label, '20 on / 5 off');
  assert.equal(decision.config.workMs, 1_200_000);
});

test('the same id does not run twice and stale commands are ignored', () => {
  const command = {
    id: 'abc',
    issued: '2026-11-22T13:59:30Z',
    action: 'start',
    workout: '20/5',
  };
  assert.equal(evaluateCommand(command, { now, lastId: 'abc', workouts }), null);
  assert.equal(evaluateCommand({
    ...command,
    id: 'old',
    issued: '2026-11-22T13:50:00Z',
  }, { now, lastId: null, workouts }), null);
});

test('custom countdown, stopwatch, and interval specs', () => {
  const countdown = evaluateCommand({
    id: 'c',
    issued: '2026-11-22T14:00:00Z',
    action: 'start',
    workout: { countdown: 300 },
  }, { now, workouts });
  assert.equal(countdown.config.mode, 'countdown');
  assert.equal(countdown.config.durationMs, 300_000);

  const watch = evaluateCommand({
    id: 's',
    issued: '2026-11-22T14:00:00Z',
    action: 'start',
    workout: { stopwatch: true },
  }, { now, workouts });
  assert.equal(watch.config.mode, 'stopwatch');

  const custom = evaluateCommand({
    id: 'i',
    issued: '2026-11-22T14:00:00Z',
    action: 'start',
    workout: { work: 1200, rest: 300, rounds: 4, warmup: 0 },
  }, { now, workouts });
  assert.equal(custom.config.workMs, 1_200_000);
  assert.equal(custom.config.restMs, 300_000);
  assert.equal(custom.config.rounds, 4);
});

test('unknown names are reported once and pause needs no workout', () => {
  const missing = evaluateCommand({
    id: 'm',
    issued: '2026-11-22T14:00:00Z',
    action: 'start',
    workout: 'not a workout',
  }, { now, workouts });
  assert.equal(missing.action, 'missing');
  assert.equal(findWorkout(workouts, 'emom'), workouts[1]);

  const pause = evaluateCommand({
    id: 'p',
    issued: '2026-11-22T14:00:00Z',
    action: 'pause',
  }, { now, workouts });
  assert.equal(pause.action, 'pause');
});

test('a named remote timer keeps its name and runs alongside by default', async () => {
  const { evaluateCommand } = await import('../src/timer/remote.js');
  const now = Date.parse('2026-11-27T13:00:00Z');
  const d = evaluateCommand({ id: 'n1', issued: new Date(now).toISOString(), action: 'start', workout: { countdown: 600, name: 'plank' } }, { now });
  assert.equal(d.label, 'plank');
  assert.equal(d.config.durationMs, 600000);
  assert.equal(d.alongside, true);
  const e = evaluateCommand({ id: 'n2', issued: new Date(now).toISOString(), action: 'start', alongside: false, workout: { work: 30, rest: 15, rounds: 8 } }, { now });
  assert.equal(e.label, 'Custom');
  assert.equal(e.alongside, false);
});
