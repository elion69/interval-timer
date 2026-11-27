// outbox.js v1 — on-phone queue shared by every app on elion69.github.io.
// Keep identical in elion69/counter and elion69/interval-timer.
// Every event is written to IndexedDB ("activity-log": stores "events" and "outbox") before anything
// is sent; the flush logic takes a store and a fetch so it can be tested in Node.
import { nextBatch, applyAck, backoffMs, decodeSetup } from './activity-core.js';

export const LEDGER_KEY = 'activity.ledger.v1'; // { url, key } — pasting the setup code in either app connects both
export const SYNC_KEY = 'activity.sync.v1';     // { lastOkMs, lastError, lastErrorMs }

// One sender at a time across both apps and all tabs on the same address (Web Locks), when the browser has it.
const defaultLock = (fn) => (globalThis.navigator && navigator.locks ? navigator.locks.request('activity-flush', fn) : fn());

function readJson(key, fallback) {
  try { const v = globalThis.localStorage && localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function writeJson(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
}

export function getLedger() { return readJson(LEDGER_KEY, null); }
export function setLedgerFromCode(code) { const l = decodeSetup(code); writeJson(LEDGER_KEY, l); return l; }
export function clearLedger() { writeJson(LEDGER_KEY, null); }
export function syncStatus() { return readJson(SYNC_KEY, {}); }
function noteSync(patch) { writeJson(SYNC_KEY, { ...syncStatus(), ...patch }); }

export function createOutbox({ store, fetchFn = globalThis.fetch && globalThis.fetch.bind(globalThis), getLedger: ledgerFn = getLedger, now = () => Date.now(), lock = defaultLock, onStatus = () => {}, record = noteSync }) {
  let failures = 0;
  let nextTryAt = 0;

  async function add(event) {
    await store.put(event); // saved before anything is sent
  }

  async function post(ledger, body, keepalive) {
    const res = await fetchFn(ledger.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // no CORS preflight
      credentials: 'omit',                                    // no Google cookies: works with any accounts signed in
      redirect: 'follow',
      keepalive,                                              // lets a send finish while the page is closing
      body: JSON.stringify({ key: ledger.key, ...body }),
    });
    return res.json();
  }

  /** Send what's waiting. Returns { sent, waiting, error? }. */
  async function flush({ max = 200, force = false, keepalive = false } = {}) {
    const result = await lock(async () => {
      const ledger = ledgerFn(); // { url, key } from the pasted setup code, or null
      const waitingBefore = await store.all();
      if (!ledger || !waitingBefore.length) return { sent: 0, waiting: waitingBefore.length };
      if (!force && now() < nextTryAt) return { sent: 0, waiting: waitingBefore.length, error: 'backing_off' };
      let sent = 0;
      let box = waitingBefore;
      while (box.length) {
        const batch = nextBatch(box, max);
        let ack;
        try {
          ack = await post(ledger, { op: 'append', events: batch }, keepalive);
        } catch (err) {
          ack = { ok: false, error: String(err) };
        }
        if (!ack || ack.ok !== true) {
          failures += 1;
          nextTryAt = now() + backoffMs(failures);
          const error = (ack && ack.error) || 'send_failed';
          record({ lastError: error, lastErrorMs: now() });
          return { sent, waiting: box.length, error };
        }
        const done = new Set([...(ack.accepted || []), ...(ack.dup || []), ...(ack.rejected || [])]);
        for (const id of done) await store.remove(id);
        sent += (ack.accepted || []).length;
        const after = applyAck(box, { ok: true, accepted: [...done] });
        if (after.length === box.length) break; // nothing moved: stop rather than loop
        box = after;
      }
      failures = 0;
      nextTryAt = 0;
      record({ lastOkMs: now(), lastError: null });
      return { sent, waiting: box.length };
    });
    onStatus(result);
    return result;
  }

  /** Ask the ledger if it's reachable and the key is right (sends nothing). */
  async function test() {
    const ledger = ledgerFn();
    if (!ledger) return { ok: false, error: 'not_connected' };
    try { return await post(ledger, { op: 'ping' }, false); } catch (err) { return { ok: false, error: String(err) }; }
  }

  /** Every event the ledger holds since a moment (restore after clearing the phone). */
  async function since(sinceMs, app) {
    const ledger = ledgerFn();
    if (!ledger) return { ok: false, error: 'not_connected' };
    try { return await post(ledger, { op: 'since', since: sinceMs, app }, false); } catch (err) { return { ok: false, error: String(err) }; }
  }

  return { add, flush, test, since, waiting: async () => (await store.all()).length };
}

/** Real store: IndexedDB database "activity-log", "outbox" and "events" keyed by event id. (Runs only in a browser.) */
export function idbStore(dbName = 'activity-log') {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' }).createIndex('day', 'day');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbp = null; };
      resolve(db);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
  }));
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(stores, mode);
      const out = fn(t);
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    put: (ev) => tx(['outbox', 'events'], 'readwrite', (t) => { t.objectStore('events').put(ev); t.objectStore('outbox').put(ev); }),
    /** Save events that came from the ledger (restore) without sending them back. */
    putHistory: (list) => tx(['events'], 'readwrite', (t) => { for (const ev of list) t.objectStore('events').put(ev); }),
    remove: (id) => tx(['outbox'], 'readwrite', (t) => { t.objectStore('outbox').delete(id); }),
    all: () => tx(['outbox'], 'readonly', (t) => t.objectStore('outbox').getAll()),
    byDay: (day) => tx(['events'], 'readonly', (t) => t.objectStore('events').index('day').getAll(day)),
    get: (id) => tx(['events'], 'readonly', (t) => t.objectStore('events').get(id)),
    everything: () => tx(['events'], 'readonly', (t) => t.objectStore('events').getAll()),
  };
}

/** Wire the flush triggers once per app. Returns { afterTap } to call after every saved event. */
export function startFlushing(outbox, { debounceMs = 4000, maxWaitMs = 60000 } = {}) {
  let timer = null;
  let firstPendingAt = null;
  const soon = () => {
    const t = Date.now();
    if (firstPendingAt == null) firstPendingAt = t;
    clearTimeout(timer);
    const wait = Math.min(debounceMs, Math.max(0, firstPendingAt + maxWaitMs - t));
    timer = setTimeout(() => { firstPendingAt = null; outbox.flush(); }, wait);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') outbox.flush({ max: 100, force: true, keepalive: true });
    else outbox.flush({ force: true });
  });
  addEventListener('online', () => outbox.flush({ force: true }));
  setInterval(() => outbox.flush(), 60000);
  outbox.flush({ force: true });
  return { afterTap: soon };
}
