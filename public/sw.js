/**
 * Minimal PWA service worker: no precache, no runtime cache, no offline fallback.
 * All navigations and fetch() requests use the default browser network stack.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})
