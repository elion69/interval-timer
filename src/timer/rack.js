/**
 * Several independent timers on one clock.
 * Each session is its own timestamp engine, so pausing one does not freeze the others,
 * and a backgrounded tab catches every one of them up from the wall clock.
 */

import { createIntervalTimer } from './engine.js';

const VOICE_COUNT = 4;

export function createTimerRack(deps = {}) {
  let sessions = [];
  let focusId = null;
  let nextNum = 1;
  const listeners = new Map();

  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
    return () => listeners.get(type)?.delete(fn);
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

  function noteId(id) {
    const n = Number(String(id).replace(/\D/g, ''));
    if (Number.isFinite(n) && n >= nextNum) nextNum = n + 1;
  }

  function nextVoice() {
    const used = new Set(sessions.map((session) => session.voice));
    for (let voice = 0; voice < VOICE_COUNT; voice += 1) {
      if (!used.has(voice)) return voice;
    }
    return sessions.length % VOICE_COUNT;
  }

  function focused() {
    return sessions.find((session) => session.id === focusId) || sessions[0] || null;
  }

  function add(config, meta = {}) {
    const id = meta.id || `t${nextNum++}`;
    noteId(id);
    const voice = Number.isInteger(meta.voice) ? ((meta.voice % VOICE_COUNT) + VOICE_COUNT) % VOICE_COUNT : nextVoice();
    const timer = createIntervalTimer(config, deps);
    const session = { id, label: meta.label || '', voice, timer };
    timer.on('cue', (cue) => emit('cue', { id, voice, cue }));
    timer.on('phasechange', (snap) => emit('phasechange', { id, voice, snap }));
    timer.on('complete', (snap) => emit('complete', { id, voice, snap }));
    timer.on('change', (snap) => emit('change', { id, voice, snap }));
    sessions.push(session);
    if (!focusId) focusId = id;
    emit('roster');
    return session;
  }

  function focus(id) {
    if (!sessions.some((session) => session.id === id) || id === focusId) return focused();
    focusId = id;
    emit('roster');
    return focused();
  }

  function remove(id) {
    if (sessions.length <= 1) return focused();
    const session = sessions.find((item) => item.id === id);
    if (!session) return focused();
    session.timer.destroy();
    sessions = sessions.filter((item) => item.id !== id);
    if (focusId === id) focusId = sessions[0].id;
    emit('roster');
    return focused();
  }

  function setLabel(id, label) {
    const session = sessions.find((item) => item.id === id);
    if (session) session.label = String(label || '').slice(0, 24);
    return session;
  }

  function sync() {
    for (const session of sessions) session.timer.sync();
  }

  function anyRunning() {
    return sessions.some((session) => session.timer.getSnapshot().status === 'running');
  }

  function list() {
    return sessions.slice();
  }

  function destroy() {
    for (const session of sessions) session.timer.destroy();
    sessions = [];
    focusId = null;
    listeners.clear();
  }

  return {
    add,
    remove,
    focus,
    focused,
    setLabel,
    list,
    sync,
    anyRunning,
    destroy,
    on,
    get focusId() {
      return focusId;
    },
  };
}
