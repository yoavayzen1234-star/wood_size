import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const AuthedCalculatorPage = lazy(() =>
  import('./pages/AuthedCalculatorPage').then((m) => ({ default: m.AuthedCalculatorPage })),
)
import { isAbortError } from './lib/asyncGuards'
import { clearProjectCache } from './lib/projectCache'
import type { UserWorkspaceBootstrap } from './services/preloadUserData'
import { getCurrentUser, signOut } from './services/auth'

function welcomeFromBootstrap(boot: UserWorkspaceBootstrap, authUser: User): string {
  const n = boot.profile?.display_name?.trim()
  if (n) return n
  if (boot.profile?.email) return boot.profile.email
  const e = authUser.email?.trim()
  return e || 'משתמש'
}

function AppRouteFallback() {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700 shadow-sm">
        טוען…
      </div>
    </div>
  )
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [workspaceBootstrap, setWorkspaceBootstrap] = useState<UserWorkspaceBootstrap | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [welcomeName, setWelcomeName] = useState<string>('אורח')

  /** ביטול טעינת workspace קודמת (init / התחברות חוזרת / unmount). */
  const workspacePreloadAbortRef = useRef<AbortController | null>(null)

  const beginWorkspacePreload = useCallback(() => {
    workspacePreloadAbortRef.current?.abort()
    const ac = new AbortController()
    workspacePreloadAbortRef.current = ac
    return ac
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
          setAuthLoading(false)
          return
        }
        const { preloadUserWorkspaceData } = await import('./services/preloadUserData')
        let boot: UserWorkspaceBootstrap
        try {
          boot = await preloadUserWorkspaceData(ac.signal)
        } catch (e) {
          if (ac.signal.aborted || isAbortError(e)) return
          boot = { profile: null, projects: [], editorByProjectId: {} }
        }
        if (ac.signal.aborted) return
        setWorkspaceBootstrap(boot)
        setWelcomeName(welcomeFromBootstrap(boot, u))
        setAuthUser(u)
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return
        setAuthUser(null)
        setWorkspaceBootstrap(null)
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
  }, [beginWorkspacePreload])

  const completeLoginAfterAuth = useCallback(async () => {
    const ac = beginWorkspacePreload()
    setAuthLoading(true)
    try {
      const u = await getCurrentUser()
      if (ac.signal.aborted) return
      if (!u) {
        setAuthUser(null)
        setWorkspaceBootstrap(null)
        return
      }
      const { preloadUserWorkspaceData } = await import('./services/preloadUserData')
      let boot: UserWorkspaceBootstrap
      try {
        boot = await preloadUserWorkspaceData(ac.signal)
      } catch (e) {
        if (ac.signal.aborted || isAbortError(e)) return
        boot = { profile: null, projects: [], editorByProjectId: {} }
      }
      if (ac.signal.aborted) return
      setWorkspaceBootstrap(boot)
      setWelcomeName(welcomeFromBootstrap(boot, u))
      setAuthUser(u)
    } catch (e) {
      if (ac.signal.aborted || isAbortError(e)) return
      setAuthUser(null)
      setWorkspaceBootstrap(null)
    } finally {
      if (!ac.signal.aborted) {
        setAuthLoading(false)
      }
    }
  }, [beginWorkspacePreload])

  if (authLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700 shadow-sm">
          טוען…
        </div>
      </div>
    )
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-stone-50">
        <Suspense fallback={<AppRouteFallback />}>
          <LoginPage onAuthed={() => void completeLoginAfterAuth()} />
        </Suspense>
      </div>
    )
  }

  if (!workspaceBootstrap) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700 shadow-sm">
          טוען…
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<AppRouteFallback />}>
      <AuthedCalculatorPage
        welcomeName={welcomeName}
        workspaceBootstrap={workspaceBootstrap}
        onSignOut={() => void (async () => {
          clearProjectCache()
          await signOut()
          setAuthUser(null)
          setWorkspaceBootstrap(null)
        })()}
      />
    </Suspense>
  )
}
