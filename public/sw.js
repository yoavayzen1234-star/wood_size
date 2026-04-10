/**
 * PWA: cache-first לנכסים סטטיים מאותו מקור (JS/CSS/fonts/images).
 * לא נוגעים ב-Supabase Auth או בבקשות cross-origin.
 */
const CACHE_NAME = 'woodcut-assets-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

function isSupabaseAuthRequest(url) {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('supabase.co')) return false
    return u.pathname.includes('/auth/v1/')
  } catch {
    return false
  }
}

function shouldCacheFirstSameOrigin(url) {
  try {
    const u = new URL(url)
    if (u.origin !== self.location.origin) return false
    const p = u.pathname
    if (p === '/manifest.json') return false
    if (p.startsWith('/assets/')) return true
    if (/\.(?:js|css|woff2?|png|svg|ico)$/i.test(p)) return true
    return false
  } catch {
    return false
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = req.url
  if (isSupabaseAuthRequest(url)) return
  if (!shouldCacheFirstSameOrigin(url)) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) {
        try {
          await cache.put(req, res.clone())
        } catch {
          /* ignore quota */
        }
      }
      return res
    })(),
  )
})
