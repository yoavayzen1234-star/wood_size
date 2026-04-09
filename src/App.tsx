import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { LoginPage } from './pages/LoginPage'
import { AuthedCalculatorPage } from './pages/AuthedCalculatorPage'
import { clearProjectCache } from './lib/projectCache'
import { preloadUserWorkspaceData, type UserWorkspaceBootstrap } from './services/preloadUserData'
import { getCurrentUser, signOut } from './services/auth'

function welcomeFromBootstrap(boot: UserWorkspaceBootstrap, authUser: User): string {
  const n = boot.profile?.display_name?.trim()
  if (n) return n
  if (boot.profile?.email) return boot.profile.email
  const e = authUser.email?.trim()
  return e || 'משתמש'
}

export default function App() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [workspaceBootstrap, setWorkspaceBootstrap] = useState<UserWorkspaceBootstrap | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [welcomeName, setWelcomeName] = useState<string>('אורח')

  useEffect(() => {
    let alive = true
    const init = async () => {
      try {
        const u = await getCurrentUser()
        if (!alive) return
        if (!u) {
          setAuthUser(null)
          setWorkspaceBootstrap(null)
          setAuthLoading(false)
          return
        }
        let boot: UserWorkspaceBootstrap
        try {
          boot = await preloadUserWorkspaceData()
        } catch {
          boot = { profile: null, projects: [], editorByProjectId: {} }
        }
        if (!alive) return
        setWorkspaceBootstrap(boot)
        setWelcomeName(welcomeFromBootstrap(boot, u))
        setAuthUser(u)
      } catch {
        if (!alive) return
        setAuthUser(null)
        setWorkspaceBootstrap(null)
      } finally {
        if (!alive) return
        setAuthLoading(false)
      }
    }
    void init()
    return () => {
      alive = false
    }
  }, [])

  const completeLoginAfterAuth = useCallback(async () => {
    setAuthLoading(true)
    try {
      const u = await getCurrentUser()
      if (!u) {
        setAuthUser(null)
        setWorkspaceBootstrap(null)
        return
      }
      let boot: UserWorkspaceBootstrap
      try {
        boot = await preloadUserWorkspaceData()
      } catch {
        boot = { profile: null, projects: [], editorByProjectId: {} }
      }
      setWorkspaceBootstrap(boot)
      setWelcomeName(welcomeFromBootstrap(boot, u))
      setAuthUser(u)
    } catch {
      setAuthUser(null)
      setWorkspaceBootstrap(null)
    } finally {
      setAuthLoading(false)
    }
  }, [])

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
        <LoginPage onAuthed={() => void completeLoginAfterAuth()} />
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
  )
}
