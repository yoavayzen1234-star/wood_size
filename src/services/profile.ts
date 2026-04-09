import { supabase } from '../lib/supabase'

export type UserProfile = {
  id: string
  email: string | null
  display_name: string
  created_at: string
}

export async function getMyProfile(): Promise<UserProfile | null> {
  if (!supabase) return null
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr) throw new Error(authErr.message)
  const uid = authData.user?.id
  if (!uid) return null

  const { data, error } = await supabase.from('users').select('*').eq('id', uid).single<UserProfile>()
  if (error) throw new Error(error.message)
  return data ?? null
}

