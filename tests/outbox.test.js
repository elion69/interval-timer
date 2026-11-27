import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOutbox } from '../src/activity/outbox.js';

function memStore() {
  const m = new Map();
  return { put: async (e) => m.set(e.id, e), remove: async (id) => m.delete(id), all: async () => [...m.values()], m };
}
const ledger = () => ({ url: 'https://script.google.com/macros/s/x/exec', key: 'k' });
const e = (id, ms) => ({ id, ms });
const quiet = { record: () => {}, lock: (fn) => fn() };

test('sends oldest first in batches and clears what the ledger acknowledged', async () => {
  const store = memStore(); const bodies = [];
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body); bodies.push(body);
    assert.equal(opts.credentials, 'omit');
    assert.match(opts.headers['Content-Type'], /^text\/plain/);
    return { json: async () => ({ ok: true, accepted: body.events.map((x) => x.id), dup: [] }) };
  };
  const ob = createOutbox({ store, fetchFn, getLedger: ledger, ...quiet });
  for (let i = 5; i >= 1; i--) await ob.add(e('e' + i, i));
  const r = await ob.flush({ max: 2 });
  assert.deepEqual(r, { sent: 5, waiting: 0 });
  assert.deepEqual(bodies.map((b) => b.events.map((x) => x.id)), [['e1', 'e2'], ['e3', 'e4'], ['e5']]);
});

test('offline: nothing is lost, it backs off, and the next try sends it', async () => {
  const store = memStore(); let online = false; let t = 0;
  const fetchFn = async (url, opts) => {
    if (!online) throw new TypeError('Failed to fetch');
    const body = JSON.parse(opts.body);
    return { json: async () => ({ ok: true, accepted: [], dup: body.events.map((x) => x.id) }) };
  };
  const ob = createOutbox({ store, fetchFn, getLedger: ledger, now: () => t, ...quiet });
  await ob.add(e('a', 1));
  assert.equal((await ob.flush()).error, 'TypeError: Failed to fetch');
  assert.equal(await ob.waiting(), 1);
  assert.equal((await ob.flush()).error, 'backing_off');
  online = true; t = 10000;
  assert.deepEqual(await ob.flush(), { sent: 0, waiting: 0 });
});

test('no ledger connected yet: keeps everything, sends nothing', async () => {
  const store = memStore(); let called = false;
  const ob = createOutbox({ store, fetchFn: async () => { called = true; }, getLedger: () => null, ...quiet });
  await ob.add(e('a', 1));
  assert.deepEqual(await ob.flush(), { sent: 0, waiting: 1 });
  assert.equal(called, false);
});

test('a refused key keeps the events and reports the error', async () => {
  const store = memStore(); const seen = [];
  const ob = createOutbox({ store, fetchFn: async () => ({ json: async () => ({ ok: false, error: 'bad_key' }) }), getLedger: ledger, record: (p) => seen.push(p), lock: (fn) => fn() });
  await ob.add(e('a', 1));
  const r = await ob.flush();
  assert.equal(r.error, 'bad_key');
  assert.equal(await ob.waiting(), 1);
  assert.equal(seen[0].lastError, 'bad_key');
});

test('test() pings without sending events', async () => {
  let body;
  const ob = createOutbox({ store: memStore(), fetchFn: async (u, o) => { body = JSON.parse(o.body); return { json: async () => ({ ok: true }) }; }, getLedger: ledger, ...quiet });
  assert.equal((await ob.test()).ok, true);
  assert.deepEqual(body, { key: 'k', op: 'ping' });
});
