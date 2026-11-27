// activity-core.js v1 — pure logic shared by Counter, Interval Timer and the ledger script.
// Keep this file identical in elion69/counter and elion69/interval-timer (version line above).
// No DOM, no storage, no network: safe to unit-test in Node and to paste into Apps Script
// (scripts/build-gas.mjs strips the word "export" to make gas/Core.gs).

export const SCHEMA_VERSION = 1;
export const DEFAULT_TZ = 'America/Chicago';
export const DEFAULT_RESET_HOUR = 0; // midnight; a setting can move it (e.g. 3 = late-night sets count for the day before)

const partsCache = new Map();
function fmt(tz) {
  if (!partsCache.has(tz)) {
    partsCache.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return partsCache.get(tz);
}

/** The phone's own time zone, falling back to Central. */
export function deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ; } catch (e) { return DEFAULT_TZ; }
}

/** Local wall-clock parts of an instant in a time zone. */
export function localParts(ms, tz = DEFAULT_TZ) {
  const out = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out; // { year, month, day, hour, minute, second }
}

function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** The activity day an instant belongs to: the local date, minus one day before the reset hour. */
export function dayKey(ms, { tz = DEFAULT_TZ, resetHour = DEFAULT_RESET_HOUR } = {}) {
  const p = localParts(ms, tz);
  if (p.hour >= resetHour) return ymd(p.year, p.month, p.day);
  const prev = new Date(Date.UTC(p.year, p.month - 1, p.day) - 86400000);
  return ymd(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate());
}

/** The day before / after a YYYY-MM-DD key. */
export function shiftDay(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** ISO 8601 with the zone's own offset, e.g. 2026-11-27T07:14:03.412-06:00 */
export function localIso(ms, tz = DEFAULT_TZ) {
  const p = localParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offsetMin = Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const msPart = String(((ms % 1000) + 1000) % 1000).padStart(3, '0');
  return `${ymd(p.year, p.month, p.day)}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}.${msPart}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function newId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/** Build one event. `id` and `now` are injectable for tests. */
export function makeEvent(fields, { now = Date.now(), id, tz = DEFAULT_TZ, resetHour = DEFAULT_RESET_HOUR, device = 'phone' } = {}) {
  if (!fields || !fields.app || !fields.type) throw new Error('event needs app and type');
  return {
    v: SCHEMA_VERSION,
    id: id || newId(),
    app: fields.app,
    device,
    ms: now,
    at: localIso(now, tz),
    day: dayKey(now, { tz, resetHour }),
    ...fields,
  };
}

/** Ids of events that a later undo cancels. */
export function voidedIds(events) {
  const out = new Set();
  for (const e of events) if (e.type === 'undo' && e.undoes) out.add(e.undoes);
  return out;
}

export const COUNTING_TYPES = ['count', 'set', 'reset'];
const COUNTING = new Set(COUNTING_TYPES);

/** Net value per counter per day. Order-independent: every change is stored as a delta. */
export function dailyTotals(events) {
  const voided = voidedIds(events);
  const totals = new Map(); // day -> Map(counter -> total)
  for (const e of events) {
    if (!COUNTING.has(e.type) || voided.has(e.id)) continue;
    if (!totals.has(e.day)) totals.set(e.day, new Map());
    const m = totals.get(e.day);
    m.set(e.counter, (m.get(e.counter) || 0) + (Number(e.delta) || 0));
  }
  return totals;
}

export function totalFor(events, counter, day) {
  const d = dailyTotals(events).get(day);
  return (d && d.get(counter)) || 0;
}

/** Target progress for one counter: { value, min, met, left, pct } */
export function progress(value, min) {
  const target = Number(min) || 0;
  if (!target) return { value, min: 0, met: false, left: 0, pct: 0 };
  return {
    value,
    min: target,
    met: value >= target,
    left: Math.max(0, target - value),
    pct: Math.max(0, Math.min(1, value / target)),
  };
}

/**
 * The most recent still-active tap that Undo should cancel.
 * Only taps from this device in the last `windowMs`, newest first.
 */
export function undoTarget(events, { now = Date.now(), windowMs = 10 * 60000, device } = {}) {
  const voided = voidedIds(events);
  let best = null;
  for (const e of events) {
    if (!COUNTING.has(e.type) || voided.has(e.id)) continue;
    if (device && e.device !== device) continue;
    if (now - e.ms > windowMs) continue;
    if (!best || e.ms > best.ms) best = e;
  }
  return best;
}

/**
 * Which milestone buzzes a change earns. A +10 that jumps past a multiple still buzzes once.
 * 'target' = the daily minimum was just reached; 'every' = crossed a multiple of `every`; 'mala' = crossed a 108.
 */
export function milestones(before, after, { every = 0, min = 0 } = {}) {
  const out = [];
  if (!(after > before)) return out;
  if (min > 0 && before < min && after >= min) out.push('target');
  if (every > 0 && Math.floor(after / every) > Math.floor(before / every)) out.push(every === 108 ? 'mala' : 'every');
  return out;
}

/** Finger-bounce guard: a second tap on the same button inside `minGapMs` is ignored. */
export function acceptTap(lastTapMs, now, minGapMs = 120) {
  return lastTapMs == null || now - lastTapMs >= minGapMs;
}

/**
 * Group count events into bursts for the calendar.
 * `groupOf(counter)` puts related counters in one block (e.g. all breath counters).
 * Boundaries use every count event (voided ones too) so a burst id never changes after an undo;
 * the net count leaves voided taps out. A burst is closed once its last tap is older than gapMs.
 */
export function bursts(events, { gapMs = 10 * 60000, groupOf = (c) => c, now = Date.now() } = {}) {
  const voided = voidedIds(events);
  const byGroup = new Map();
  for (const e of events) {
    if (e.type !== 'count') continue;
    const g = groupOf(e.counter);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(e);
  }
  const out = [];
  for (const [group, list] of byGroup) {
    list.sort((a, b) => a.ms - b.ms || (a.id < b.id ? -1 : 1));
    let cur = null;
    for (const e of list) {
      if (!cur || e.ms - cur.endMs > gapMs) {
        cur = { id: `${group}:${e.id}`, group, startMs: e.ms, endMs: e.ms, taps: 0, net: new Map(), day: e.day };
        out.push(cur);
      }
      cur.endMs = e.ms;
      cur.taps += 1;
      if (!voided.has(e.id)) cur.net.set(e.counter, (cur.net.get(e.counter) || 0) + (Number(e.delta) || 0));
    }
  }
  for (const b of out) {
    b.closed = now - b.endMs > gapMs;
    b.total = [...b.net.values()].reduce((s, n) => s + n, 0);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Next batch to send: oldest first, at most `max`. */
export function nextBatch(outbox, max = 200) {
  return [...outbox].sort((a, b) => a.ms - b.ms).slice(0, max);
}

/** Remove acknowledged ids (accepted or already-there duplicates) from the outbox. */
export function applyAck(outbox, ack) {
  if (!ack || ack.ok !== true) return outbox;
  const done = new Set([...(ack.accepted || []), ...(ack.dup || [])]);
  return outbox.filter((e) => !done.has(e.id));
}

/** Retry delay after a failed flush: 5 s, 10 s, 20 s ... capped at 10 min. */
export function backoffMs(failures) {
  return Math.min(10 * 60000, 5000 * Math.pow(2, Math.max(0, failures - 1)));
}

/** Setup code shared by every app: base64 of { v, url, key }. */
export function encodeSetup({ url, key }) {
  const json = JSON.stringify({ v: 1, url, key });
  return (typeof btoa === 'function') ? btoa(json) : Buffer.from(json).toString('base64');
}

export function decodeSetup(code) {
  const raw = String(code || '').trim();
  if (!raw) throw new Error('Paste the setup code first.');
  let data;
  try {
    const json = (typeof atob === 'function') ? atob(raw) : Buffer.from(raw, 'base64').toString('utf8');
    data = JSON.parse(json);
  } catch (e) {
    throw new Error('That is not a ledger setup code.');
  }
  if (!data || data.v !== 1 || !/^https:\/\/script\.google(usercontent)?\.com\//.test(String(data.url)) || !data.key) {
    throw new Error('That is not a ledger setup code.');
  }
  return { url: data.url, key: data.key };
}

/**
 * One session event: an Interval Timer workout, or (reserved) a metronome practice session.
 * `extra` carries app-specific fields, e.g. for the metronome { palo, bpm_min, bpm_max, preset }.
 */
export function sessionEvent({ app = 'timer', workout, mode, startedMs, endedMs, pausedMs = 0, roundsDone = 0, roundsPlanned = null, completed = false, workS = null, restS = null, extra = {} }, opts = {}) {
  const activeS = Math.max(0, Math.round((endedMs - startedMs - pausedMs) / 1000));
  return makeEvent({
    ...extra,
    app,
    type: 'session',
    counter: `${app}:${String(workout || mode || app).toLowerCase()}`,
    label: workout || mode,
    mode,
    started_at: localIso(startedMs, opts.tz),
    ended_at: localIso(endedMs, opts.tz),
    active_s: activeS,
    paused_s: Math.round(pausedMs / 1000),
    rounds_done: roundsDone,
    rounds_planned: roundsPlanned,
    completed,
    work_s: workS,
    rest_s: restS,
  }, { ...opts, now: startedMs });
}
