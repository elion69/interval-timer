const CACHE = 'interval-timer-v10';
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
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  const urls = event.data?.type === 'cache' ? event.data.urls : null;
  if (!urls?.length) return;
  const safe = urls.filter((url) => {
    try {
      return new URL(url).origin === self.location.origin && !url.includes('/sw.js');
    } catch {
      return false;
    }
  });
  if (!safe.length) return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(safe)));
});

function isScript(req, url) {
  return req.destination === 'script' || url.pathname.endsWith('.js');
}

function isDocument(req) {
  return req.mode === 'navigate' || req.destination === 'document';
}

function isHtml(res) {
  return (res.headers.get('content-type') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // A waking Chrome tab asks for these. fetch() throws, and answering with the
  // HTML page is what left the screen black.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept the worker script, or a bad copy can block the next update.
  if (url.pathname.endsWith('/sw.js')) return;

  const scriptRequest = isScript(req, url);
  const documentRequest = isDocument(req);

  event.respondWith((async () => {
    try {
      const res = await fetch(req, scriptRequest || documentRequest ? { cache: 'no-store' } : undefined);
      if (scriptRequest && isHtml(res)) throw new Error('html-for-script');
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req, { ignoreVary: true });
      if (cached && !(scriptRequest && isHtml(cached))) return cached;
      if (documentRequest) {
        const shell = await caches.match(scoped('index.html'), { ignoreVary: true });
        if (shell) return shell;
      }
      return Response.error();
    }
  })());
});
