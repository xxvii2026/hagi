// Hagi service worker. Keeps the app shell so the installed app opens instantly, even on a bad connection.
// It never caches chain reads, the relayer, or the proving files (those keep the browser's normal caching,
// so a new circuit is always picked up).
const CACHE = 'hagi-shell-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/zk/')) return

  // Pages: open instantly from the saved shell and refresh it in the background, so a slow network never
  // shows a blank screen. A new release is picked up on the next open.
  if (req.mode === 'navigate') {
    const fresh = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)) } return res })
    e.respondWith(caches.match('/').then(hit => hit || fresh).catch(() => fresh))
    e.waitUntil(fresh.catch(() => {}))
    return
  }
  // Built files have a content hash in their name, so a saved copy is always the right one.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return res })))
  }
})
