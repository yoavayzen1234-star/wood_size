import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const AuthedCalculatorPage = lazy(() =>
  import('./pages/AuthedCalculatorPage').then((m) => ({ default: m.AuthedCalculatorPage })),
)
import { isAbortError } from './lib/asyncGuards'
import { offlineClearAllForUser } from './lib/offlineDb'
import { clearProjectCache, invalidateAllProjectStates } from './lib/projectCache'
import {
  clearWorkspaceLocalCache,
  isWorkspaceLocalCacheFresh,
  readWorkspaceLocalCache,
  writeWorkspaceLocalCache,
} from './lib/workspaceLocalCache'
import type { UserWorkspaceBootstrap } from './services/preloadUserData'
import { preloadUserWorkspaceData } from './services/preloadUserData'
import { getCurrentUser, signOut } from './services/auth'
import { onSyncComplete, runOfflineOutboxSync } from './sync/syncEngine'

function welcomeFromBootstrap(boot: UserWorkspaceBootstrap, authUser: User): string {
  const n = boot.profile?.display_name?.trim()
  if (n) return n
  if (boot.profile?.email) return boot.profile.email
  const e = authUser.email?.trim()
  return e || 'משתמש'
}

function AppRouteFallback() {
  return (
    <div className="mx-auto min-h-[40vh] max-w-lg px-4 py-10" aria-busy="true" aria-label="טוען">
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="h-4 w-3/4 max-w-md animate-pulse rounded bg-stone-200" />
        <div className="h-4 w-1/2 max-w-xs animate-pulse rounded bg-stone-200" />
        <div className="h-24 animate-pulse rounded-lg bg-stone-100" />
      </div>
    </div>
  )
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [workspaceBootstrap, setWorkspaceBootstrap] = useState<UserWorkspaceBootstrap | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [welcomeName, setWelcomeName] = useState<string>('אורח')
  const [workspaceRemoteHydrated, setWorkspaceRemoteHydrated] = useState(false)

  const workspacePreloadAbortRef = useRef<AbortController | null>(null)
  const remoteRunGenRef = useRef(0)
  const authUserRef = useRef<User | null>(null)
  authUserRef.current = authUser

  const beginWorkspacePreload = useCallback(() => {
    workspacePreloadAbortRef.current?.abort()
    const ac = new AbortController()
    workspacePreloadAbortRef.current = ac
    return ac
  }, [])

  const runWorkspaceHydration = useCallback((user: User, ac: AbortController) => {
    const uid = user.id
    const runId = ++remoteRunGenRef.current
    void (async () => {
      try {
        const boot = await preloadUserWorkspaceData(ac.signal)
        if (ac.signal.aborted || runId !== remoteRunGenRef.current) return
        setWorkspaceBootstrap(boot)
        setWelcomeName(welcomeFromBootstrap(boot, user))
        writeWorkspaceLocalCache(uid, { profile: boot.profile, projects: boot.projects })
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return
        if (runId !== remoteRunGenRef.current) return
        /* שומרים מצב קיים (למשל מ-cache) */
      } finally {
        if (!ac.signal.aborted && runId === remoteRunGenRef.current) {
          setWorkspaceRemoteHydrated(true)
        }
      }
    })()
  }, [])

  useEffect(() => {
    const ac = beginWorkspacePreload()
    const init = async () => {
      try {
        const u = await getCurrentUser()
        if (ac.signal.aborted) return
        if (!u) {
          setAuthUser(null)
          setWorkspaceBootstrap(null)
          setWorkspaceRemoteHydrated(false)
          return
        }

        const cached = readWorkspaceLocalCache(u.id)
        const useCache = isWorkspaceLocalCacheFresh(cached)
        const initialBoot: UserWorkspaceBootstrap =
          useCache && cached
            ? { profile: cached.profile, projects: cached.projects, editorByProjectId: {} }
            : { profile: null, projects: [], editorByProjectId: {} }

        setAuthUser(u)
        setWorkspaceBootstrap(initialBoot)
        setWelcomeName(welcomeFromBootstrap(initialBoot, u))
        setWorkspaceRemoteHydrated(false)

        runWorkspaceHydration(u, ac)
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return
        setAuthUser(null)
        setWorkspaceBootstrap(null)
        setWorkspaceRemoteHydrated(false)
      } finally {
        if (!ac.signal.aborted) {
          setAuthLoading(false)
        }
      }
    }
    void init()
    return () => {
      ac.abort()
    }
  }, [beginWorkspacePreload, runWorkspaceHydration])

  useEffect(() => {
    return onSyncComplete(() => {
      const u = authUserRef.current
      if (!u) return
      invalidateAllProjectStates()
      void (async () => {
        try {
          const boot = await preloadUserWorkspaceData()
          if (!authUserRef.current) return
          setWorkspaceBootstrap(boot)
          setWelcomeName(welcomeFromBootstrap(boot, u))
          writeWorkspaceLocalCache(u.id, { profile: boot.profile, projects: boot.projects })
        } catch {
          /* ignore */
        }
      })()
    })
  }, [])

  useEffect(() => {
    if (!authUser) return
    void runOfflineOutboxSync()
  }, [authUser])

  const completeLoginAfterAuth = useCallback(async () => {
    const ac = beginWorkspacePreload()
    try {
      const u = await getCurrentUser()
      if (ac.signal.aborted) return
      if (!u) {
        setAuthUser(null)
        setWorkspaceBootstrap(null)
        setWorkspaceRemoteHydrated(false)
        return
      }

      const cached = readWorkspaceLocalCache(u.id)
      const useCache = isWorkspaceLocalCacheFresh(cached)
      const initialBoot: UserWorkspaceBootstrap =
        useCache && cached
          ? { profile: cached.profile, projects: cached.projects, editorByProjectId: {} }
          : { profile: null, projects: [], editorByProjectId: {} }

      setAuthUser(u)
      setWorkspaceBootstrap(initialBoot)
      setWelcomeName(welcomeFromBootstrap(initialBoot, u))
      setWorkspaceRemoteHydrated(false)

      runWorkspaceHydration(u, ac)
    } catch (e) {
      if (ac.signal.aborted || isAbortError(e)) return
      setAuthUser(null)
      setWorkspaceBootstrap(null)
      setWorkspaceRemoteHydrated(false)
    }
  }, [beginWorkspacePreload, runWorkspaceHydration])

  if (authLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10" aria-busy="true" aria-label="טוען">
        <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-stone-200" />
          <div className="h-20 animate-pulse rounded-lg bg-stone-100" />
        </div>
      </div>
    )
  }

  if (!authUser || !workspaceBootstrap) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Suspense fallback={<AppRouteFallback />}>
          <LoginPage onAuthed={() => void completeLoginAfterAuth()} />
        </Suspense>
      </div>
    )
  }

  return (
    <Suspense fallback={<AppRouteFallback />}>
      <AuthedCalculatorPage
        welcomeName={welcomeName}
        workspaceBootstrap={workspaceBootstrap}
        workspaceRemoteHydrated={workspaceRemoteHydrated}
        onSignOut={() => void (async () => {
          remoteRunGenRef.current += 1
          const uid = authUser?.id
          clearProjectCache()
          if (uid) {
            clearWorkspaceLocalCache(uid)
            try {
              await offlineClearAllForUser(uid)
            } catch {
              /* ignore */
            }
          }
          await signOut()
          setAuthUser(null)
          setWorkspaceBootstrap(null)
          setWorkspaceRemoteHydrated(false)
        })()}
      />
    </Suspense>
  )
}
