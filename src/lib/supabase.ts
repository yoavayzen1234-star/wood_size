import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

const isBlank = (s: unknown) => typeof s !== 'string' || s.trim() === ''

if (isBlank(url) || isBlank(anonKey)) {
  throw new Error('Missing Supabase env. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

let logged = false

export const supabase = createClient(url!, anonKey!)

if (!logged) {
  logged = true
  // eslint-disable-next-line no-console
  console.info('[supabase] client initialized')
}

