// Installable-app support: network first (so updates always show), cached copy only when offline.
const CACHE = 'gomi-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; // never touch Supabase / CDN calls
  e.respondWith(fetch(r).then((res) => { if (res.ok && (r.mode === 'navigate' || /\.(js|css|svg|png|webmanifest)$/.test(u.pathname))) { const c = res.clone(); caches.open(CACHE).then((x) => x.put(r.mode === 'navigate' ? './' : r, c)); } return res; })
    .catch(() => caches.match(r.mode === 'navigate' ? './' : r).then((m) => m || new Response('You are offline. Reconnect to keep shopping.', { status: 503, headers: { 'Content-Type': 'text/plain' } }))));
});
