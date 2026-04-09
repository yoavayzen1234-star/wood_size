import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getCurrentUser } from '../services/auth'
import { DashboardPage } from './DashboardPage'
import { LoginPage } from './LoginPage'

export function AuthApp() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const u = await getCurrentUser()
      setUser(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700 shadow-sm">
          טוען…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-900 shadow-sm">
          {error}
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onAuthed={() => void refresh()} />
  }

  return (
    <DashboardPage
      user={user}
      onLoggedOut={() => {
        setUser(null)
      }}
    />
  )
}

