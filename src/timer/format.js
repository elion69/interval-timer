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

/** Elapsed stopwatch time with hundredths. Under an hour this is MM:SS.hh. */
export function formatStopwatch(ms) {
  const safe = Math.max(0, Math.floor(Number(ms) || 0));
  const hundredths = Math.floor(safe / 10) % 100;
  const totalSec = Math.floor(safe / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const frac = String(hundredths).padStart(2, '0');
  const clock = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${clock}.${frac}`;
}

/** Floor elapsed time to whole seconds for the thin clock. */
export function formatElapsedHMS(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Microwave-style entry. Digits fill from the right.
 * "2000" is 20:00. Five or six digits become H:MM:SS, so "20000" is 2:00:00.
 */
export function digitsToMs(digits) {
  const clean = String(digits || '').replace(/\D/g, '').slice(-6);
  if (!clean) return { ms: 0, text: '00:00' };
  if (clean.length <= 4) {
    const padded = clean.padStart(4, '0');
    let mm = Number(padded.slice(0, 2));
    let ss = Number(padded.slice(2));
    if (ss >= 60) {
      mm += Math.floor(ss / 60);
      ss %= 60;
    }
    mm = Math.min(mm, 99);
    return {
      ms: (mm * 60 + ss) * 1000,
      text: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    };
  }
  const padded = clean.padStart(6, '0');
  let hh = Number(padded.slice(0, 2));
  let mm = Number(padded.slice(2, 4));
  let ss = Number(padded.slice(4));
  if (ss >= 60) {
    mm += Math.floor(ss / 60);
    ss %= 60;
  }
  if (mm >= 60) {
    hh += Math.floor(mm / 60);
    mm %= 60;
  }
  hh = Math.min(hh, 23);
  return {
    ms: ((hh * 60 + mm) * 60 + ss) * 1000,
    text: `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
  };
}

/** Digit buffer that redisplays as the keypad readout for an existing duration. */
export function msToDigits(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  const raw = h > 0
    ? `${h}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`
    : `${Math.floor(total / 60)}${String(s).padStart(2, '0')}`;
  return raw.replace(/^0+/, '');
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
