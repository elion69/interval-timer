/** Clock formatters. Remaining time uses ceil-to-second so the digit matches the beep. */

export function formatHMS(ms) {
  if (ms == null || !Number.isFinite(ms)) return '∞';
  const total = ms <= 0 ? 0 : Math.ceil(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Current-interval countdown. MM:SS until it no longer fits. */
export function formatPhase(ms) {
  const total = ms <= 0 ? 0 : Math.ceil(ms / 1000);
  const s = total % 60;
  const minutes = Math.floor(total / 60);
  if (minutes >= 100) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Compact duration for chips: 60s → 1M, 30s → 30S, 90s → 1:30. */
export function formatShort(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s >= 60 && s % 60 === 0 && s < 3600 * 10) return `${s / 60}M`;
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  return `${s}S`;
}

/** Work/rest chip fragment without a unit suffix when both are under a minute. */
export function formatPart(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s >= 60 && s % 60 === 0) return `${s / 60}M`;
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }
  return String(s);
}
