const CACHE = 'interval-timer-v9';
const scopeURL = new URL('./', self.location);
const scoped = (path) => new URL(path, scopeURL).href;
const SHELL = [
  scopeURL.href,
  scoped('index.html'),
  scoped('manifest.webmanifest'),
  scoped('favicon.svg'),
  scoped('icons/icon-192.png'),
  scoped('icons/icon-512.png'),
  scoped('icons/icon-maskable-512.png'),
  scoped('icons/apple-touch-icon.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const urls = event.data?.type === 'cache' ? event.data.urls : null;
  if (!urls?.length) return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Chrome asks a waking tab for these. fetch() throws, and answering with the
  // HTML shell makes the script fail and leaves a blank black page.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const documentRequest = req.mode === 'navigate' || req.destination === 'document';
  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      // Pages marks files with Vary: Accept-Encoding. A strict match misses on
      // resume, and the old fallback then served this HTML page as the script.
      const cached = await caches.match(req, { ignoreVary: true });
      if (cached) return cached;
      if (documentRequest) {
        const shell = await caches.match(scoped('index.html'), { ignoreVary: true });
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
