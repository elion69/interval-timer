/**
 * Remote commands from a public JSON file.
 * Polls only while the page is visible. Failures are ignored so the timer still works offline.
 */

const COMMAND_URL = 'https://api.github.com/repos/elion69/interval-timer/contents/remote/command.json?ref=main';
const LAST_ID_KEY = 'go-timer.remote-command-id';
const MAX_AGE_MS = 2 * 60 * 1000;
const POLL_MS = 5000;

export function findWorkout(workouts, name) {
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) return null;
  return workouts.find((workout) => (
    workout.name?.toLowerCase() === needle || workout.short?.toLowerCase() === needle
  )) || null;
}

function seconds(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

/** Turn a command workout field into a timer config, or a name to look up. A `name` on the workout labels it. */
export function workoutSpec(workout) {
  const spec = baseSpec(workout);
  const name = workout && typeof workout === 'object' ? String(workout.name || '').trim().slice(0, 24) : '';
  if (spec && spec.kind === 'config' && name) spec.label = name;
  return spec;
}

function baseSpec(workout) {
  if (typeof workout === 'string') return { kind: 'name', name: workout };
  if (!workout || typeof workout !== 'object') return null;
  if (workout.stopwatch) {
    return {
      kind: 'config',
      label: 'Stopwatch',
      config: { mode: 'stopwatch', workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 1, durationMs: 60_000 },
    };
  }
  if (workout.countdown != null) {
    const durationMs = Math.max(1, seconds(workout.countdown, 60)) * 1000;
    return {
      kind: 'config',
      label: 'Countdown',
      config: { mode: 'countdown', durationMs, workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 1 },
    };
  }
  if (workout.work != null || workout.rest != null || workout.rounds != null || workout.warmup != null) {
    const workMs = Math.max(1, seconds(workout.work, 60)) * 1000;
    const restMs = seconds(workout.rest, 0) * 1000;
    const warmupMs = seconds(workout.warmup, 0) * 1000;
    const rounds = workout.rounds == null ? 1 : Math.max(1, Math.round(Number(workout.rounds) || 1));
    return {
      kind: 'config',
      label: 'Custom',
      config: { mode: 'interval', workMs, restMs, warmupMs, rounds, durationMs: workMs },
    };
  }
  return null;
}

/**
 * Decide whether a command should run.
 * Returns null when it should be ignored.
 */
export function evaluateCommand(command, { now = Date.now(), lastId = null, workouts = [] } = {}) {
  if (!command || typeof command !== 'object') return null;
  const id = String(command.id || '');
  if (!id || id === lastId) return null;
  const action = String(command.action || '').toLowerCase();
  if (action !== 'start' && action !== 'pause' && action !== 'stop') return null;
  const issued = Date.parse(command.issued);
  if (!Number.isFinite(issued)) return null;
  const age = now - issued;
  if (age > MAX_AGE_MS || age < -30_000) return null;

  if (action === 'pause' || action === 'stop') {
    return { id, action, label: '', config: null };
  }

  // "alongside": true (default) starts it as its own timer when another one is already going.
  const alongside = command.alongside !== false;
  const spec = workoutSpec(command.workout);
  if (!spec) return { id, action: 'start', label: 'current timer', config: null, alongside: false };
  if (spec.kind === 'config') return { id, action: 'start', label: spec.label, config: spec.config, alongside };
  const match = findWorkout(workouts, spec.name);
  if (!match) return { id, action: 'missing', label: spec.name, config: null };
  return { id, action: 'start', label: match.name, config: { ...match.config }, alongside };
}

export function startRemoteCommands({ workouts, onCommand, storage = globalThis.localStorage } = {}) {
  let timerId = 0;
  let etag = '';
  let stopped = false;

  function lastId() {
    try {
      return storage?.getItem(LAST_ID_KEY) || '';
    } catch {
      return '';
    }
  }

  function remember(id) {
    try {
      storage?.setItem(LAST_ID_KEY, id);
    } catch {
      /* ignore quota / private mode */
    }
  }

  async function poll() {
    if (stopped || document.visibilityState === 'hidden') return;
    try {
      const headers = { Accept: 'application/vnd.github.raw' };
      if (etag) headers['If-None-Match'] = etag;
      const response = await fetch(`${COMMAND_URL}&t=${Date.now()}`, { headers, cache: 'no-store' });
      const nextEtag = response.headers.get('etag');
      if (nextEtag) etag = nextEtag;
      if (response.status === 304 || !response.ok) return;
      const command = await response.json();
      const decision = evaluateCommand(command, {
        now: Date.now(),
        lastId: lastId(),
        workouts: workouts?.() || [],
      });
      if (!decision) return;
      remember(decision.id);
      onCommand?.(decision);
    } catch {
      /* offline or blocked — the timer keeps working on its own */
    }
  }

  function startLoop() {
    if (timerId || stopped || document.visibilityState === 'hidden') return;
    timerId = window.setInterval(poll, POLL_MS);
  }

  function stopLoop() {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = 0;
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      stopLoop();
      return;
    }
    poll();
    startLoop();
  }

  document.addEventListener('visibilitychange', onVisibility);
  poll();
  startLoop();

  return {
    poll,
    stop() {
      stopped = true;
      stopLoop();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
