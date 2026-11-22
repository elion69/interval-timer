import assert from 'node:assert/strict';
import test from 'node:test';
import { createIntervalTimer, planTimer } from '../src/timer/engine.js';
import { digitsToMs, formatHMS, formatPhase, formatStopwatch } from '../src/timer/format.js';
import { BUILTIN_PRESETS, chipLabel, configsEqual } from '../src/timer/presets.js';

function harness(config) {
  let now = 1_000_000;
  const cues = [];
  const phases = [];
  const delays = [];
  const timer = createIntervalTimer(config, {
    now: () => now,
    schedule: (_fn, ms) => {
      delays.push(ms);
      return delays.length;
    },
    clear: () => {},
  });
  timer.on('cue', (cue) => {
    if (cue.kind === 'tick') cues.push(`tick:${cue.second}`);
    else if (cue.kind === 'phase') cues.push(`phase:${cue.phase.type}:${cue.phase.round}`);
    else cues.push(cue.kind);
  });
  timer.on('phasechange', (snap) => phases.push(`${snap.phase.type}:${snap.phase.round}`));
  return {
    timer,
    cues,
    phases,
    delays,
    advance(ms) {
      now += ms;
      timer.sync();
    },
  };
}

test('plan puts rest between rounds and not after the last one', () => {
  const plan = planTimer({
    mode: 'interval', workMs: 1000, restMs: 1000, warmupMs: 2000, rounds: 2,
  });
  assert.deepEqual(plan.phases.map((phase) => phase.type), ['warmup', 'work', 'rest', 'work']);
  assert.equal(plan.totalMs, 5000);
});

test('screenshot moment: 100 × 1:00 at two seconds', () => {
  const { timer, advance } = harness({
    mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 100,
  });
  timer.start();
  advance(2000);
  const snap = timer.getSnapshot();
  assert.equal(snap.phase.label, 'go');
  assert.equal(snap.phase.color, '#FF2B73');
  assert.equal(snap.phase.round, 1);
  assert.equal(snap.phase.remainingMs, 58_000);
  assert.equal(snap.totalRemainingMs, 6_000_000 - 2000);
  assert.equal(snap.roundsRemaining, 100);
  assert.ok(Math.abs(snap.phase.progress - (2000 / 60_000)) < 1e-12);
  assert.equal(formatHMS(snap.totalRemainingMs), '01:39:58');
  assert.equal(formatPhase(snap.phase.remainingMs), '00:58');
  timer.destroy();
});

test('pause freezes the clock while wall time moves', () => {
  const { timer, advance } = harness({
    mode: 'interval', workMs: 60_000, restMs: 30_000, warmupMs: 0, rounds: 4,
  });
  timer.start();
  advance(10_000);
  timer.pause();
  advance(50_000);
  assert.equal(timer.getSnapshot().phase.remainingMs, 50_000);
  assert.equal(timer.getSnapshot().status, 'paused');
  timer.resume();
  advance(5_000);
  assert.equal(timer.getSnapshot().phase.remainingMs, 45_000);
  assert.equal(timer.getSnapshot().totalElapsedMs, 15_000);
  timer.destroy();
});

test('phases advance from the timestamp and skip trailing rest', () => {
  const { timer, advance, phases, cues } = harness({
    mode: 'interval', workMs: 5_000, restMs: 5_000, warmupMs: 3_000, rounds: 2,
  });
  timer.start();
  assert.equal(timer.getSnapshot().phase.type, 'warmup');
  assert.equal(timer.getSnapshot().roundsRemaining, 2);
  advance(3_000);
  assert.equal(timer.getSnapshot().phase.type, 'work');
  assert.equal(timer.getSnapshot().roundsRemaining, 2);
  advance(5_000);
  assert.equal(timer.getSnapshot().phase.type, 'rest');
  assert.equal(timer.getSnapshot().phase.round, 1);
  assert.equal(timer.getSnapshot().roundsRemaining, 1);
  advance(5_000);
  assert.equal(timer.getSnapshot().phase.type, 'work');
  assert.equal(timer.getSnapshot().phase.round, 2);
  advance(5_000);
  assert.equal(timer.getSnapshot().status, 'complete');
  assert.equal(timer.getSnapshot().totalRemainingMs, 0);
  assert.deepEqual(phases, ['warmup:0', 'work:1', 'rest:1', 'work:2']);
  assert.equal(cues.at(-1), 'complete');
  timer.destroy();
});

test('a hidden gap across 5:00 rounds with no rest lands on the next round', () => {
  const { timer, advance, phases, cues } = harness({
    mode: 'interval', workMs: 300_000, restMs: 0, warmupMs: 0, rounds: 10,
  });
  timer.start();
  advance(6 * 60_000);
  const snap = timer.getSnapshot();
  assert.equal(snap.status, 'running');
  assert.equal(snap.phase.type, 'work');
  assert.equal(snap.phase.round, 2);
  assert.equal(snap.phase.remainingMs, 4 * 60_000);
  assert.equal(snap.totalRemainingMs, 50 * 60_000 - 6 * 60_000);
  assert.equal(snap.roundsRemaining, 9);
  assert.deepEqual(phases, ['work:1', 'work:2']);
  assert.deepEqual(cues, ['phase:work:1', 'phase:work:2']);
  advance(50 * 60_000);
  assert.equal(timer.getSnapshot().status, 'complete');
  assert.equal(cues.at(-1), 'complete');
  timer.destroy();
});

test('zero rest never inserts a rest phase', () => {
  const { timer, advance, phases } = harness({
    mode: 'interval', workMs: 1_000, restMs: 0, warmupMs: 0, rounds: 3,
  });
  timer.start();
  advance(1_000);
  advance(1_000);
  advance(1_000);
  assert.deepEqual(phases, ['work:1', 'work:2', 'work:3']);
  assert.equal(timer.getSnapshot().status, 'complete');
  timer.destroy();
});

test('countdown beeps on the last three seconds and completes once', () => {
  const { timer, advance, cues } = harness({
    mode: 'countdown', durationMs: 10_000,
  });
  timer.start();
  advance(7_000);
  advance(1_000);
  advance(1_000);
  advance(1_000);
  assert.deepEqual(cues, ['phase:countdown:1', 'tick:3', 'tick:2', 'tick:1', 'complete']);
  advance(5_000);
  assert.equal(cues.filter((cue) => cue === 'complete').length, 1);
  timer.destroy();
});

test('a background jump lands on the right phase without a beep backlog', () => {
  const { timer, advance, cues, phases } = harness({
    mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 3,
  });
  timer.start();
  advance(65_000);
  const snap = timer.getSnapshot();
  assert.equal(snap.phase.round, 2);
  assert.equal(snap.phase.elapsedMs, 5_000);
  assert.equal(snap.phase.remainingMs, 55_000);
  assert.equal(snap.totalRemainingMs, 180_000 - 65_000);
  assert.deepEqual(phases, ['work:1', 'work:2']);
  assert.deepEqual(cues, ['phase:work:1', 'phase:work:2']);
  timer.destroy();
});

test('skip moves to the next phase and finishes on the last one', () => {
  const { timer, cues } = harness({
    mode: 'interval', workMs: 30_000, restMs: 10_000, warmupMs: 0, rounds: 2,
  });
  timer.start();
  timer.skip();
  assert.equal(timer.getSnapshot().phase.type, 'rest');
  assert.equal(timer.getSnapshot().phase.remainingMs, 10_000);
  timer.pause();
  timer.skip();
  assert.equal(timer.getSnapshot().status, 'paused');
  assert.equal(timer.getSnapshot().phase.type, 'work');
  assert.equal(timer.getSnapshot().phase.round, 2);
  timer.skip();
  assert.equal(timer.getSnapshot().status, 'complete');
  assert.equal(cues.filter((cue) => cue === 'complete').length, 1);
  timer.destroy();
});

test('unlimited rounds keep running and report no total', () => {
  const { timer, advance } = harness({
    mode: 'interval', workMs: 1_000, restMs: 1_000, warmupMs: 0, rounds: null,
  });
  timer.start();
  advance(10_500);
  const snap = timer.getSnapshot();
  assert.equal(snap.status, 'running');
  assert.equal(snap.phase.type, 'work');
  assert.equal(snap.phase.round, 6);
  assert.equal(snap.totalRemainingMs, null);
  assert.equal(snap.roundsRemaining, null);
  assert.equal(formatHMS(snap.totalRemainingMs), '∞');
  timer.destroy();
});

test('restart returns to the first phase and keeps running', () => {
  const { timer, advance, cues } = harness({
    mode: 'countdown', durationMs: 20_000,
  });
  timer.start();
  advance(4_000);
  timer.restart();
  const snap = timer.getSnapshot();
  assert.equal(snap.status, 'running');
  assert.equal(snap.phase.remainingMs, 20_000);
  assert.equal(snap.totalElapsedMs, 0);
  assert.ok(cues.filter((cue) => cue.startsWith('phase:')).length >= 2);
  timer.destroy();
});

test('restore continues from a timestamp without beeping', () => {
  const { timer, advance, cues } = harness({
    mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 100,
  });
  const snap = timer.restore({ elapsedMs: 2000, running: true });
  assert.equal(cues.length, 0);
  assert.equal(snap.status, 'running');
  assert.equal(snap.phase.remainingMs, 58_000);
  assert.equal(snap.totalRemainingMs, 6_000_000 - 2000);
  advance(1000);
  assert.equal(timer.getSnapshot().phase.remainingMs, 57_000);
  assert.equal(cues.length, 0);
  timer.destroy();
});

test('restore past the end is complete and silent', () => {
  const { timer, cues } = harness({ mode: 'countdown', durationMs: 5_000 });
  const snap = timer.restore({ elapsedMs: 9_000, running: true });
  assert.equal(snap.status, 'complete');
  assert.equal(cues.length, 0);
  timer.destroy();
});

test('configure resets a running timer back to idle', () => {
  const { timer, advance } = harness({
    mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 10,
  });
  timer.start();
  advance(5_000);
  timer.configure({ workMs: 30_000, restMs: 30_000, rounds: 8 });
  const snap = timer.getSnapshot();
  assert.equal(snap.status, 'idle');
  assert.equal(snap.config.workMs, 30_000);
  assert.equal(snap.phase.remainingMs, 30_000);
  assert.equal(snap.rounds, 8);
  timer.destroy();
});

test('the scheduler wakes in time for the three-second beep', () => {
  const { timer, delays } = harness({ mode: 'countdown', durationMs: 10_000 });
  timer.start();
  assert.equal(delays.at(-1), 7_000);
  timer.destroy();
});

test('stopwatch counts up from the clock, laps, and resets to idle', () => {
  const { timer, advance, cues } = harness({ mode: 'stopwatch' });
  timer.start();
  advance(12_500);
  timer.lap();
  advance(2_000);
  timer.pause();
  advance(9_000);
  const snap = timer.getSnapshot();
  assert.equal(snap.status, 'paused');
  assert.equal(snap.totalElapsedMs, 14_500);
  assert.equal(snap.laps.length, 1);
  assert.equal(snap.laps[0].splitMs, 12_500);
  assert.equal(snap.laps[0].totalMs, 12_500);
  assert.ok(Math.abs(snap.phase.progress - ((14_500 % 60_000) / 60_000)) < 1e-12);
  assert.equal(cues.filter((cue) => cue.startsWith('tick:')).length, 0);
  assert.equal(cues.filter((cue) => cue === 'lap').length, 1);
  timer.restart();
  assert.equal(timer.getSnapshot().status, 'idle');
  assert.equal(timer.getSnapshot().totalElapsedMs, 0);
  assert.equal(timer.getSnapshot().laps.length, 0);
  timer.destroy();
});

test('digits fill from the right, so 2000 is 20:00', () => {
  assert.equal(digitsToMs('2000').text, '20:00');
  assert.equal(digitsToMs('2000').ms, 20 * 60_000);
  assert.equal(digitsToMs('500').text, '05:00');
  assert.equal(digitsToMs('45').text, '00:45');
  assert.equal(digitsToMs('').text, '00:00');
  assert.equal(digitsToMs('20000').text, '2:00:00');
  assert.equal(formatStopwatch(12_480), '00:12.48');
});

test('20 on / 5 off is a one-tap preset and keeps the rest rounds', () => {
  const preset = BUILTIN_PRESETS.find((item) => item.id === '20-5');
  assert.equal(chipLabel(preset.config), '20/5');
  assert.equal(preset.config.workMs, 20 * 60_000);
  assert.equal(preset.config.restMs, 5 * 60_000);
  assert.equal(preset.config.rounds, 4);
  const plan = planTimer(preset.config);
  assert.ok(plan.phases.some((phase) => phase.type === 'rest'));
});

test('chip labels prefer a saved preset name', () => {
  assert.equal(chipLabel({
    mode: 'interval', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 100, durationMs: 60_000,
  }), '1M');
  assert.equal(chipLabel({
    mode: 'interval', workMs: 45_000, restMs: 15_000, warmupMs: 0, rounds: 10, durationMs: 45_000,
  }), '45/15');
  assert.equal(configsEqual(
    { mode: 'countdown', workMs: 1, restMs: 0, warmupMs: 0, rounds: 1, durationMs: 300_000 },
    { mode: 'countdown', workMs: 1, restMs: 0, warmupMs: 0, rounds: 1, durationMs: 300_000 },
  ), true);
});
