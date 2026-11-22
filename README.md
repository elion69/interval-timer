# Interval Timer

A phone-first interval timer for Lorn Allison. It runs in the browser, installs as an app, and works offline. There is no account and no server.

Three modes:

- **Countdown** — one duration, then it stops.
- **Intervals** — work, rest, an optional warm-up, and a fixed or unlimited number of rounds.
- **Stopwatch** — counts up, with laps. The ring sweeps once a minute.

The ring moves clockwise with the current interval. Pink is work (`go`), green is rest, amber is warm-up, blue is a plain countdown. The number on the ring is how many rounds are left, including the one you're in. The thin clock at the top is the total time left (or elapsed, when rounds are unlimited).

Timing uses the wall clock, not `setInterval` ticks, so locking the phone or switching apps does not make it drift. A running session is remembered in `localStorage` and continues if the page is opened again.

The **+** button starts another timer without stopping the one on screen. The big ring is the timer you're looking at. The others sit in a stack underneath, each with its own ring, play, skip, and beep. A stopwatch can run next to an interval. Up to six at once. Tap a row to bring that timer up front.

Tap a time (work, rest, warm-up, or countdown) and type it. Digits fill from the right, so `2000` is 20:00. The 20:00 and 5:00 chips are still there.

## Live site

https://elion69.github.io/interval-timer/

Pushing `main` to `github.com/elion69/interval-timer` runs the Pages workflow and republishes that same URL. Updates that only change `remote/command.json` do not rebuild the site.

## Remote start

While the page is open it checks a public command file about every 5 seconds. A command runs once and is ignored if it is more than 2 minutes old. The timer still works with no connection.

From a machine logged into GitHub as someone who can push to the repo:

```bash
scripts/send-command.sh start "20 on / 5 off"
scripts/send-command.sh pause
scripts/send-command.sh stop
```

Or reply to the agent: `start 20 on / 5 off`.

## Run it

```bash
npm install
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:43123 on your computer, or the same address from your phone if you're on the same network (`npm run dev` is the same port with live reload).

## Install on Android

1. Open the page in **Chrome**.
2. Tap the Chrome menu (⋮).
3. Tap **Install app** or **Add to Home screen**.
4. Open **Interval** from the home screen. It is fullscreen, and after that first visit it loads with no connection.

If Chrome doesn't offer install, the page was opened in a browser that doesn't support installable apps (an in-app browser, for example). Use Chrome.

The speaker button mutes the beeps. The phone still vibrates on phase changes when the browser allows it. The screen stays awake while a timer is running, on phones that support the Wake Lock API.

Beeps are synthesized with the Web Audio API. There are no sound files.

## Presets

Built in, and stored with anything you save from the setup sheet:

| Preset | What it is |
| --- | --- |
| 1M | 1:00 work, no rest, 100 rounds |
| 30/30 | 30s work, 30s rest, 10 rounds |
| Tabata | 20s / 10s, 8 rounds |
| EMOM | 1:00 work, no rest, 10 rounds |
| 5M | a 5 minute countdown |

The last setup you used is restored the next time you open the app. Rest is not added after the final round.

## Embed the engine

`src/timer/engine.js` has no DOM, audio, or storage. The standalone screen is `mountTimer`. Both are exported from `src/timer/index.js`.

```js
import { createIntervalTimer } from './src/timer/engine.js';

const timer = createIntervalTimer({
  mode: 'interval',
  workMs: 30_000,
  restMs: 30_000,
  warmupMs: 0,
  rounds: 10, // null = unlimited
});

timer.onPhaseChange((snap) => {
  // snap.phase.label, snap.phase.remainingMs, snap.roundsRemaining, snap.totalRemainingMs
});
timer.on('cue', (cue) => {
  // { kind: 'phase' | 'tick' | 'complete', second?, phase }
});

timer.start();
timer.pause();
timer.resume();
timer.skip();
timer.restart();
timer.getSnapshot();

// Several at once. Each engine keeps its own timestamp.
import { createTimerRack } from './src/timer/rack.js';
const rack = createTimerRack();
const intervals = rack.add({ mode: 'interval', workMs: 1_200_000, restMs: 300_000, rounds: 4 }, { label: '20/5' });
const countdown = rack.add({ mode: 'countdown', durationMs: 600_000 }, { label: '10:00' });
intervals.timer.start();
countdown.timer.start();
rack.on('cue', ({ cue, voice }) => { /* voice 0–3 is a different beep */ });
```

Pass `{ now, schedule, clear }` as the second argument to drive the clock in tests. Call `sync()` when the tab becomes visible. `restore({ elapsedMs, running })` continues a saved session without beeping.

To drop the whole screen into another page:

```js
import { mountTimer } from './src/timer/mount.js';
import './src/styles.css';

const ui = mountTimer(document.querySelector('#timer'));
ui.timer.pause();
ui.destroy();
```
