import '@fontsource/roboto/latin-200.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import './styles.css';
import { mountTimer } from './timer/mount.js';

try {
  mountTimer(document.getElementById('app'));
} catch (err) {
  window.__showTimerError?.(err?.message || 'The timer could not start.');
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = new URL('sw.js', window.location.href);
    const scope = new URL('./', window.location.href).pathname;
    navigator.serviceWorker.register(swUrl, { scope, updateViaCache: 'none' }).then((reg) => {
      const send = () => {
        const urls = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(location.origin));
        reg.active?.postMessage({ type: 'cache', urls: [new URL('./', location.href).href, ...urls] });
      };
      if (navigator.serviceWorker.controller) send();
      else navigator.serviceWorker.addEventListener('controllerchange', send, { once: true });
    }).catch(() => {});
  });
}
