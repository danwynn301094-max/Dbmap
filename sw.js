/* DB Map service worker
   Bump VERSION every time you upload a new index.html, or phones will keep the old one. */
const VERSION = '5.0';
const CACHE = 'dbmap-' + VERSION;

/* Files that must be cached for the app to open with no signal. */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-180.png',
  './icon-maskable-512.png'
];

/* Nice to have offline: fonts and the QR / spreadsheet libraries.
   If any of these fail to download, the install still succeeds. */
const EXTRA = [
  'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* Never cache the Google Apps Script backend. It must always go to the network. */
const isBackend = url => url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE);
    await Promise.all(EXTRA.map(u =>
      fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})
    ));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('dbmap-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isBackend(url)) return;

  /* Opening the app: serve the cached page straight away, then refresh it in the
     background so the next launch has the newest build. */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match('./index.html');
      const net = fetch(req).then(r => { if (r && r.ok) c.put('./index.html', r.clone()); return r; }).catch(() => null);
      return hit || (await net) || new Response(
        '<h1>DB Map</h1><p>No connection, and the app has not been saved on this phone yet. Open it once with signal.</p>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    })());
    return;
  }

  /* Everything else: cache first, then network, and keep whatever comes back. */
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreVary: true });
    if (hit) return hit;
    try {
      const r = await fetch(req);
      if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
      return r;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});
