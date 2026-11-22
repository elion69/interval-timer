import assert from 'node:assert/strict';
import test from 'node:test';
import { createTimerRack } from '../src/timer/rack.js';
import { normalizeSaved } from '../src/timer/storage.js';

function harness() {
  let now = 1_000_000;
  const cues = [];
  const rack = createTimerRack({
    now: () => now,
    schedule: () => 1,
    clear: () => {},
  });
  rack.on('cue', (event) => {
    cues.push({
      id: event.id,
      voice: event.voice,
      kind: event.cue.kind === 'tick' ? `tick:${event.cue.second}` : event.cue.kind === 'phase' ? `phase:${event.cue.phase.type}` : event.cue.kind,
    });
  });
  return {
    rack,
    cues,
    advance(ms) {
      now += ms;
      rack.sync();
    },
  };
}

test('an interval and a countdown run on one clock without disturbing each other', () => {
  const { rack, advance, cues } = harness();
  const interval = rack.add({
    mode: 'interval', workMs: 20 * 60_000, restMs: 5 * 60_000, warmupMs: 0, rounds: 2,
  }, { label: '20/5' });
  const countdown = rack.add({ mode: 'countdown', durationMs: 10 * 60_000 }, { label: '10:00' });
  assert.equal(interval.voice, 0);
  assert.equal(countdown.voice, 1);
  interval.timer.start();
  countdown.timer.start();
  advance(10 * 60_000);

  const left = interval.timer.getSnapshot();
  const right = countdown.timer.getSnapshot();
  assert.equal(left.status, 'running');
  assert.equal(left.phase.type, 'work');
  assert.equal(left.phase.remainingMs, 10 * 60_000);
  assert.equal(right.status, 'complete');
  assert.equal(right.totalRemainingMs, 0);

  interval.timer.pause();
  advance(60_000);
  assert.equal(interval.timer.getSnapshot().phase.remainingMs, 10 * 60_000);
  assert.equal(countdown.timer.getSnapshot().status, 'complete');

  const voices = new Set(cues.map((cue) => cue.voice));
  assert.deepEqual([...voices].sort(), [0, 1]);
  assert.equal(cues.filter((cue) => cue.voice === 1 && cue.kind === 'complete').length, 1);
  rack.destroy();
});

test('pausing one timer does not freeze the other', () => {
  const { rack, advance } = harness();
  const a = rack.add({ mode: 'countdown', durationMs: 60_000 });
  const b = rack.add({ mode: 'countdown', durationMs: 60_000 });
  a.timer.start();
  b.timer.start();
  advance(5_000);
  a.timer.pause();
  advance(7_000);
  assert.equal(a.timer.getSnapshot().phase.remainingMs, 55_000);
  assert.equal(a.timer.getSnapshot().status, 'paused');
  assert.equal(b.timer.getSnapshot().phase.remainingMs, 48_000);
  assert.equal(b.timer.getSnapshot().status, 'running');
  rack.destroy();
});

test('a background jump catches every timer up from the timestamp', () => {
  const { rack, advance } = harness();
  const interval = rack.add({
    mode: 'interval', workMs: 60_000, restMs: 30_000, warmupMs: 0, rounds: 4,
  });
  const countdown = rack.add({ mode: 'countdown', durationMs: 90_000 });
  interval.timer.start();
  countdown.timer.start();
  advance(75_000);
  assert.equal(interval.timer.getSnapshot().phase.type, 'rest');
  assert.equal(interval.timer.getSnapshot().phase.remainingMs, 15_000);
  assert.equal(countdown.timer.getSnapshot().phase.remainingMs, 15_000);
  rack.destroy();
});

test('skip and remove stay on one timer, and the freed beep is reused', () => {
  const { rack } = harness();
  const a = rack.add({ mode: 'interval', workMs: 30_000, restMs: 10_000, rounds: 3 });
  const b = rack.add({ mode: 'countdown', durationMs: 30_000 });
  a.timer.start();
  b.timer.start();
  a.timer.skip();
  assert.equal(a.timer.getSnapshot().phase.type, 'rest');
  assert.equal(b.timer.getSnapshot().phase.type, 'countdown');
  assert.equal(b.timer.getSnapshot().phase.remainingMs, 30_000);
  rack.focus(b.id);
  assert.equal(rack.focused().id, b.id);
  rack.remove(a.id);
  assert.equal(rack.list().length, 1);
  const c = rack.add({ mode: 'countdown', durationMs: 5_000 });
  assert.equal(c.voice, 0);
  rack.remove(b.id);
  assert.equal(rack.list().length, 1);
  assert.equal(rack.focused().id, c.id);
  rack.destroy();
});

test('saved state keeps several timers and still reads the old single-timer shape', () => {
  const modern = normalizeSaved({
    sound: false,
    focusId: 't2',
    timers: [
      { id: 't1', voice: 0, label: '20/5', config: { mode: 'interval', workMs: 1_200_000, restMs: 300_000, rounds: 4 }, run: { status: 'running', origin: 50 } },
      { id: 't2', voice: 1, label: '5:00', config: { mode: 'countdown', durationMs: 300_000 }, run: { status: 'paused', elapsedMs: 1000 } },
    ],
  });
  assert.equal(modern.focusId, 't2');
  assert.equal(modern.timers[0].config.workMs, 1_200_000);
  assert.equal(modern.timers[0].run.origin, 50);
  assert.equal(modern.timers[1].run.elapsedMs, 1000);
  assert.equal(modern.sound, false);

  const legacy = normalizeSaved({
    config: { mode: 'interval', workMs: 60_000, restMs: 0, rounds: 100 },
    run: { status: 'paused', elapsedMs: 2000 },
  });
  assert.equal(legacy.timers.length, 1);
  assert.equal(legacy.timers[0].config.rounds, 100);
  assert.equal(legacy.timers[0].run.elapsedMs, 2000);
});
