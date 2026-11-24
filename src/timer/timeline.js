/**
 * Upcoming cues for a running timer, worked out ahead of time so they can be
 * scheduled on the audio clock. Audio scheduled this way keeps playing on time
 * even when the phone throttles the page's JavaScript (another app in front,
 * screen off).
 */

import { planTimer } from './engine.js';

const TICKS = [3, 2, 1];

function phaseCues(phase, startElapsed) {
  const out = [{ at: startElapsed, cue: { kind: 'phase', phase: { type: phase.type, round: phase.round } } }];
  const end = startElapsed + phase.durationMs;
  for (const second of TICKS) {
    if (phase.durationMs > second * 1000) {
      out.push({ at: end - second * 1000, cue: { kind: 'tick', second, phase: { type: phase.type, round: phase.round } } });
    }
  }
  return out;
}

/**
 * @param {object} config timer config
 * @param {number} fromMs elapsed ms to start from (inclusive)
 * @param {number} toMs elapsed ms to stop at (exclusive)
 * @returns {Array<{ at: number, key: string, cue: object }>} sorted by time
 */
export function cuesBetween(config, fromMs, toMs) {
  const plan = planTimer(config);
  if (plan.stopwatch) return [];
  const events = [];
  const push = (list) => {
    for (const e of list) {
      if (e.at >= fromMs && e.at < toMs) events.push(e);
    }
  };

  if (plan.limited) {
    let cursor = 0;
    for (const phase of plan.phases) {
      if (cursor >= toMs) break;
      if (cursor + phase.durationMs >= fromMs) push(phaseCues(phase, cursor));
      cursor += phase.durationMs;
    }
    if (plan.totalMs >= fromMs && plan.totalMs < toMs) {
      events.push({ at: plan.totalMs, cue: { kind: 'complete', phase: { type: 'done', round: plan.rounds } } });
    }
  } else {
    let cursor = 0;
    if (plan.warmupMs > 0) {
      if (cursor + plan.warmupMs >= fromMs) push(phaseCues({ type: 'warmup', round: 0, durationMs: plan.warmupMs }, 0));
      cursor = plan.warmupMs;
    }
    const cycle = plan.workMs + plan.restMs;
    let round = 1;
    if (fromMs > cursor + cycle) {
      const skip = Math.floor((fromMs - cursor) / cycle) - 1;
      round += skip;
      cursor += skip * cycle;
    }
    while (cursor < toMs) {
      push(phaseCues({ type: 'work', round, durationMs: plan.workMs }, cursor));
      cursor += plan.workMs;
      if (plan.restMs > 0) {
        push(phaseCues({ type: 'rest', round, durationMs: plan.restMs }, cursor));
        cursor += plan.restMs;
      }
      round += 1;
    }
  }

  events.sort((a, b) => a.at - b.at || (a.cue.kind === 'tick' ? -1 : 1));
  return events.map((e) => ({ ...e, key: `${e.at}:${e.cue.kind}:${e.cue.second ?? ''}` }));
}
