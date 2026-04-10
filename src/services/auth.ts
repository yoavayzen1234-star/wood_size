import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

function isAuthSessionMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return msg.toLowerCase().includes('auth session missing')
}

export async function signUp(email: string, password: string): Promise<User> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign up failed (missing user).')
  return data.user
}

export async function signIn(email: string, password: string): Promise<User> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign in failed (missing user).')
  return data.user
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { data } = await supabase.auth.getSession()
    return data.session?.user ?? null
  }
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (isAuthSessionMissingError(error)) return null
    throw new Error(error.message)
  }
  return data.user ?? null
}

