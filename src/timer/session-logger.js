// session-logger.js — watches the rack's status changes and writes ONE "session" event per real workout
// to the Activity Ledger (shared outbox with Counter). A start-and-stop under 30 seconds isn't logged.
import { sessionEvent } from '../activity/activity-core.js';

const OPEN_KEY = 'activity.open-sessions.v1';

export function createSessionLogger({ rack, log, labelOf = () => '', now = () => Date.now(), minActiveS = 30, store = globalThis.localStorage }) {
  // Open sessions survive a reload, so a workout that spans an app restart is still one session.
  const open = new Map(Object.entries(read()));

  function read() {
    try { return JSON.parse((store && store.getItem(OPEN_KEY)) || '{}'); } catch { return {}; }
  }
  function save() {
    try { store && store.setItem(OPEN_KEY, JSON.stringify(Object.fromEntries(open))); } catch { /* storage full: logging still works this run */ }
  }

  function brief(snap) {
    return { mode: snap.mode, round: snap.round, rounds: snap.rounds, workMs: snap.config?.workMs, restMs: snap.config?.restMs, elapsed: snap.totalElapsedMs };
  }

  function onChange({ id, snap }) {
    const t = now();
    const s = open.get(id);
    if (snap.status === 'running') {
      if (!s) open.set(id, { startedMs: t, startElapsed: snap.totalElapsedMs ?? null, pausedMs: 0, pauseStart: null, label: labelOf(id), last: brief(snap) });
      else {
        if (s.pauseStart != null) { s.pausedMs += t - s.pauseStart; s.pauseStart = null; }
        s.last = brief(snap);
      }
      save();
    } else if (snap.status === 'paused') {
      if (s && s.pauseStart == null) { s.pauseStart = t; s.last = brief(snap); save(); }
    } else if (snap.status === 'idle' && s) {
      finish(id, s, t, false); // stopped or reconfigured before the end
    }
  }

  function onComplete({ id, snap }) {
    const s = open.get(id);
    if (!s) return;
    s.last = brief(snap);
    finish(id, s, now(), true);
  }

  function finish(id, s, t, completed) {
    open.delete(id);
    save();
    if (s.pauseStart != null) s.pausedMs += t - s.pauseStart;
    // A finished workout ends when the timer's own clock says so, even if the phone noticed late (screen off).
    const l0 = s.last || {};
    if (completed && l0.elapsed != null && s.startElapsed != null) {
      t = Math.min(t, s.startedMs + s.pausedMs + Math.max(0, l0.elapsed - s.startElapsed));
    }
    const activeS = (t - s.startedMs - s.pausedMs) / 1000;
    if (!completed && activeS < minActiveS) return; // a quick start-and-stop is not a workout
    const l = s.last || {};
    log(sessionEvent({
      workout: labelOf(id) || s.label || l.mode,
      mode: l.mode,
      startedMs: s.startedMs,
      endedMs: t,
      pausedMs: s.pausedMs,
      roundsDone: completed ? (l.rounds ?? l.round ?? 0) : Math.max(0, (l.round || 1) - 1),
      roundsPlanned: l.rounds ?? null,
      completed,
      workS: l.workMs != null ? l.workMs / 1000 : null,
      restS: l.restMs != null ? l.restMs / 1000 : null,
    }));
  }

  const offs = [rack.on('change', onChange), rack.on('complete', onComplete)];
  return { destroy() { offs.forEach((off) => off && off()); }, openCount: () => open.size };
}
