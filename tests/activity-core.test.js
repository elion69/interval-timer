import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, localIso, makeEvent, totalFor, progress, undoTarget, shiftDay,
  acceptTap, milestones, bursts, nextBatch, applyAck, backoffMs, sessionEvent, voidedIds, encodeSetup, decodeSetup,
} from '../src/activity/activity-core.js';

const CT = 'America/Chicago';
const at = (iso) => Date.parse(iso);
const R3 = { resetHour: 3 };

test('dayKey: default rollover is midnight', () => {
  assert.equal(dayKey(at('2026-11-26T23:59:59-06:00')), '2026-11-26');
  assert.equal(dayKey(at('2026-11-27T00:00:00-06:00')), '2026-11-27');
});

test('dayKey: with a 3 AM rollover, before 3 AM belongs to the previous day', () => {
  assert.equal(dayKey(at('2026-11-27T02:59:00-06:00'), R3), '2026-11-26');
  assert.equal(dayKey(at('2026-11-27T03:00:00-06:00'), R3), '2026-11-27');
});

test('dayKey: month and year rollback', () => {
  assert.equal(dayKey(at('2027-01-01T01:30:00-06:00'), R3), '2026-12-31');
  assert.equal(dayKey(at('2026-12-01T00:10:00-06:00'), R3), '2026-11-30');
  assert.equal(dayKey(at('2027-01-01T00:00:01-06:00')), '2027-01-01');
});

test('dayKey: DST spring forward and fall back', () => {
  assert.equal(dayKey(at('2027-03-14T01:59:00-06:00'), R3), '2027-03-13');
  assert.equal(dayKey(at('2027-03-14T03:00:00-05:00')), '2027-03-14');
  assert.equal(dayKey(at('2027-11-07T01:30:00-05:00'), R3), '2027-11-06');
  assert.equal(dayKey(at('2027-11-07T01:30:00-06:00')), '2027-11-07');
});

test('dayKey: travel zone', () => {
  assert.equal(dayKey(at('2026-11-27T01:00:00Z'), { tz: 'Europe/Lisbon', resetHour: 3 }), '2026-11-26');
  assert.equal(dayKey(at('2026-11-27T01:00:00Z'), { tz: 'Europe/Lisbon' }), '2026-11-27');
});

test('shiftDay crosses months and years', () => {
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

test('localIso carries the right offset across DST', () => {
  assert.equal(localIso(at('2026-11-27T07:14:03.412-06:00'), CT), '2026-11-27T07:14:03.412-06:00');
  assert.equal(localIso(at('2027-07-01T12:00:00.000-05:00'), CT), '2027-07-01T12:00:00.000-05:00');
  assert.equal(localIso(at('2026-11-27T12:00:00.000Z'), 'UTC'), '2026-11-27T12:00:00.000+00:00');
});

const ev = (id, iso, counter, delta, extra = {}) =>
  makeEvent({ app: 'counter', type: 'count', counter, delta, ...extra }, { id, now: at(iso) });

test('makeEvent stamps time, day and schema', () => {
  const e = ev('a', '2026-11-27T07:00:00-06:00', 'dp-breathe', 1);
  assert.equal(e.v, 1);
  assert.equal(e.day, '2026-11-27');
  assert.equal(e.at, '2026-11-27T07:00:00.000-06:00');
  assert.throws(() => makeEvent({ type: 'count' }));
});

test('totals: plus, minus, undo voids, order-independent', () => {
  const list = [
    ev('1', '2026-11-27T07:00:00-06:00', 'pushup', 1),
    ev('2', '2026-11-27T07:00:01-06:00', 'pushup', 1),
    ev('3', '2026-11-27T07:00:02-06:00', 'pushup', 1),
    ev('4', '2026-11-27T07:00:03-06:00', 'pushup', -1),
    makeEvent({ app: 'counter', type: 'undo', counter: 'pushup', undoes: '2' }, { id: 'u', now: at('2026-11-27T07:00:05-06:00') }),
    ev('5', '2026-11-27T07:10:00-06:00', 'pullup', 5),
  ];
  assert.equal(totalFor(list, 'pushup', '2026-11-27'), 1);
  assert.equal(totalFor([...list].reverse(), 'pushup', '2026-11-27'), 1);
  assert.equal(totalFor(list, 'pullup', '2026-11-27'), 5);
  assert.deepEqual([...voidedIds(list)], ['2']);
});

test('progress toward a daily minimum', () => {
  assert.deepEqual(progress(37, 50), { value: 37, min: 50, met: false, left: 13, pct: 0.74 });
  assert.equal(progress(50, 50).met, true);
  assert.equal(progress(260, 250).pct, 1);
  assert.equal(progress(5, 0).met, false);
});

test('undoTarget: newest active tap, skips voided, respects window and device', () => {
  const now = at('2026-11-27T07:05:00-06:00');
  const list = [
    ev('1', '2026-11-27T07:00:00-06:00', 'pushup', 1),
    ev('2', '2026-11-27T07:04:00-06:00', 'pushup', 1),
    makeEvent({ app: 'counter', type: 'undo', undoes: '2' }, { id: 'u', now }),
  ];
  assert.equal(undoTarget(list, { now }).id, '1');
  assert.equal(undoTarget(list, { now: now + 20 * 60000 }), null);
  assert.equal(undoTarget(list, { now, device: 'tablet' }), null);
});

test('milestones: target, every 10, a mala at 108, once per jump', () => {
  assert.deepEqual(milestones(9, 10, { every: 10 }), ['every']);
  assert.deepEqual(milestones(10, 11, { every: 10 }), []);
  assert.deepEqual(milestones(245, 255, { every: 10, min: 250 }), ['target', 'every']);
  assert.deepEqual(milestones(250, 251, { min: 250 }), []);
  assert.deepEqual(milestones(107, 108, { every: 108 }), ['mala']);
  assert.deepEqual(milestones(11, 10, { every: 10 }), []);
});

test('acceptTap debounces finger bounce', () => {
  assert.equal(acceptTap(null, 1000), true);
  assert.equal(acceptTap(1000, 1080), false);
  assert.equal(acceptTap(1000, 1120), true);
});

test('bursts: 10-minute gap splits blocks, groups merge counters, undo keeps the id', () => {
  const groupOf = (c) => (['dp-breathe', 'wh-rounds'].includes(c) ? 'breath' : 'strength');
  const list = [
    ev('a', '2026-11-27T05:10:00-06:00', 'dp-breathe', 1),
    ev('b', '2026-11-27T05:12:00-06:00', 'dp-breathe', 1),
    ev('c', '2026-11-27T05:15:00-06:00', 'wh-rounds', 1),
    ev('d', '2026-11-27T05:40:00-06:00', 'dp-breathe', 1),
    ev('e', '2026-11-27T05:11:00-06:00', 'pushup', 1),
  ];
  const now = at('2026-11-27T06:00:00-06:00');
  const b1 = bursts(list, { groupOf, now });
  assert.equal(b1.length, 3);
  const first = b1.find((b) => b.id === 'breath:a');
  assert.equal(first.taps, 3);
  assert.equal(first.total, 3);
  assert.equal(first.closed, true);
  const undo = makeEvent({ app: 'counter', type: 'undo', undoes: 'a' }, { id: 'u', now });
  const again = bursts([...list, undo], { groupOf, now }).find((b) => b.id === 'breath:a');
  assert.equal(again.total, 2);
  assert.equal(again.taps, 3);
});

test('outbox helpers: oldest first, ack removes accepted and duplicates', () => {
  const box = [{ id: 'x', ms: 3 }, { id: 'y', ms: 1 }, { id: 'z', ms: 2 }];
  assert.deepEqual(nextBatch(box, 2).map((e) => e.id), ['y', 'z']);
  assert.deepEqual(applyAck(box, { ok: true, accepted: ['y'], dup: ['z'] }).map((e) => e.id), ['x']);
  assert.equal(applyAck(box, { ok: false }).length, 3);
});

test('backoff doubles and caps', () => {
  assert.equal(backoffMs(1), 5000);
  assert.equal(backoffMs(2), 10000);
  assert.equal(backoffMs(20), 600000);
});

test('setup code round-trips and refuses anything that is not a ledger', () => {
  const url = 'https://script.google.com/macros/s/AKfy123/exec';
  assert.deepEqual(decodeSetup(encodeSetup({ url, key: 'k1' })), { url, key: 'k1' });
  assert.throws(() => decodeSetup('hello'), /not a ledger/);
  assert.throws(() => decodeSetup(Buffer.from(JSON.stringify({ v: 1, url: 'https://evil.example/x', key: 'k' })).toString('base64')), /not a ledger/);
  assert.throws(() => decodeSetup(''), /Paste/);
});

test('timer session event', () => {
  const e = sessionEvent({
    workout: 'Tabata', mode: 'interval',
    startedMs: at('2026-11-27T17:05:00-06:00'), endedMs: at('2026-11-27T17:25:30-06:00'),
    pausedMs: 30000, roundsDone: 8, roundsPlanned: 8, completed: true, workS: 20, restS: 10,
  }, { id: 's1' });
  assert.equal(e.type, 'session');
  assert.equal(e.active_s, 1200);
  assert.equal(e.day, '2026-11-27');
  assert.equal(e.ended_at, '2026-11-27T17:25:30.000-06:00');
});
