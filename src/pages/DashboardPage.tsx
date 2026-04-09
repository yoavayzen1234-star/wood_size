import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { signOut } from '../services/auth'
import {
  createProject,
  deleteProject,
  getProjects,
  MAX_USER_PROJECTS_FRONTEND,
  type Project,
} from '../services/projects'

export function DashboardPage({ user, onLoggedOut }: { user: User | null; onLoggedOut: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setError(null)
    setBusy(true)
    try {
      const list = await getProjects()
      setProjects(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onCreate = async () => {
    if (projects.length >= MAX_USER_PROJECTS_FRONTEND) {
      alert('Maximum 10 projects allowed')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await createProject(name)
      setName('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (projectId: string) => {
    setError(null)
    setBusy(true)
    try {
      await deleteProject(projectId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onLogout = async () => {
    setError(null)
    setBusy(true)
    try {
      await signOut()
      onLoggedOut()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-600" dir="ltr">
            {user?.email ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onLogout()}
          disabled={busy}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:pointer-events-none disabled:opacity-50"
        >
          התנתקות
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm ring-1 ring-stone-100/80">
        <h2 className="text-base font-semibold text-stone-900">Projects</h2>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="h-11 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm shadow-sm outline-none focus:border-stone-700 focus:ring-2 focus:ring-stone-300"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם פרויקט"
          />
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={busy}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-stone-800 bg-stone-900 px-4 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 disabled:pointer-events-none disabled:opacity-50"
          >
            Create Project
          </button>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            רענן
          </button>
        </div>

        <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200">
          {projects.length === 0 ? (
            <li className="px-4 py-4 text-sm text-stone-600">אין פרויקטים עדיין.</li>
          ) : (
            projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-stone-900">{p.name}</p>
                  <p className="truncate text-xs text-stone-500" dir="ltr">
                    {p.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(p.id)}
                  disabled={busy}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:pointer-events-none disabled:opacity-50"
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}

