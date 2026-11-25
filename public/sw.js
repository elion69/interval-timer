const CACHE = 'interval-timer-v21';
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

function recoveryPage() {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#000000">
<title>Interval Timer</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; color: #fff; }
  body { display: flex; align-items: center; justify-content: center; padding: 28px; box-sizing: border-box; text-align: center; font-family: Roboto, Helvetica, Arial, sans-serif; }
  p { max-width: 320px; line-height: 1.4; }
  button { margin-top: 8px; background: #fff; color: #111; border: 0; border-radius: 999px; padding: 14px 22px; font-size: 16px; font-weight: 700; }
  .hint { color: #aaa; font-size: 14px; }
</style>
</head><body>
<div>
  <p>The timer hit a problem and stopped drawing.</p>
  <p><button type="button" id="reload">Reload timer</button></p>
  <p class="hint">If the screen stays black after that, in Chrome tap the lock icon beside the address, then Site settings, then Clear data. Open the timer again.</p>
</div>
<script>
document.getElementById('reload').addEventListener('click', function () {
  var jobs = [];
  if (navigator.serviceWorker) {
    jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
    }));
  }
  if (window.caches) {
    jobs.push(caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) { return caches.delete(key); }));
    }));
  }
  Promise.all(jobs).catch(function () {}).then(function () {
    location.replace(location.pathname + '?fresh=' + Date.now());
  });
});
</script>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'RELOAD', version: '21' });
  })());
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
      const parsed = new URL(url);
      return parsed.origin === self.location.origin && !parsed.pathname.endsWith('/sw.js');
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

async function fromNetwork(req) {
  // Do not call fetch(request, init). On Android that throws for a navigation
  // request, the worker answers with a network error, and the page stays black.
  const url = new URL(req.url);
  url.searchParams.set('__sw', Date.now().toString(36));
  return fetch(url.href, { cache: 'no-store', credentials: 'same-origin' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;

  const scriptRequest = isScript(req, url);
  const documentRequest = isDocument(req);

  event.respondWith((async () => {
    try {
      const res = await fromNetwork(req);
      if (!res || !res.ok) throw new Error('bad-response');
      if (scriptRequest && isHtml(res)) throw new Error('html-for-script');
      if (res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: true, ignoreVary: true });
      if (cached && !(scriptRequest && isHtml(cached))) return cached;
      if (documentRequest) {
        const shell = await caches.match(scoped('index.html'), { ignoreSearch: true, ignoreVary: true })
          || await caches.match(scopeURL.href, { ignoreSearch: true, ignoreVary: true });
        if (shell && isHtml(shell)) return shell;
        return recoveryPage();
      }
      return Response.error();
    }
  })());
});
