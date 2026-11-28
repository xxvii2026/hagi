// Hagi service worker. Keeps the app shell so the installed app opens instantly, even on a bad connection.
// It never caches chain reads, the relayer, or the proving files (those keep the browser's normal caching,
// so a new circuit is always picked up).
const CACHE = 'hagi-shell-v3'
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

  // Pages: always try the network first so a new release shows up right away. The saved shell is only for a
  // slow or dead connection. (Serving the saved shell first could point at files from an older release
  // that no longer exist, which showed a blank page.)
  if (req.mode === 'navigate') {
    const fresh = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)) } return res })
    const slow = new Promise(r => setTimeout(r, 3500)).then(() => caches.match('/'))
    e.respondWith(Promise.race([fresh.catch(() => caches.match('/')), slow.then(hit => hit || fresh)]).then(r => r || fresh))
    return
  }
  // Built files have a content hash in their name, so a saved copy is always the right one.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname) || url.pathname.startsWith('/icons/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return res })))
  }
})
