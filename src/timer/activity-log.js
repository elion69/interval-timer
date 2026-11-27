// activity-log.js — logs every finished workout to the Activity Ledger, offline first.
// Same on-phone outbox and setup code as the Counter app (both live on elion69.github.io),
// so pasting the setup code in either app connects both.
import { createOutbox, idbStore, startFlushing, getLedger, setLedgerFromCode, syncStatus } from '../activity/outbox.js';
import { createSessionLogger } from './session-logger.js';

export function createActivityLog({ rack, panel, toast = () => {} }) {
  if (typeof indexedDB === 'undefined' || typeof document === 'undefined') return { destroy() {} };
  let waiting = 0;
  const store = idbStore();
  const outbox = createOutbox({ store, onStatus: (r) => { waiting = r.waiting; paint(); } });
  const flusher = startFlushing(outbox);
  const labelOf = (id) => rack.list().find((s) => s.id === id)?.label || '';
  const logger = createSessionLogger({
    rack,
    labelOf,
    log: (event) => store.put(event).then(() => { waiting += 1; paint(); flusher.afterTap(); }).catch(() => {}),
  });
  outbox.waiting().then((n) => { waiting = n; paint(); }).catch(() => {});

  function line() {
    const s = syncStatus();
    if (!getLedger()) return waiting ? `${waiting} workouts saved on the phone. Ledger not connected.` : 'Ledger not connected.';
    if (s.lastError === 'bad_key') return 'Ledger refused: check the setup code.';
    if (waiting) return `${waiting} waiting to sync.`;
    return s.lastOkMs ? `✓ Synced ${new Date(s.lastOkMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Connected.';
  }
  function paint() {
    const el = panel?.querySelector('[data-activity-status]');
    if (el) el.textContent = line();
  }

  panel?.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-activity]');
    if (!b) return;
    if (b.dataset.activity === 'connect') {
      try {
        setLedgerFromCode(panel.querySelector('[data-activity-code]').value);
        panel.querySelector('[data-activity-code]').value = '';
        const t = await outbox.test();
        toast(t.ok ? 'Ledger connected' : `Saved, but the ledger said: ${t.error || 'no answer'}`);
      } catch (err) { toast(err.message); }
    }
    const r = await outbox.flush({ force: true });
    if (b.dataset.activity === 'sync') toast(r.error ? `Not sent yet: ${r.error}` : 'Workouts synced');
    paint();
  });
  paint();

  return { destroy() { logger.destroy(); }, paint };
}
