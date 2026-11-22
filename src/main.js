import '@fontsource/roboto/latin-200.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-500.css';
import '@fontsource/roboto/latin-700.css';
import './styles.css';
import { mountTimer } from './timer/mount.js';

mountTimer(document.getElementById('app'));

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      const send = () => {
        const urls = performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.startsWith(location.origin));
        reg.active?.postMessage({ type: 'cache', urls: [location.origin + '/', ...urls] });
      };
      if (navigator.serviceWorker.controller) send();
      else navigator.serviceWorker.addEventListener('controllerchange', send, { once: true });
    }).catch(() => {});
  });
}
