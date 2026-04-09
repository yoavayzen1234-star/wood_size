import { useState } from 'react'
import { signIn, signUp } from '../services/auth'

export function LoginPage({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') await signUp(email, password)
      else await signIn(email, password)
      onAuthed()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-stone-100/80">
        <h1 className="text-xl font-bold text-stone-900">התחברות</h1>
        <p className="mt-1 text-sm text-stone-600">Email + סיסמה</p>

        <form
          className="mt-5 grid gap-3"
          autoComplete="on"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <label className="grid gap-1 text-sm text-stone-700">
            אימייל
            <input
              className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-stone-700 focus:ring-2 focus:ring-stone-300"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputMode="email"
              autoComplete="username"
              dir="ltr"
            />
          </label>

          <label className="grid gap-1 text-sm text-stone-700">
            סיסמה
            <input
              className="h-11 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-stone-700 focus:ring-2 focus:ring-stone-300"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              dir="ltr"
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-lg border border-stone-800 bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy ? 'רגע…' : mode === 'signup' ? 'הרשמה' : 'כניסה'}
          </button>

          <button
            type="button"
            onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
            className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            {mode === 'signin' ? 'אין לך משתמש? הרשמה' : 'יש לך משתמש? התחברות'}
          </button>
        </form>
      </div>
    </div>
  )
}

