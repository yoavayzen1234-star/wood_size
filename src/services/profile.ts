import { throwIfAborted } from '../lib/asyncGuards'
import { supabase } from '../lib/supabase'

export type UserProfile = {
  id: string
  email: string | null
  display_name: string
  created_at: string
}

export async function getMyProfile(signal?: AbortSignal): Promise<UserProfile | null> {
  if (!supabase) return null
  throwIfAborted(signal)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const { data } = await supabase.auth.getSession()
    throwIfAborted(signal)
    const u = data.session?.user
    if (!u?.id) return null
    return {
      id: u.id,
      email: u.email ?? null,
      display_name: '',
      created_at: new Date().toISOString(),
    }
  }
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  throwIfAborted(signal)
  if (authErr) throw new Error(authErr.message)
  const uid = authData.user?.id
  if (!uid) return null

  let q = supabase.from('users').select('*').eq('id', uid)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q.single<UserProfile>()
  if (error) throw new Error(error.message)
  return data ?? null
}

