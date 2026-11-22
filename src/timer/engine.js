/**
 * Timestamp-based interval timer.
 *
 * Elapsed time comes from a wall clock (Date.now, or an injected clock), never
 * from counting ticks. A backgrounded tab stays accurate because the next read
 * subtracts the original timestamp. Call sync() from a frame loop and whenever
 * the document becomes visible so phase-change and countdown cues stay aligned
 * with what is on screen.
 *
 * The engine does not touch the DOM, audio, or storage. Embed it and listen.
 */

import { DEFAULT_CONFIG, PHASES } from './presets.js';

const MAX_MS = 24 * 60 * 60 * 1000;
const WAKE_CAP_MS = 30_000;

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeConfig(partial = {}, base = DEFAULT_CONFIG) {
  const merged = { ...base, ...partial };
  const mode = merged.mode === 'countdown' ? 'countdown' : 'interval';
  const unlimited = merged.rounds == null || merged.rounds === 'unlimited';
  return {
    mode,
    workMs: clampInt(merged.workMs, 1000, MAX_MS, 60_000),
    restMs: clampInt(merged.restMs, 0, MAX_MS, 0),
    warmupMs: clampInt(merged.warmupMs, 0, 60 * 60 * 1000, 0),
    rounds: unlimited ? null : clampInt(merged.rounds, 1, 999, 1),
    durationMs: clampInt(merged.durationMs, 1000, MAX_MS, 60_000),
  };
}

/**
 * Expand a config into a concrete plan.
 * Rest is placed between work rounds only — the last round does not end on rest.
 * Unlimited plans are described, not unrolled.
 */
export function planTimer(input) {
  const config = normalizeConfig(input);
  if (config.mode === 'countdown') {
    const durationMs = config.durationMs;
    return {
      config,
      limited: true,
      totalMs: durationMs,
      rounds: 1,
      phases: [{ type: 'countdown', round: 1, durationMs }],
    };
  }

  const { workMs, restMs, warmupMs, rounds } = config;
  if (rounds == null) {
    return { config, limited: false, totalMs: null, rounds: null, phases: null, workMs, restMs, warmupMs };
  }

  const phases = [];
  if (warmupMs > 0) phases.push({ type: 'warmup', round: 0, durationMs: warmupMs });
  for (let round = 1; round <= rounds; round += 1) {
    phases.push({ type: 'work', round, durationMs: workMs });
    if (restMs > 0 && round < rounds) phases.push({ type: 'rest', round, durationMs: restMs });
  }
  const totalMs = phases.reduce((sum, phase) => sum + phase.durationMs, 0);
  return { config, limited: true, totalMs, rounds, phases, workMs, restMs, warmupMs };
}

function describe(type, round, durationMs, elapsedMs, index, startedAtElapsed) {
  const elapsed = Math.min(Math.max(0, elapsedMs), durationMs);
  const meta = PHASES[type];
  return {
    type,
    label: meta.label,
    color: meta.color,
    round,
    index,
    durationMs,
    elapsedMs: elapsed,
    remainingMs: durationMs - elapsed,
    progress: durationMs === 0 ? 1 : elapsed / durationMs,
    startedAtElapsed,
    endsAtElapsed: startedAtElapsed + durationMs,
  };
}

function locateLimited(plan, elapsed) {
  let cursor = 0;
  for (let index = 0; index < plan.phases.length; index += 1) {
    const phase = plan.phases[index];
    const end = cursor + phase.durationMs;
    if (elapsed < end) {
      return describe(phase.type, phase.round, phase.durationMs, elapsed - cursor, index, cursor);
    }
    cursor = end;
  }
  return null;
}

function locateUnlimited(plan, elapsed) {
  let t = Math.max(0, elapsed);
  let ordinal = 0;
  if (plan.warmupMs > 0) {
    if (t < plan.warmupMs) {
      return describe('warmup', 0, plan.warmupMs, t, 0, 0);
    }
    t -= plan.warmupMs;
    ordinal = 1;
  }
  const cycle = plan.workMs + plan.restMs;
  const round = Math.floor(t / cycle) + 1;
  const into = t % cycle;
  const cycleIndex = plan.restMs > 0 ? 2 : 1;
  const base = elapsed - into;
  if (plan.restMs === 0 || into < plan.workMs) {
    const index = ordinal + (round - 1) * cycleIndex;
    return describe('work', round, plan.workMs, into, index, base);
  }
  const restInto = into - plan.workMs;
  const index = ordinal + (round - 1) * cycleIndex + 1;
  return describe('rest', round, plan.restMs, restInto, index, elapsed - restInto);
}

function locate(plan, elapsed) {
  if (!plan.limited) return locateUnlimited(plan, elapsed);
  if (elapsed >= plan.totalMs) return null;
  return locateLimited(plan, elapsed);
}

function roundsRemaining(phase, rounds) {
  if (rounds == null) return null;
  if (!phase || phase.type === 'done') return 0;
  if (phase.type === 'countdown') return null;
  if (phase.type === 'warmup') return rounds;
  if (phase.type === 'work') return rounds - phase.round + 1;
  if (phase.type === 'rest') return Math.max(0, rounds - phase.round);
  return null;
}

function tickBucket(phase) {
  if (!phase || phase.elapsedMs < 80) return null;
  const rem = phase.remainingMs;
  let bucket = null;
  if (rem <= 1000 && rem > 0) bucket = 1;
  else if (rem <= 2000) bucket = 2;
  else if (rem <= 3000) bucket = 3;
  if (!bucket) return null;
  if (phase.durationMs <= bucket * 1000) return null;
  return bucket;
}

function phaseKey(phase) {
  if (!phase) return 'done';
  return `${phase.type}:${phase.round}:${phase.index}`;
}

/**
 * @param {object} [config]
 * @param {{ now?: () => number, schedule?: Function, clear?: Function }} [deps]
 */
export function createIntervalTimer(config, deps = {}) {
  const now = deps.now || (() => Date.now());
  const schedule = deps.schedule || ((fn, ms) => setTimeout(fn, ms));
  const clear = deps.clear || ((id) => clearTimeout(id));

  let current = normalizeConfig(config);
  let plan = planTimer(current);
  let status = 'idle';
  let offsetMs = 0;
  let runStartedAt = null;
  let lastPhaseKey = null;
  let announcedTick = null;
  let lastElapsed = 0;
  let timerId = null;
  let syncing = false;
  const listeners = new Map();

  function on(type, fn) {
    const key = type === 'phaseChange' ? 'phasechange' : type;
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(fn);
    return () => listeners.get(key)?.delete(fn);
  }

  function emit(type, payload) {
    const set = listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function readElapsed() {
    if (status === 'running' && runStartedAt != null) {
      return Math.max(0, offsetMs + (now() - runStartedAt));
    }
    return Math.max(0, offsetMs);
  }

  function donePhase() {
    const last = plan.limited ? plan.phases[plan.phases.length - 1] : null;
    return {
      type: 'done',
      label: 'done',
      color: PHASES.done.color,
      round: last?.round ?? 0,
      index: -1,
      durationMs: last?.durationMs ?? 0,
      elapsedMs: last?.durationMs ?? 0,
      remainingMs: 0,
      progress: 1,
      startedAtElapsed: plan.totalMs ?? 0,
      endsAtElapsed: plan.totalMs ?? 0,
    };
  }

  function snapshotFrom(elapsed, phase) {
    const active = phase || donePhase();
    const totalElapsedMs = plan.limited ? Math.min(elapsed, plan.totalMs) : elapsed;
    return {
      status,
      mode: plan.config.mode,
      phase: {
        type: active.type,
        label: active.label,
        color: active.color,
        round: active.round,
        index: active.index,
        durationMs: active.durationMs,
        elapsedMs: active.elapsedMs,
        remainingMs: active.remainingMs,
        progress: active.progress,
      },
      round: active.type === 'warmup' || active.type === 'done' ? 0 : active.round,
      rounds: plan.rounds,
      roundsRemaining: roundsRemaining(active, plan.rounds),
      totalElapsedMs,
      totalRemainingMs: plan.limited ? Math.max(0, plan.totalMs - totalElapsedMs) : null,
      totalDurationMs: plan.totalMs,
      config: { ...plan.config },
    };
  }

  function getSnapshot() {
    const elapsed = readElapsed();
    if (status === 'complete' || (plan.limited && elapsed >= plan.totalMs && status !== 'idle' && status !== 'paused')) {
      return snapshotFrom(plan.limited ? plan.totalMs : elapsed, null);
    }
    const phase = locate(plan, elapsed);
    if (!phase) return snapshotFrom(plan.limited ? plan.totalMs : elapsed, null);
    return snapshotFrom(elapsed, phase);
  }

  function disarm() {
    if (timerId != null) clear(timerId);
    timerId = null;
  }

  function arm(phase) {
    disarm();
    if (status !== 'running' || !phase) return;
    const rem = phase.remainingMs;
    let delay = rem > 3000 ? rem - 3000 : rem > 2000 ? rem - 2000 : rem > 1000 ? rem - 1000 : rem;
    delay = Math.max(0, Math.min(delay, WAKE_CAP_MS));
    timerId = schedule(() => {
      timerId = null;
      sync();
    }, delay);
  }

  function enterComplete() {
    if (status === 'complete') return getSnapshot();
    status = 'complete';
    if (plan.limited) offsetMs = plan.totalMs;
    runStartedAt = null;
    lastPhaseKey = 'done';
    disarm();
    const snap = getSnapshot();
    emit('complete', snap);
    emit('cue', { kind: 'complete', phase: snap.phase });
    emit('change', snap);
    return snap;
  }

  function sync() {
    if (syncing) return getSnapshot();
    if (status !== 'running') return getSnapshot();
    syncing = true;
    try {
      const elapsed = readElapsed();
      if (plan.limited && elapsed >= plan.totalMs) {
        lastElapsed = plan.totalMs;
        return enterComplete();
      }
      const phase = locate(plan, elapsed);
      if (!phase) {
        lastElapsed = elapsed;
        return enterComplete();
      }
      const key = phaseKey(phase);
      const phaseChanged = key !== lastPhaseKey;
      if (phaseChanged) {
        lastPhaseKey = key;
        announcedTick = null;
      }
      lastElapsed = elapsed;
      const snap = snapshotFrom(elapsed, phase);
      if (phaseChanged) {
        emit('phasechange', snap);
        emit('cue', { kind: 'phase', phase: snap.phase });
      }
      if (status === 'running' && !phaseChanged) {
        const bucket = tickBucket(phase);
        if (bucket && bucket !== announcedTick) {
          announcedTick = bucket;
          emit('cue', { kind: 'tick', second: bucket, phase: snap.phase });
        }
      } else if (status === 'running') {
        announcedTick = tickBucket(phase);
      }
      if (status === 'running') arm(phase);
      else disarm();
      return snap;
    } finally {
      syncing = false;
    }
  }

  function start() {
    if (status === 'running') return getSnapshot();
    if (status === 'complete') {
      offsetMs = 0;
      runStartedAt = null;
      lastPhaseKey = null;
      announcedTick = null;
      lastElapsed = 0;
      status = 'idle';
    }
    status = 'running';
    runStartedAt = now();
    const snap = sync();
    if (status === 'running') emit('change', snap);
    return getSnapshot();
  }

  function pause() {
    if (status !== 'running') return getSnapshot();
    offsetMs = readElapsed();
    runStartedAt = null;
    status = 'paused';
    disarm();
    const snap = getSnapshot();
    emit('change', snap);
    return snap;
  }

  function resume() {
    return start();
  }

  function toggle() {
    if (status === 'running') return pause();
    return start();
  }

  function restart() {
    const keepRunning = status === 'running';
    offsetMs = 0;
    runStartedAt = keepRunning ? now() : null;
    lastPhaseKey = null;
    announcedTick = null;
    lastElapsed = 0;
    status = keepRunning ? 'running' : 'idle';
    disarm();
    if (keepRunning) sync();
    const snap = getSnapshot();
    emit('change', snap);
    return snap;
  }

  function skip() {
    if (status !== 'running' && status !== 'paused') return getSnapshot();
    const elapsed = readElapsed();
    const phase = locate(plan, elapsed);
    if (!phase) return enterComplete();
    const target = phase.endsAtElapsed;
    if (plan.limited && target >= plan.totalMs) {
      offsetMs = plan.totalMs;
      runStartedAt = null;
      return enterComplete();
    }
    offsetMs = target;
    lastElapsed = target;
    if (status === 'running') {
      runStartedAt = now();
      sync();
      const snap = getSnapshot();
      emit('change', snap);
      return snap;
    }
    const next = locate(plan, offsetMs);
    lastPhaseKey = phaseKey(next);
    announcedTick = null;
    const snap = getSnapshot();
    emit('phasechange', snap);
    emit('cue', { kind: 'phase', phase: snap.phase });
    emit('change', snap);
    return snap;
  }

  function configure(partial) {
    current = normalizeConfig({ ...current, ...partial });
    plan = planTimer(current);
    offsetMs = 0;
    runStartedAt = null;
    lastPhaseKey = null;
    announcedTick = null;
    lastElapsed = 0;
    status = 'idle';
    disarm();
    const snap = getSnapshot();
    emit('change', snap);
    return snap;
  }

  /**
   * Resume a persisted session without beeps. `elapsedMs` is the total elapsed
   * workout time. When `running` is true the clock continues from this instant.
   */
  function restore({ elapsedMs = 0, running = false } = {}) {
    const elapsed = Math.max(0, Number(elapsedMs) || 0);
    offsetMs = elapsed;
    runStartedAt = null;
    announcedTick = null;
    lastElapsed = elapsed;
    disarm();
    if (plan.limited && elapsed >= plan.totalMs) {
      offsetMs = plan.totalMs;
      status = 'complete';
      lastPhaseKey = 'done';
      const snap = getSnapshot();
      emit('change', snap);
      return snap;
    }
    const phase = locate(plan, elapsed);
    lastPhaseKey = phaseKey(phase);
    announcedTick = tickBucket(phase);
    if (running) {
      status = 'running';
      runStartedAt = now();
      arm(phase);
    } else {
      status = 'paused';
    }
    const snap = getSnapshot();
    emit('change', snap);
    return snap;
  }

  function destroy() {
    disarm();
    listeners.clear();
    status = 'idle';
  }

  return {
    start,
    pause,
    resume,
    toggle,
    restart,
    skip,
    configure,
    restore,
    sync,
    getSnapshot,
    destroy,
    on,
    off: (type, fn) => listeners.get(type === 'phaseChange' ? 'phasechange' : type)?.delete(fn),
    onPhaseChange: (fn) => on('phasechange', fn),
  };
}
