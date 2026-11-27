import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionLogger } from '../src/timer/session-logger.js';
import { createTimerRack } from '../src/timer/rack.js';

function fakeRack() {
  const l = new Map();
  return { on(t, fn) { l.set(t, fn); return () => l.delete(t); }, emit(t, p) { l.get(t)?.(p); } };
}
function memStore() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; }
const snap = (status, round = 1, rounds = 8) => ({ status, mode: 'interval', round, rounds, config: { workMs: 20000, restMs: 10000 } });

test('one completed workout with a pause becomes one session event', () => {
  const rack = fakeRack(); const out = []; let t = Date.parse('2026-11-27T17:00:00-06:00');
  createSessionLogger({ rack, log: (e) => out.push(e), labelOf: () => 'Tabata', now: () => t, store: memStore() });
  rack.emit('change', { id: 't1', snap: snap('running') });
  t += 60000; rack.emit('change', { id: 't1', snap: snap('running', 2) });
  t += 30000; rack.emit('change', { id: 't1', snap: snap('paused', 3) });
  t += 45000; rack.emit('change', { id: 't1', snap: snap('running', 3) });
  t += 150000; rack.emit('complete', { id: 't1', snap: snap('complete', 8) });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'Tabata');
  assert.equal(out[0].active_s, 240);
  assert.equal(out[0].paused_s, 45);
  assert.equal(out[0].completed, true);
  assert.equal(out[0].rounds_done, 8);
  assert.equal(out[0].app, 'timer');
});

test('a quick start-and-stop is not logged; a real early stop is', () => {
  const rack = fakeRack(); const out = []; let t = 1800000000000;
  createSessionLogger({ rack, log: (e) => out.push(e), now: () => t, store: memStore() });
  rack.emit('change', { id: 't1', snap: snap('running') });
  t += 10000; rack.emit('change', { id: 't1', snap: snap('idle') });
  assert.equal(out.length, 0);
  rack.emit('change', { id: 't1', snap: snap('running') });
  t += 290000; rack.emit('change', { id: 't1', snap: snap('running', 5) });
  t += 10000; rack.emit('change', { id: 't1', snap: snap('idle', 0) });
  assert.equal(out.length, 1);
  assert.equal(out[0].completed, false);
  assert.equal(out[0].rounds_done, 4);
});

test('an open session survives a reload', () => {
  const store = memStore(); const out = []; let t = 1800000000000;
  const r1 = fakeRack();
  createSessionLogger({ rack: r1, log: (e) => out.push(e), now: () => t, store });
  r1.emit('change', { id: 't1', snap: snap('running') });
  t += 600000;
  const r2 = fakeRack();
  const lg = createSessionLogger({ rack: r2, log: (e) => out.push(e), now: () => t, store });
  assert.equal(lg.openCount(), 1);
  r2.emit('complete', { id: 't1', snap: snap('complete', 8) });
  assert.equal(out.length, 1);
  assert.equal(out[0].active_s, 600);
});

test('works with the real rack and engine: a finished 2-round workout logs once', () => {
  let t = 1800000000000;
  const timers = [];
  const clock = { now: () => t, schedule: (fn, ms) => { timers.push({ fn, at: t + ms }); return timers.length; }, clear: () => {} };
  const rack = createTimerRack(clock);
  const out = [];
  createSessionLogger({ rack, log: (e) => out.push(e), labelOf: (id) => rack.list().find((s) => s.id === id)?.label, now: () => t, store: memStore() });
  const s = rack.add({ mode: 'interval', workMs: 20000, restMs: 10000, rounds: 2 }, { label: 'Test 2x' });
  s.timer.start();
  t += 60000;
  rack.sync();
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'Test 2x');
  assert.equal(out[0].completed, true);
  assert.equal(out[0].active_s, 50);
});
