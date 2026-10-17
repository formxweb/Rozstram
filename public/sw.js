/* Rozstram service worker — uygulama kabuğunu önbelleğe alır */
const V = 'roz-de1aefeae3';
const SHELL = ['/', '/assets/app-6ae05c5e90.js', '/assets/app-12dbc39f1a.css', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V && k.indexOf('roz-') === 0).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put('/', copy)); return res; }).catch(() => caches.match('/')));
      return;
    }
    if (url.pathname.indexOf('/assets/') === 0 || url.pathname.indexOf('/icons/') === 0) {
      e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); return res; })));
    }
    return;
  }
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.indexOf('/npm/@supabase/') === 0) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(req, copy)); } return res; })));
  }
});
