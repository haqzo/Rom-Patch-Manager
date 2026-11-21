/*
 * Offline support for the installed app. App code: network first (updates arrive
 * immediately), cached copy when offline. Library files never change (named by
 * content hash): cache first, and all of them are cached in the background after install.
 */
const VERSION = 'rpm-1.1.4';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'i18n.js', 'platform.js', 'viewer.js', 'dev.js', 'dev-library.js', 'core/rom.js', 'core/plan.js', 'core/check.js', 'core/bgtemplate.js', 'core/edits.js', 'core/a115patch.js', 'tpl_a115_25.nsbmd',
  'core/nitro/index.js', 'core/nitro/reader.js', 'core/nitro/sniff.js', 'core/nitro/tex0.js', 'core/nitro/bmd0.js', 'core/nitro/bca0.js',
  'core/nitro/pose.js', 'core/nitro/mesh.js', 'core/nitro/dsRender.js', 'core/nitro/references.js',
  'library/library.json', 'data/mapnames.json', 'icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'no-cache' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION && k !== 'rpm-library') await caches.delete(k);
    await self.clients.claim();
    // fill the library cache in the background so the app works fully offline
    try {
      const lib = await (await fetch('library/library.json', 'data/mapnames.json', { cache: 'no-store' })).json();
      const cache = await caches.open('rpm-library');
      const want = [...Object.keys(lib.files).map((f) => 'library/files/' + f), ...(lib.thumbs || []).map((t) => 'library/previews/' + t + '.jpg')];
      for (const u of want) if (!(await cache.match(u))) { try { const r = await fetch(u); if (r.ok) await cache.put(u, r); } catch { /* try again next time */ } }
    } catch { /* offline right now */ }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.endsWith('/__ping')) return;
  if (/\/library\/(files|previews)\//.test(url.pathname)) {
    e.respondWith(caches.open('rpm-library').then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // no-cache: always ask the server (cheap ETag check), so a normal reload gets new versions
  const net = req.mode === 'navigate' ? fetch(url.href, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then((r) => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return r; }).catch(() => caches.match(req).then((m) => m || caches.match('index.html'))));
});

