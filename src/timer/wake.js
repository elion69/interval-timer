/** Screen Wake Lock. No-ops where the browser does not support it. */

export function createWakeLock(onChange = () => {}) {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  let sentinel = null;
  let want = false;

  async function acquire() {
    if (!want || !supported) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const next = await navigator.wakeLock.request('screen');
      sentinel = next;
      next.addEventListener('release', () => {
        if (sentinel === next) sentinel = null;
        onChange(false);
      });
      onChange(true);
    } catch {
      sentinel = null;
      onChange(false);
    }
  }

  function setActive(on) {
    want = !!on;
    if (!want) {
      const current = sentinel;
      sentinel = null;
      current?.release?.().catch(() => {});
      onChange(false);
      return;
    }
    acquire();
  }

  function onVisibility() {
    if (document.visibilityState === 'visible') acquire();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return {
    supported,
    setActive,
    get active() {
      return !!sentinel;
    },
    destroy() {
      setActive(false);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    },
  };
}
