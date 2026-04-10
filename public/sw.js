/**
 * PWA: cache-first לנכסים סטטיים; ניווט (SPA) — נסיון רשת ואז fallback ל־index מהמטמון.
 * לא נוגעים ב-Supabase Auth.
 */
const CACHE_NAME = 'woodcut-assets-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME)
        const scope = self.registration.scope
        await cache.add(new Request(new URL('index.html', scope).toString(), { cache: 'reload' }))
      } catch {
        /* dev / עדיין בלי קאש */
      }
      await self.skipWaiting()
    })(),
  )
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

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME)
            try {
              const copy = res.clone()
              await cache.put(new Request(new URL('index.html', self.registration.scope).toString()), copy)
            } catch {
              /* ignore */
            }
          }
          return res
        } catch {
          const cache = await caches.open(CACHE_NAME)
          const scope = self.registration.scope
          const hit =
            (await cache.match(new URL('index.html', scope).toString())) ||
            (await cache.match(scope)) ||
            (await cache.match(scope + 'index.html'))
          if (hit) return hit
          return new Response('Offline', { status: 503, statusText: 'Offline' })
        }
      })(),
    )
    return
  }

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
