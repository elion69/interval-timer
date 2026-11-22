import { planTimer } from './engine.js';
import { createTimerRack } from './rack.js';
import { createAlerts } from './audio.js';
import { createWakeLock } from './wake.js';
import { loadState, normalizeSaved, saveState } from './storage.js';
import { BUILTIN_PRESETS, chipLabel, configsEqual } from './presets.js';
import { digitsToMs, formatElapsedHMS, formatHMS, formatPart, formatPhase, formatStopwatch, msToDigits } from './format.js';

const CX = 170;
const ARC_R = 143;
const ARC_LEN = 2 * Math.PI * ARC_R;

const ICON = {
  work: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="4.7" r="2.35" fill="currentColor"/><path fill="currentColor" d="M7.15 9.35c.15-.95 1.05-1.6 2.05-1.6h5.6c1 0 1.9.65 2.05 1.6l.85 6.15h-2.55l.2 6.15c.05.55-.4.95-.95.95h-.55c-.5 0-.95-.35-1-.9L12.7 17h-1.4l-.15 4.7c-.05.55-.5.9-1 .9h-.55c-.55 0-1-.4-.95-.95l.2-6.15H7.3l-.15-6.15z"/></svg>`,
  rest: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 20.2s-6.6-4.05-6.6-8.35a3.7 3.7 0 0 1 6.6-1.85 3.7 3.7 0 0 1 6.6 1.85c0 4.3-6.6 8.35-6.6 8.35z"/></svg>`,
  warmup: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.4" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.1 5.1l1.5 1.5M17.4 17.4l1.5 1.5M18.9 5.1l-1.5 1.5M6.6 17.4l-1.5 1.5"/></svg>`,
  countdown: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 13V9.6M9.2 3.4h5.6M12 3.4V5.2"/></svg>`,
  done: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.2 4.2L19 7.4"/></svg>`,
  sound: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9.5h3.2L11 6.2v11.6l-3.8-3.3H4z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M15.2 9.2a3.6 3.6 0 0 1 0 5.6M17.6 7a6.4 6.4 0 0 1 0 10"/></svg>`,
  soundOff: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 9.5h3.2L11 6.2v11.6l-3.8-3.3H4z"/><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M16 10l4 4M20 10l-4 4"/></svg>`,
  wake: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path stroke="currentColor" stroke-width="1.7" stroke-linecap="round" d="M10.5 17.5h3"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5.5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18.5" r="1.5" fill="currentColor"/></svg>`,
  restart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" d="M4 12a8 8 0 1 0 2.3-5.6M4 4.5V9h4.5"/></svg>`,
  play: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.2v13.6L19.2 12 8 5.2z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>`,
  skip: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5.4v13.2L14.6 12 5 5.4z"/><rect x="16.2" y="5.4" width="2.6" height="13.2" rx="0.6" fill="currentColor"/></svg>`,
  stopwatch: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 13V9.2M9.2 3.2h5.6M12 3.2v2.2"/></svg>`,
  lap: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 4v16M6 5h10l-2.2 3.2L16 11.5H6"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

function el(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function cloneConfig(config) {
  return { ...config };
}

/**
 * Mount the phone UI into `container` and return a handle.
 * The focused engine is `handle.timer`. Other running timers are on `handle.rack`.
 */
export function mountTimer(container, options = {}) {
  const saved = options.storage === false
    ? normalizeSaved({ sound: options.sound !== false, config: options.config, timers: options.config ? [{ id: 't1', config: options.config, voice: 0 }] : null })
    : loadState();
  if (options.config && options.storage !== false && saved.timers[0]) {
    saved.timers[0] = { ...saved.timers[0], config: { ...saved.timers[0].config, ...options.config }, run: null };
  }

  const alerts = createAlerts();
  alerts.setSound(saved.sound);
  let customPresets = saved.customPresets || [];
  let wakeOn = false;
  let raf = 0;
  let toastTimer = 0;
  let dirty = false;
  let draft = cloneConfig(saved.timers[0].config);
  let intent = 'edit';
  let deferredPrompt = null;
  let lastTitle = '';
  const rows = new Map();

  const shell = el(`
    <div class="go-timer" data-state="idle">
      <header class="go-top">
        <div class="go-brand">
          <button type="button" class="go-chip" data-testid="preset-chip">1M</button>
          <button type="button" class="go-iconbtn go-add" data-testid="add" aria-label="Add another timer">${ICON.plus}</button>
        </div>
        <div class="go-actions">
          <button type="button" class="go-iconbtn" data-testid="sound" aria-pressed="true" aria-label="Mute sound"></button>
          <button type="button" class="go-iconbtn" data-testid="wake" aria-label="Screen stays awake while running"></button>
          <button type="button" class="go-iconbtn" data-testid="settings" aria-label="Settings"></button>
        </div>
      </header>
      <div class="go-total" data-testid="total">00:00:00</div>
      <div class="go-caption" data-testid="caption"></div>
      <div class="go-stage">
        <svg viewBox="0 0 340 340" aria-hidden="true">
          <circle cx="170" cy="170" r="124" fill="none" stroke="#262626" stroke-width="26"></circle>
          <circle data-face cx="170" cy="170" r="98" fill="#FF2B73"></circle>
          <g data-dots></g>
          <circle data-arc cx="170" cy="170" r="143" fill="none" stroke="#FF2B73" stroke-width="6"
            stroke-linecap="round" transform="rotate(-90 170 170)"></circle>
          <g data-badge>
            <circle data-badge-fill r="17" fill="#f4f4f4"></circle>
            <circle data-badge-ring r="17" fill="none" stroke="#3cdbff" stroke-width="2.5"></circle>
            <text data-badge-text text-anchor="middle" dominant-baseline="central"
              fill="#141414" font-family="Roboto, sans-serif" font-weight="700" font-size="13">100</text>
          </g>
        </svg>
        <button type="button" class="go-face" data-testid="center">
          <span class="go-face-icon" data-testid="phase-icon"></span>
          <span class="go-face-label" data-testid="phase-label">go</span>
          <span class="go-face-clock">
            <span class="go-face-time" data-testid="phase-time">01:00</span>
            <span class="go-face-frac" data-testid="phase-frac" hidden></span>
          </span>
        </button>
      </div>
      <div class="go-laps" data-testid="laps" hidden></div>
      <div class="go-stack" data-testid="stack" hidden></div>
      <div class="go-controls">
        <button type="button" data-testid="restart" aria-label="Restart">${ICON.restart}</button>
        <button type="button" class="go-primary" data-testid="toggle" aria-label="Start">${ICON.play}</button>
        <button type="button" data-testid="skip" aria-label="Skip to next phase">${ICON.skip}</button>
      </div>
      <div class="go-sr" data-testid="live" aria-live="polite"></div>
      <div class="go-backdrop" data-testid="backdrop">
        <div class="go-sheet" role="dialog" aria-modal="true" aria-label="Timer settings" tabindex="-1">
          <div class="go-handle"></div>
          <h2 data-testid="sheet-title">Setup</h2>
          <div class="go-segment" role="group" aria-label="Mode">
            <button type="button" data-mode="countdown" aria-pressed="false">Countdown</button>
            <button type="button" data-mode="interval" aria-pressed="true">Intervals</button>
            <button type="button" data-mode="stopwatch" aria-pressed="false">Stopwatch</button>
          </div>
          <p class="go-warn" data-warn hidden>This restarts the timer on screen. Any others keep running.</p>
          <p class="go-note" data-add-note hidden>It starts right away, alongside whatever is already running, and uses a different beep.</p>
          <div data-panel="countdown">
            <div class="go-field">
              <span class="go-field-label">Duration</span>
              <div class="go-stepper">
                <button type="button" data-bump="durationMs" data-dir="-1" aria-label="Shorten duration">−</button>
                <button type="button" class="go-stepper-value" data-value="durationMs" data-testid="field-duration">05:00</button>
                <button type="button" data-bump="durationMs" data-dir="1" aria-label="Lengthen duration">+</button>
              </div>
            </div>
            <div class="go-quick" data-quick="countdown"></div>
          </div>
          <div data-panel="interval">
            <div class="go-field">
              <span class="go-field-label">Work</span>
              <div class="go-stepper">
                <button type="button" data-bump="workMs" data-dir="-1" aria-label="Shorten work">−</button>
                <button type="button" class="go-stepper-value" data-value="workMs" data-testid="field-work">01:00</button>
                <button type="button" data-bump="workMs" data-dir="1" aria-label="Lengthen work">+</button>
              </div>
              <div class="go-quick" data-quick="work"></div>
            </div>
            <div class="go-field">
              <span class="go-field-label">Rest</span>
              <div class="go-stepper">
                <button type="button" data-bump="restMs" data-dir="-1" aria-label="Shorten rest">−</button>
                <button type="button" class="go-stepper-value" data-value="restMs" data-testid="field-rest">00:00</button>
                <button type="button" data-bump="restMs" data-dir="1" aria-label="Lengthen rest">+</button>
              </div>
              <div class="go-quick" data-quick="rest"></div>
            </div>
            <div class="go-field">
              <span class="go-field-label">Warm-up</span>
              <div class="go-stepper">
                <button type="button" data-bump="warmupMs" data-dir="-1" aria-label="Shorten warm-up">−</button>
                <button type="button" class="go-stepper-value" data-value="warmupMs" data-testid="field-warmup">00:00</button>
                <button type="button" data-bump="warmupMs" data-dir="1" aria-label="Lengthen warm-up">+</button>
              </div>
            </div>
            <div class="go-field">
              <span class="go-field-label">Rounds</span>
              <div class="go-stepper">
                <button type="button" data-bump="rounds" data-dir="-1" aria-label="Fewer rounds">−</button>
                <div class="go-stepper-value" data-value="rounds">100</div>
                <button type="button" data-bump="rounds" data-dir="1" aria-label="More rounds">+</button>
              </div>
            </div>
            <div class="go-switch-row">
              <span>Unlimited rounds</span>
              <button type="button" class="go-switch" data-testid="unlimited" role="switch" aria-checked="false" aria-label="Unlimited rounds"><i></i></button>
            </div>
            <div class="go-quick" data-quick="rounds"></div>
          </div>
          <div data-panel="stopwatch" hidden>
            <p class="go-note">Counts up from zero. Lap and reset sit on the main screen, and it keeps running next to your other timers.</p>
          </div>
          <div class="go-summary" data-testid="summary"></div>
          <span class="go-field-label">Presets</span>
          <div class="go-presets" data-testid="presets"></div>
          <div class="go-save">
            <input data-testid="preset-name" maxlength="24" placeholder="Name this setup" enterkeyhint="done" autocomplete="off">
            <button type="button" data-testid="preset-save">Save</button>
          </div>
          <p class="go-note">The badge on the ring is how many rounds are left, including the one you're in. Rest is skipped after the last round.</p>
          <p class="go-note" data-install-note>On Android, open this page in Chrome, tap the menu, then Install app or Add to Home screen. After one visit it works offline.</p>
          <button type="button" class="go-install" data-testid="install" hidden>Install app</button>
          <button type="button" class="go-remove" data-testid="remove-timer" hidden>Remove this timer</button>
          <div class="go-done-wrap">
            <button type="button" class="go-done" data-testid="done">Done</button>
          </div>
        </div>
      </div>
      <div class="go-keypad" data-testid="keypad" hidden>
        <p class="go-keypad-label" data-testid="keypad-label">Work</p>
        <div class="go-keypad-display" data-testid="keypad-display">00:00</div>
        <p class="go-keypad-hint">Type 2000 for 20:00</p>
        <div class="go-keys">
          <button type="button" data-digit="1">1</button>
          <button type="button" data-digit="2">2</button>
          <button type="button" data-digit="3">3</button>
          <button type="button" data-digit="4">4</button>
          <button type="button" data-digit="5">5</button>
          <button type="button" data-digit="6">6</button>
          <button type="button" data-digit="7">7</button>
          <button type="button" data-digit="8">8</button>
          <button type="button" data-digit="9">9</button>
          <button type="button" data-key="back" aria-label="Delete digit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 6.5h10.3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8.2L3.5 12l4.7-5.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M11 10l4 4M15 10l-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
          <button type="button" data-digit="0">0</button>
          <button type="button" class="go-key-ok" data-key="ok">OK</button>
        </div>
      </div>
      <div class="go-toast" data-testid="toast" role="status"></div>
    </div>
  `);

  container.replaceChildren(shell);

  const q = (sel) => shell.querySelector(sel);
  const chipBtn = q('[data-testid="preset-chip"]');
  const soundBtn = q('[data-testid="sound"]');
  const wakeBtn = q('[data-testid="wake"]');
  const settingsBtn = q('[data-testid="settings"]');
  const totalEl = q('[data-testid="total"]');
  const captionEl = q('[data-testid="caption"]');
  const face = q('[data-face]');
  const arc = q('[data-arc]');
  const dots = q('[data-dots]');
  const badge = q('[data-badge]');
  const badgeFill = q('[data-badge-fill]');
  const badgeRing = q('[data-badge-ring]');
  const badgeText = q('[data-badge-text]');
  const center = q('[data-testid="center"]');
  const phaseIcon = q('[data-testid="phase-icon"]');
  const phaseLabel = q('[data-testid="phase-label"]');
  const phaseTime = q('[data-testid="phase-time"]');
  const restartBtn = q('[data-testid="restart"]');
  const toggleBtn = q('[data-testid="toggle"]');
  const skipBtn = q('[data-testid="skip"]');
  const live = q('[data-testid="live"]');
  const backdrop = q('[data-testid="backdrop"]');
  const sheet = q('.go-sheet');
  const sheetTitle = q('[data-testid="sheet-title"]');
  const warn = q('[data-warn]');
  const addNote = q('[data-add-note]');
  const removeBtn = q('[data-testid="remove-timer"]');
  const doneBtn = q('[data-testid="done"]');
  const stack = q('[data-testid="stack"]');
  const summary = q('[data-testid="summary"]');
  const presetBox = q('[data-testid="presets"]');
  const nameInput = q('[data-testid="preset-name"]');
  const toast = q('[data-testid="toast"]');
  const installBtn = q('[data-testid="install"]');

  for (let i = 0; i < 80; i += 1) {
    const angle = (i / 80) * Math.PI * 2 - Math.PI / 2;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', (CX + Math.cos(angle) * 124).toFixed(2));
    dot.setAttribute('cy', (CX + Math.sin(angle) * 124).toFixed(2));
    dot.setAttribute('r', '1.65');
    dot.setAttribute('fill', 'rgba(255,255,255,0.88)');
    dots.appendChild(dot);
  }

  const quickTimes = [60, 180, 300, 600, 900];
  const quickBox = q('[data-quick="countdown"]');
  for (const sec of quickTimes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = formatPhase(sec * 1000);
    btn.dataset.seconds = String(sec);
    quickBox.appendChild(btn);
  }
  const roundBox = q('[data-quick="rounds"]');
  for (const n of [1, 8, 10, 20, 100]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(n);
    btn.dataset.rounds = String(n);
    roundBox.appendChild(btn);
  }
  const workBox = q('[data-quick="work"]');
  for (const sec of [60, 300, 1200]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = formatPhase(sec * 1000);
    btn.dataset.work = String(sec);
    workBox.appendChild(btn);
  }
  const restBox = q('[data-quick="rest"]');
  for (const sec of [0, 30, 300]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = formatPhase(sec * 1000);
    btn.dataset.rest = String(sec);
    restBox.appendChild(btn);
  }

  const wake = createWakeLock((on) => {
    wakeOn = on;
    paintWake();
  });
  if (!wake.supported) wakeBtn.dataset.awake = 'unsupported';
  wakeBtn.innerHTML = ICON.wake;
  settingsBtn.innerHTML = ICON.menu;

  const rack = createTimerRack(options.clock || {});

  function focusedTimer() {
    return rack.focused().timer;
  }

  function presets() {
    return [...BUILTIN_PRESETS, ...customPresets];
  }

  function captureRun(timer) {
    const snap = timer.getSnapshot();
    const laps = snap.mode === 'stopwatch' ? snap.laps : [];
    if (snap.status === 'running') return { status: 'running', origin: Date.now() - snap.totalElapsedMs, laps };
    if (snap.status === 'paused') return { status: 'paused', elapsedMs: snap.totalElapsedMs, laps };
    if (snap.status === 'complete') return { status: 'complete' };
    return null;
  }

  function persist() {
    if (options.storage === false) return;
    saveState({
      sound: alerts.sound,
      customPresets,
      focusId: rack.focusId,
      timers: rack.list().map((session) => ({
        id: session.id,
        label: session.label,
        voice: session.voice,
        config: session.timer.getSnapshot().config,
        run: captureRun(session.timer),
      })),
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 2200);
  }

  function paintSound() {
    soundBtn.setAttribute('aria-pressed', String(alerts.sound));
    soundBtn.setAttribute('aria-label', alerts.sound ? 'Mute sound' : 'Unmute sound');
    soundBtn.innerHTML = alerts.sound ? ICON.sound : ICON.soundOff;
  }

  function paintWake() {
    if (!wake.supported) {
      wakeBtn.dataset.awake = 'unsupported';
      return;
    }
    wakeBtn.dataset.awake = wakeOn && rack.anyRunning() ? 'on' : 'off';
  }

  function announce(snap) {
    if (!snap || snap.phase.type === 'done') {
      live.textContent = 'Done';
      return;
    }
    const round = snap.rounds
      ? `, round ${Math.max(snap.phase.round, 1)} of ${snap.rounds}`
      : snap.rounds === null && snap.mode === 'interval'
        ? ', unlimited rounds'
        : '';
    live.textContent = `${snap.phase.label}, ${formatPhase(snap.phase.remainingMs)} left${round}`;
  }

  let lastIcon = '';
  function render() {
    const snap = focusedTimer().getSnapshot();
    shell.dataset.state = snap.status;
    const total = snap.status === 'idle' ? snap.totalDurationMs : snap.totalRemainingMs;
    const totalText = snap.mode === 'interval' && snap.rounds == null
      ? (snap.status === 'idle' ? '∞' : formatHMS(snap.totalElapsedMs))
      : formatHMS(snap.status === 'complete' ? 0 : (snap.totalRemainingMs ?? snap.totalDurationMs));
    if (snap.mode === 'stopwatch') {
      totalEl.textContent = formatElapsedHMS(snap.totalElapsedMs);
      captionEl.textContent = 'elapsed';
    } else if (snap.mode === 'interval' && snap.rounds == null && snap.status !== 'idle') {
      totalEl.textContent = formatHMS(snap.totalElapsedMs);
      captionEl.textContent = 'elapsed';
    } else if (snap.rounds == null && snap.mode === 'interval') {
      totalEl.textContent = '∞';
      captionEl.textContent = 'unlimited';
    } else {
      totalEl.textContent = formatHMS(snap.status === 'complete' ? 0 : (snap.totalRemainingMs ?? total));
      captionEl.textContent = '';
    }
    // silence unused
    void totalText;

    const presetsNow = presets();
    chipBtn.textContent = chipLabel(snap.config, presetsNow);

    const iconKey = snap.phase.type;
    if (iconKey !== lastIcon) {
      phaseIcon.innerHTML = ICON[iconKey] || ICON.work;
      lastIcon = iconKey;
    }
    const fracEl = q('[data-testid="phase-frac"]');
    if (snap.mode === 'stopwatch') {
      const [main, frac] = formatStopwatch(snap.totalElapsedMs).split('.');
      phaseTime.textContent = main;
      fracEl.hidden = false;
      fracEl.textContent = `.${frac}`;
      phaseLabel.textContent = snap.status === 'paused' ? 'paused' : `lap ${snap.laps.length + 1}`;
    } else {
      fracEl.hidden = true;
      fracEl.textContent = '';
      phaseLabel.textContent = snap.status === 'paused' ? 'paused' : snap.phase.label;
      phaseTime.textContent = formatPhase(snap.phase.remainingMs);
    }
    face.setAttribute('fill', snap.phase.color);
    center.classList.toggle('is-done', snap.phase.type === 'done');
    center.classList.toggle('is-dial', snap.mode === 'stopwatch');
    center.setAttribute('aria-label', snap.status === 'running' ? 'Pause' : snap.status === 'paused' ? 'Resume' : 'Start');

    const progress = snap.status === 'complete' ? 1 : snap.phase.progress;
    const showArc = progress > 0.001;
    arc.setAttribute('stroke', snap.phase.type === 'done' ? '#ffffff' : snap.phase.color);
    arc.setAttribute('stroke-dasharray', ARC_LEN.toFixed(3));
    arc.setAttribute('stroke-dashoffset', (ARC_LEN * (1 - Math.min(1, progress))).toFixed(3));
    arc.style.opacity = showArc ? '1' : '0';
    arc.setAttribute('stroke-linecap', progress > 0.985 ? 'butt' : 'round');

    const marker = snap.phase.type === 'countdown' || snap.phase.type === 'done';
    const text = snap.mode === 'stopwatch'
      ? String(snap.laps.length + 1)
      : snap.phase.type === 'done' || snap.mode === 'countdown'
        ? ''
        : snap.roundsRemaining == null ? '∞' : String(snap.roundsRemaining);
    const angle = -Math.PI / 2 + Math.min(1, progress) * Math.PI * 2;
    const x = CX + Math.cos(angle) * ARC_R;
    const y = CX + Math.sin(angle) * ARC_R;
    badge.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    badge.style.display = snap.phase.type === 'done' ? 'none' : '';
    const radius = marker || !text ? 8 : text.length >= 3 ? 18 : 16;
    badgeFill.setAttribute('r', String(radius));
    badgeRing.setAttribute('r', String(radius));
    badgeText.textContent = text;
    badgeText.setAttribute('font-size', text.length >= 3 ? '12' : text.length === 2 ? '14' : '16');
    badgeText.style.display = text ? '' : 'none';

    const running = snap.status === 'running';
    const toggleIcon = running ? 'pause' : 'play';
    if (toggleBtn.dataset.icon !== toggleIcon) {
      toggleBtn.dataset.icon = toggleIcon;
      toggleBtn.innerHTML = running ? ICON.pause : ICON.play;
    }
    toggleBtn.setAttribute('aria-label', running ? 'Pause' : snap.status === 'paused' ? 'Resume' : 'Start');
    const stopwatch = snap.mode === 'stopwatch';
    if (skipBtn.dataset.mode !== (stopwatch ? 'lap' : 'skip')) {
      skipBtn.dataset.mode = stopwatch ? 'lap' : 'skip';
      skipBtn.innerHTML = stopwatch ? ICON.lap : ICON.skip;
    }
    skipBtn.disabled = stopwatch ? !running : !(running || snap.status === 'paused');
    skipBtn.setAttribute('aria-label', stopwatch ? 'Lap' : 'Skip to next phase');
    restartBtn.disabled = stopwatch && snap.totalElapsedMs === 0 && snap.status === 'idle';
    restartBtn.setAttribute('aria-label', stopwatch ? 'Reset' : 'Restart');

    const title = stopwatch
      ? (running ? formatStopwatch(snap.totalElapsedMs) : 'Stopwatch')
      : running
        ? `${formatPhase(snap.phase.remainingMs)} · ${snap.phase.label}`
        : 'Interval Timer';
    if (title !== lastTitle) {
      document.title = title;
      lastTitle = title;
    }
    paintWake();
    renderStack();
    renderLaps(snap);
  }

  const lapsEl = q('[data-testid="laps"]');

  function lapRow(label, splitMs, totalMs, current) {
    const row = document.createElement('div');
    row.className = current ? 'go-lap is-now' : 'go-lap';
    row.innerHTML = `<span>${label}</span><span>${formatStopwatch(splitMs)}</span><span>${formatStopwatch(totalMs)}</span>`;
    return row;
  }

  function renderLaps(snap) {
    if (snap.mode !== 'stopwatch' || (snap.laps.length === 0 && snap.totalElapsedMs === 0 && snap.status === 'idle')) {
      lapsEl.hidden = true;
      lapsEl.replaceChildren();
      shell.dataset.laps = 'off';
      return;
    }
    const last = snap.laps[snap.laps.length - 1];
    const split = snap.totalElapsedMs - (last?.totalMs || 0);
    const head = document.createElement('div');
    head.className = 'go-lap go-lap-head';
    head.innerHTML = '<span>Lap</span><span>Split</span><span>Total</span>';
    const rows = [head, lapRow(String(snap.laps.length + 1), split, snap.totalElapsedMs, true)];
    for (let i = snap.laps.length - 1; i >= 0; i -= 1) {
      rows.push(lapRow(String(snap.laps[i].n), snap.laps[i].splitMs, snap.laps[i].totalMs, false));
    }
    lapsEl.replaceChildren(...rows);
    lapsEl.hidden = false;
    shell.dataset.laps = 'on';
  }

  const MINI_C = 2 * Math.PI * 16;

  function renderStack() {
    const others = rack.list().filter((session) => session.id !== rack.focusId);
    const keep = new Set(others.map((session) => session.id));
    for (const [id, row] of rows) {
      if (!keep.has(id)) {
        row.remove();
        rows.delete(id);
      }
    }
    for (const session of others) {
      let row = rows.get(session.id);
      if (!row) {
        row = buildRow(session.id);
        rows.set(session.id, row);
        stack.appendChild(row);
      }
      paintRow(row, session);
    }
    stack.hidden = others.length === 0;
    shell.dataset.stack = others.length ? 'on' : 'off';
  }

  function buildRow(id) {
    const row = el(`
      <div class="go-row" data-testid="stack-row">
        <button type="button" class="go-row-main" data-act="focus">
          <svg class="go-mini" viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="16" fill="none" stroke="#2a2a2a" stroke-width="4"></circle>
            <circle data-mini-face cx="24" cy="24" r="10"></circle>
            <circle data-mini-arc cx="24" cy="24" r="16" fill="none" stroke-width="3" stroke-linecap="round" transform="rotate(-90 24 24)"></circle>
          </svg>
          <span class="go-row-copy">
            <span class="go-row-name"></span>
            <span class="go-row-line"><span class="go-row-time"></span> <span class="go-row-phase"></span></span>
          </span>
        </button>
        <button type="button" class="go-row-btn" data-act="toggle" aria-label="Start"></button>
        <button type="button" class="go-row-btn" data-act="skip" aria-label="Skip to next phase">${ICON.skip}</button>
        <button type="button" class="go-row-btn" data-act="remove" aria-label="Remove timer">${ICON.close}</button>
      </div>
    `);
    row.dataset.id = id;
    const sessionTimer = () => rack.list().find((item) => item.id === id)?.timer;
    row.querySelector('[data-act="focus"]').addEventListener('click', () => rack.focus(id));
    row.querySelector('[data-act="toggle"]').addEventListener('click', () => {
      alerts.unlock();
      sessionTimer()?.toggle();
    });
    row.querySelector('[data-act="skip"]').addEventListener('click', () => {
      alerts.unlock();
      sessionTimer()?.skip();
    });
    row.querySelector('[data-act="remove"]').addEventListener('click', () => {
      rack.remove(id);
      showToast('Timer removed');
    });
    return row;
  }

  function paintRow(row, session) {
    const snap = session.timer.getSnapshot();
    const name = session.label || chipLabel(snap.config, presets());
    row.querySelector('.go-row-name').textContent = name;
    row.querySelector('.go-row-time').textContent = snap.mode === 'stopwatch'
      ? formatStopwatch(snap.totalElapsedMs).replace(/\.\d+$/, '')
      : formatPhase(snap.phase.remainingMs);
    const phase = row.querySelector('.go-row-phase');
    phase.textContent = snap.mode === 'stopwatch'
      ? (snap.status === 'running' ? 'run' : snap.status === 'paused' ? 'paused' : 'ready')
      : (snap.status === 'paused' ? 'paused' : snap.phase.label);
    phase.style.color = snap.phase.type === 'done' ? '#ffffff' : snap.phase.color;
    row.querySelector('[data-mini-face]').setAttribute('fill', snap.phase.color);
    const arcNode = row.querySelector('[data-mini-arc]');
    const progress = snap.status === 'complete' ? 1 : snap.phase.progress;
    arcNode.setAttribute('stroke', snap.phase.type === 'done' ? '#ffffff' : snap.phase.color);
    arcNode.setAttribute('stroke-dasharray', MINI_C.toFixed(2));
    arcNode.setAttribute('stroke-dashoffset', (MINI_C * (1 - Math.min(1, progress))).toFixed(2));
    arcNode.style.opacity = progress > 0.001 ? '1' : '0';
    const toggle = row.querySelector('[data-act="toggle"]');
    const running = snap.status === 'running';
    const toggleIcon = running ? 'pause' : 'play';
    if (toggle.dataset.icon !== toggleIcon) {
      toggle.dataset.icon = toggleIcon;
      toggle.innerHTML = running ? ICON.pause : ICON.play;
    }
    toggle.setAttribute('aria-label', running ? `Pause ${name}` : `Start ${name}`);
    row.querySelector('[data-act="skip"]').disabled = !(running || snap.status === 'paused');
    row.querySelector('[data-act="focus"]').setAttribute('aria-label', `Show ${name}`);
  }

  function summaryText(config) {
    const plan = planTimer(config);
    if (config.mode === 'stopwatch') return 'Counts up';
    if (!plan.limited) {
      const rest = config.restMs > 0 ? ` · ${formatPhase(config.restMs)} rest` : '';
      return `Unlimited · ${formatPhase(config.workMs)} work${rest}`;
    }
    return `${formatHMS(plan.totalMs)} total`;
  }

  function paintSheet() {
    for (const btn of shell.querySelectorAll('[data-mode]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === draft.mode));
    }
    q('[data-panel="interval"]').hidden = draft.mode !== 'interval';
    q('[data-panel="countdown"]').hidden = draft.mode !== 'countdown';
    q('[data-panel="stopwatch"]').hidden = draft.mode !== 'stopwatch';
    const setValue = (key, text) => {
      const node = q(`[data-value="${key}"]`);
      if (node) node.textContent = text;
    };
    setValue('durationMs', formatPhase(draft.durationMs));
    setValue('workMs', formatPhase(draft.workMs));
    setValue('restMs', formatPhase(draft.restMs));
    setValue('warmupMs', formatPhase(draft.warmupMs));
    setValue('rounds', draft.rounds == null ? '∞' : String(draft.rounds));
    const unlimited = draft.rounds == null;
    const switchBtn = q('[data-testid="unlimited"]');
    switchBtn.setAttribute('aria-checked', String(unlimited));
    for (const btn of shell.querySelectorAll('[data-bump="rounds"]')) btn.disabled = unlimited;
    const minFor = { durationMs: 5000, workMs: 5000, restMs: 0, warmupMs: 0 };
    const maxMs = 3 * 60 * 60 * 1000;
    for (const key of Object.keys(minFor)) {
      const down = q(`[data-bump="${key}"][data-dir="-1"]`);
      const up = q(`[data-bump="${key}"][data-dir="1"]`);
      down.disabled = draft[key] <= minFor[key];
      up.disabled = draft[key] >= maxMs;
    }
    summary.textContent = summaryText(draft);
    for (const btn of quickBox.children) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.seconds) * 1000 === draft.durationMs));
    }
    for (const btn of roundBox.children) {
      btn.setAttribute('aria-pressed', String(draft.rounds === Number(btn.dataset.rounds)));
    }
    for (const btn of workBox.children) {
      btn.setAttribute('aria-pressed', String(draft.mode === 'interval' && draft.workMs === Number(btn.dataset.work) * 1000));
    }
    for (const btn of restBox.children) {
      btn.setAttribute('aria-pressed', String(draft.mode === 'interval' && draft.restMs === Number(btn.dataset.rest) * 1000));
    }
    for (const btn of presetBox.querySelectorAll('[data-preset-id]')) {
      const preset = presets().find((item) => item.id === btn.dataset.presetId);
      btn.setAttribute('aria-pressed', preset ? String(configsEqual(preset.config, draft)) : 'false');
    }
  }

  function paintPresets() {
    presetBox.replaceChildren();
    for (const preset of presets()) {
      const row = document.createElement('div');
      row.className = 'go-preset';
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'go-preset-apply';
      apply.dataset.presetId = preset.id;
      apply.textContent = preset.short;
      apply.setAttribute('aria-label', preset.name);
      apply.addEventListener('click', () => {
        draft = cloneConfig(preset.config);
        onEdit();
      });
      row.appendChild(apply);
      if (!preset.builtin) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'go-preset-x';
        remove.setAttribute('aria-label', `Remove ${preset.name}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
          customPresets = customPresets.filter((item) => item.id !== preset.id);
          paintPresets();
          paintSheet();
          persist();
        });
        row.appendChild(remove);
      }
      presetBox.appendChild(row);
    }
    paintSheet();
  }

  function onEdit() {
    dirty = true;
    if (intent === 'edit') {
      const session = rack.focused();
      const status = session.timer.getSnapshot().status;
      if (status === 'idle' || status === 'complete') {
        session.timer.configure(draft);
        rack.setLabel(session.id, chipLabel(draft, presets()));
        dirty = false;
      }
    }
    paintSheet();
  }

  function bump(key, dir, mult = 1) {
    if (key === 'rounds') {
      if (draft.rounds == null) return;
      draft = { ...draft, rounds: Math.min(999, Math.max(1, draft.rounds + dir * mult)) };
    } else {
      const min = key === 'restMs' || key === 'warmupMs' ? 0 : 5000;
      const max = 3 * 60 * 60 * 1000;
      const step = 5000 * mult;
      draft = { ...draft, [key]: Math.min(max, Math.max(min, draft[key] + dir * step)) };
    }
    onEdit();
  }

  function bindHold(btn) {
    let delay = 0;
    let repeat = 0;
    let ticks = 0;
    let fromPointer = false;
    const stop = () => {
      clearTimeout(delay);
      clearInterval(repeat);
    };
    btn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || btn.disabled) return;
      btn.setPointerCapture(event.pointerId);
      fromPointer = true;
      ticks = 0;
      bump(btn.dataset.bump, Number(btn.dataset.dir), 1);
      delay = setTimeout(() => {
        repeat = setInterval(() => {
          ticks += 1;
          const mult = ticks > 14 ? 6 : ticks > 6 ? 2 : 1;
          bump(btn.dataset.bump, Number(btn.dataset.dir), mult);
        }, 55);
      }, 320);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('click', (event) => {
      if (fromPointer) {
        fromPointer = false;
        event.preventDefault();
        return;
      }
      if (!btn.disabled) bump(btn.dataset.bump, Number(btn.dataset.dir), 1);
    });
    btn.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  function setSheet(open) {
    backdrop.classList.toggle('is-open', open);
    backdrop.inert = !open;
    if (!open) settingsBtn.focus();
  }

  function openSheet() {
    intent = 'edit';
    draft = cloneConfig(focusedTimer().getSnapshot().config);
    dirty = false;
    const status = focusedTimer().getSnapshot().status;
    warn.hidden = !(status === 'running' || status === 'paused');
    addNote.hidden = true;
    removeBtn.hidden = rack.list().length < 2;
    nameInput.value = '';
    paintPresets();
    sheetTitle.textContent = 'Setup';
    doneBtn.textContent = 'Done';
    setSheet(true);
    sheet.focus();
  }

  function draftForNew() {
    const current = focusedTimer().getSnapshot().config;
    if (current.mode === 'interval') {
      return { mode: 'countdown', durationMs: 5 * 60_000, workMs: 60_000, restMs: 0, warmupMs: 0, rounds: 1 };
    }
    return { mode: 'interval', workMs: 20 * 60_000, restMs: 5 * 60_000, warmupMs: 0, rounds: 1, durationMs: 20 * 60_000 };
  }

  function openAdd() {
    if (rack.list().length >= 6) {
      showToast('Six timers is the limit');
      return;
    }
    intent = 'add';
    draft = draftForNew();
    dirty = true;
    warn.hidden = true;
    addNote.hidden = false;
    removeBtn.hidden = true;
    nameInput.value = '';
    paintPresets();
    sheetTitle.textContent = 'New timer';
    doneBtn.textContent = 'Add timer';
    setSheet(true);
    sheet.focus();
  }

  function closeSheet(commit) {
    if (intent === 'add') {
      if (commit) {
        const alongside = rack.anyRunning();
        const session = rack.add(draft, { label: chipLabel(draft, presets()) });
        rack.focus(session.id);
        alerts.unlock();
        session.timer.start();
        showToast(alongside ? 'Started. The other timer keeps going.' : 'Timer started');
      }
      intent = 'edit';
      setSheet(false);
      return;
    }
    if (commit && dirty) {
      const session = rack.focused();
      session.timer.configure(draft);
      rack.setLabel(session.id, chipLabel(draft, presets()));
      dirty = false;
    }
    setSheet(false);
  }

  function savePreset() {
    const name = nameInput.value.trim().slice(0, 24) || chipLabel(draft, presets());
    const short = name.length <= 8 ? name : formatPart(draft.mode === 'countdown' ? draft.durationMs : draft.workMs);
    customPresets = [
      ...customPresets,
      { id: `custom-${Date.now()}`, name, short: short.slice(0, 12), builtin: false, config: cloneConfig(draft) },
    ].slice(-6);
    nameInput.value = '';
    paintPresets();
    persist();
    showToast(`Saved “${name}”`);
  }

  function userToggle() {
    alerts.unlock();
    focusedTimer().toggle();
  }

  function onRackChange() {
    wake.setActive(rack.anyRunning());
    persist();
    render();
    kick();
  }

  rack.on('cue', ({ cue, voice }) => alerts.play(cue, voice));
  rack.on('phasechange', ({ id, snap }) => {
    if (id === rack.focusId) announce(snap);
    else {
      const session = rack.list().find((item) => item.id === id);
      live.textContent = `${session?.label || 'Timer'}, ${snap.phase.label}`;
    }
    persist();
  });
  rack.on('complete', ({ id }) => {
    if (id === rack.focusId) announce(focusedTimer().getSnapshot());
  });
  rack.on('change', onRackChange);
  rack.on('roster', onRackChange);

  function frame() {
    rack.sync();
    render();
    raf = rack.anyRunning() ? requestAnimationFrame(frame) : 0;
  }

  function kick() {
    if (rack.anyRunning() && !raf) raf = requestAnimationFrame(frame);
  }

  function restoreSession(timer, run) {
    const laps = run?.laps || [];
    if (run?.status === 'running' && Number.isFinite(run.origin)) {
      timer.restore({ elapsedMs: Math.max(0, Date.now() - run.origin), running: true, laps });
    } else if (run?.status === 'paused' && Number.isFinite(run.elapsedMs)) {
      timer.restore({ elapsedMs: Math.max(0, run.elapsedMs), running: false, laps });
    } else if (run?.status === 'complete') {
      timer.restore({ elapsedMs: Number.MAX_SAFE_INTEGER, running: false });
    }
  }

  for (const item of saved.timers) {
    const session = rack.add(item.config, { id: item.id, label: item.label, voice: item.voice });
    if (!session.label) rack.setLabel(session.id, chipLabel(session.timer.getSnapshot().config, presets()));
    restoreSession(session.timer, item.run);
  }
  if (saved.focusId) rack.focus(saved.focusId);

  paintSound();
  paintPresets();
  render();
  if (rack.anyRunning()) {
    wake.setActive(true);
    kick();
  }
  backdrop.inert = true;

  chipBtn.addEventListener('click', openSheet);
  settingsBtn.addEventListener('click', openSheet);
  q('[data-testid="add"]').addEventListener('click', openAdd);
  soundBtn.addEventListener('click', () => {
    alerts.unlock();
    alerts.setSound(!alerts.sound);
    paintSound();
    persist();
  });
  wakeBtn.addEventListener('click', () => {
    if (!wake.supported) showToast('This browser can’t keep the screen awake');
    else showToast('The screen stays on while the timer is running');
  });
  center.addEventListener('click', userToggle);
  toggleBtn.addEventListener('click', userToggle);
  restartBtn.addEventListener('click', () => {
    alerts.unlock();
    focusedTimer().restart();
  });
  skipBtn.addEventListener('click', () => {
    alerts.unlock();
    const timer = focusedTimer();
    if (timer.getSnapshot().mode === 'stopwatch') timer.lap();
    else timer.skip();
  });
  shell.addEventListener('pointerdown', () => alerts.unlock(), { passive: true });

  for (const btn of shell.querySelectorAll('[data-bump]')) bindHold(btn);
  for (const btn of shell.querySelectorAll('[data-mode]')) {
    btn.addEventListener('click', () => {
      draft = { ...draft, mode: btn.dataset.mode };
      onEdit();
    });
  }
  q('[data-testid="unlimited"]').addEventListener('click', () => {
    draft = { ...draft, rounds: draft.rounds == null ? 10 : null };
    onEdit();
  });
  quickBox.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-seconds]');
    if (!btn) return;
    draft = { ...draft, mode: 'countdown', durationMs: Number(btn.dataset.seconds) * 1000 };
    onEdit();
  });
  roundBox.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-rounds]');
    if (!btn) return;
    draft = { ...draft, rounds: Number(btn.dataset.rounds) };
    onEdit();
  });
  workBox.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-work]');
    if (!btn) return;
    draft = { ...draft, mode: 'interval', workMs: Number(btn.dataset.work) * 1000 };
    onEdit();
  });
  restBox.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-rest]');
    if (!btn) return;
    draft = { ...draft, mode: 'interval', restMs: Number(btn.dataset.rest) * 1000 };
    onEdit();
  });
  q('[data-testid="preset-save"]').addEventListener('click', savePreset);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      savePreset();
    }
  });
  doneBtn.addEventListener('click', () => closeSheet(true));
  removeBtn.addEventListener('click', () => {
    dirty = false;
    intent = 'edit';
    rack.remove(rack.focusId);
    showToast('Timer removed');
    setSheet(false);
  });
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeSheet(intent !== 'add');
  });
  sheet.addEventListener('click', (event) => event.stopPropagation());

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', persist);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  const keypad = q('[data-testid="keypad"]');
  const keypadDisplay = q('[data-testid="keypad-display"]');
  const keypadLabel = q('[data-testid="keypad-label"]');
  let keypadField = null;
  let keypadDigits = '';
  const FIELD_LABEL = { durationMs: 'Countdown', workMs: 'Work', restMs: 'Rest', warmupMs: 'Warm-up' };

  function paintKeypad() {
    keypadDisplay.textContent = digitsToMs(keypadDigits).text;
    keypadLabel.textContent = FIELD_LABEL[keypadField] || 'Time';
  }

  function openKeypad(field) {
    keypadField = field;
    keypadDigits = '';
    paintKeypad();
    keypad.hidden = false;
  }

  function closeKeypad() {
    keypad.hidden = true;
    keypadField = null;
  }

  function pushDigit(digit) {
    if (keypadDigits.length >= 6) return;
    keypadDigits = `${keypadDigits}${digit}`.replace(/^0+/, '');
    paintKeypad();
  }

  function commitKeypad() {
    if (!keypadField) return;
    if (!keypadDigits) {
      closeKeypad();
      return;
    }
    const { ms } = digitsToMs(keypadDigits);
    const optional = keypadField === 'restMs' || keypadField === 'warmupMs';
    const min = optional ? 0 : 1000;
    const max = keypadField === 'warmupMs' ? 60 * 60 * 1000 : 3 * 60 * 60 * 1000;
    draft = { ...draft, [keypadField]: Math.min(max, Math.max(min, ms)) };
    closeKeypad();
    onEdit();
  }

  for (const value of shell.querySelectorAll('.go-stepper-value[data-value]')) {
    if (value.dataset.value === 'rounds') continue;
    value.addEventListener('click', () => openKeypad(value.dataset.value));
  }
  keypad.addEventListener('click', (event) => {
    const digit = event.target.closest('[data-digit]');
    const key = event.target.closest('[data-key]');
    if (digit) pushDigit(digit.dataset.digit);
    else if (key?.dataset.key === 'back') {
      keypadDigits = keypadDigits.slice(0, -1);
      paintKeypad();
    } else if (key?.dataset.key === 'ok') commitKeypad();
  });

  function onKey(event) {
    if (!keypad.hidden) {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        pushDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        keypadDigits = keypadDigits.slice(0, -1);
        paintKeypad();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        commitKeypad();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeKeypad();
      }
      return;
    }
    if (event.key === 'Escape' && backdrop.classList.contains('is-open')) {
      closeSheet(intent !== 'add');
      return;
    }
    if (event.target.closest('input, textarea, button')) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      userToggle();
    } else if (event.key === 'ArrowRight' || event.key === 'l' || event.key === 'L') {
      const timer = focusedTimer();
      if (timer.getSnapshot().mode === 'stopwatch') timer.lap();
      else if (event.key === 'ArrowRight') timer.skip();
    } else if (event.key === 'r' || event.key === 'R') {
      focusedTimer().restart();
    }
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      persist();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      return;
    }
    rack.sync();
    render();
    kick();
    if (rack.anyRunning()) wake.setActive(true);
  }

  function destroy() {
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', persist);
    wake.destroy();
    alerts.close();
    rack.destroy();
    shell.remove();
  }

  return {
    get timer() {
      return rack.focused().timer;
    },
    rack,
    destroy,
    alerts,
  };
}
