import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { isAbortError } from '../lib/asyncGuards'
import {
  createProject,
  deleteProject,
  getProjects,
  MAX_USER_PROJECTS_FRONTEND,
  renameProject,
  type Project,
} from '../services/projects'

export type ProjectTabsProps = {
  activeProjectId: string | null
  onSelect: (project: Project) => void
  /** שומר את הפרויקט הפעיל לפני מעבר טאב / מחיקה (כולל ביטול debounce) */
  flushPendingEditorSave: () => Promise<void>
  /** אם הוגדר — רשימת הפרויקטים כבר נטענה בפרילוד (בלי getProjects כפול) */
  prefetchedProjects?: Project[]
}

/** שם לפרויקט חדש — ממשיך מספור "פרויקט N" לפי המקסימום הקיים */
function nextProjectName(existing: Project[]): string {
  let maxN = 0
  for (const p of existing) {
    const m = /^פרויקט\s*(\d+)\s*$/u.exec(p.name.trim())
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
  }
  return `פרויקט ${maxN + 1}`
}

export function ProjectsTabs({
  activeProjectId,
  onSelect,
  flushPendingEditorSave,
  prefetchedProjects,
}: ProjectTabsProps) {
  const [projects, setProjects] = useState<Project[]>(() => prefetchedProjects ?? [])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    projectId: string
  } | null>(null)

  const deletingRef = useRef(false)
  const refreshAbortRef = useRef<AbortController | null>(null)
  const refreshGenRef = useRef(0)

  const refresh = useCallback(async () => {
    refreshAbortRef.current?.abort()
    const ac = new AbortController()
    refreshAbortRef.current = ac
    const gen = ++refreshGenRef.current
    setError(null)
    try {
      const list = await getProjects(ac.signal)
      if (gen !== refreshGenRef.current || ac.signal.aborted) return list
      setProjects(list)
      return list
    } catch (e) {
      if (ac.signal.aborted || isAbortError(e)) return []
      setError(e instanceof Error ? e.message : String(e))
      throw e
    }
  }, [])

  useEffect(() => {
    if (prefetchedProjects !== undefined) {
      setProjects(prefetchedProjects)
      if (!activeProjectId) {
        const first = prefetchedProjects[0]
        if (first) {
          selectProject(first)
        } else {
          void (async () => {
            try {
              const p = await createProject('פרויקט 1')
              const next = await refresh()
              const created = next.find((x) => x.id === p.id) ?? p
              selectProject(created)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            }
          })()
        }
      }
      return () => {
        refreshAbortRef.current?.abort()
      }
    }

    void refresh()
      .then((list) => {
        if (activeProjectId) return
        const first = list[0]
        if (first) {
          selectProject(first)
          return
        }
        void (async () => {
          try {
            const p = await createProject('פרויקט 1')
            const next = await refresh()
            const created = next.find((x) => x.id === p.id) ?? p
            selectProject(created)
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        })()
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => {
      refreshAbortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectProject = async (p: Project) => {
    if (activeProjectId && activeProjectId !== p.id) {
      try {
        await flushPendingEditorSave()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    onSelect(p)
  }

  const createNew = async () => {
    if (projects.length >= MAX_USER_PROJECTS_FRONTEND) {
      alert('Maximum 10 projects allowed')
      return
    }
    setError(null)
    setCreating(true)
    try {
      const p = await createProject(nextProjectName(projects))
      setProjects((prev) => [...prev, p])
      selectProject(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  const tabLabelRefs = useRef<(HTMLButtonElement | null)[]>([])

  const focusProjectTabIndex = useCallback((index: number) => {
    const el = tabLabelRefs.current[index]
    if (el) {
      try {
        el.focus()
        el.scrollIntoView({ inline: 'nearest', block: 'nearest' })
      } catch {
        /* ignore */
      }
    }
  }, [])

  /**
   * סרגל dir=rtl: מימין (מסך) = אינדקס נמוך, משמאל = גבוה, + בקצה השמאלי.
   * לפי WAI-ARIA לטאבים אופקיים ב־RTL: חץ שמאל → הטאב הבא בקריאה (אינדקס +1), חץ ימין → הקודם (אינדקס −1).
   */
  const handleTabStripKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return

    const target = e.target as HTMLElement | null
    if (!target) return

    const tabBtn = target.closest('[data-project-tab-index]') as HTMLButtonElement | null
    const newBtn = target.closest('[data-project-new]')
    const rowEl = target.closest('[data-project-row-index]') as HTMLElement | null

    const n = projects.length
    if (n === 0) return

    let fromIdx: number
    if (tabBtn && tabBtn.dataset.projectTabIndex !== undefined) {
      fromIdx = Number(tabBtn.dataset.projectTabIndex)
      if (Number.isNaN(fromIdx) || fromIdx < 0 || fromIdx >= n) return
    } else if (newBtn) {
      fromIdx = n
    } else if (rowEl && rowEl.dataset.projectRowIndex !== undefined) {
      fromIdx = Number(rowEl.dataset.projectRowIndex)
      if (Number.isNaN(fromIdx) || fromIdx < 0 || fromIdx >= n) return
    } else {
      return
    }

    let nextIdx: number
    if (e.key === 'Home') {
      nextIdx = 0
    } else if (e.key === 'End') {
      nextIdx = n - 1
    } else if (e.key === 'ArrowLeft') {
      nextIdx = fromIdx >= n ? n - 1 : Math.min(n - 1, fromIdx + 1)
    } else {
      nextIdx = fromIdx >= n ? 0 : Math.max(0, fromIdx - 1)
    }

    const cur = projects.findIndex((p) => p.id === activeProjectId)
    if (cur >= 0 && nextIdx === cur) return

    e.preventDefault()
    const nextProject = projects[nextIdx]
    if (!nextProject) return
    selectProject(nextProject)
    requestAnimationFrame(() => focusProjectTabIndex(nextIdx))
  }

  const closeProject = async (e: MouseEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (projects.length <= 1) {
      setError('לא ניתן למחוק את הפרויקט האחרון')
      return
    }
    if (deletingRef.current) return

    const proj = projects.find((p) => p.id === id)
    const label = proj?.name?.trim() || 'פרויקט זה'
    const ok = window.confirm(
      `למחוק את הפרויקט "${label}"?\nהנתונים יימחקו לצמיתות ולא ניתן לשחזר אותם.`,
    )
    if (!ok) return

    deletingRef.current = true
    setError(null)

    const snapshot = [...projects]
    const wasActive = id === activeProjectId
    const remaining = snapshot.filter((p) => p.id !== id)

    try {
      try {
        await flushPendingEditorSave()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        deletingRef.current = false
        return
      }

      setProjects(remaining)
      if (wasActive) {
        const next = remaining[0]
        if (next) onSelect(next)
      }

      await deleteProject(id)
    } catch (err) {
      setProjects(snapshot)
      setError(err instanceof Error ? err.message : String(err))
      if (wasActive) {
        const back = snapshot.find((p) => p.id === id)
        if (back) onSelect(back)
      }
    } finally {
      deletingRef.current = false
    }
  }

  return (
    <div
      className="no-print relative w-full min-w-0"
      onClick={() => setMenu(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setMenu(null)
      }}
    >
      {/* סרגל נפרד: RTL — הפרויקט הראשון (הישן ביותר) בימין, חדשים נוספים משמאל, + בקצה השמאלי */}
      <div
        className="flex w-full min-w-0 flex-col rounded-xl border border-stone-300/90 bg-gradient-to-b from-stone-200 to-stone-300/95 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        role="tablist"
        aria-label="פרויקטים"
        aria-description="חצים שמאל וימין למעבר בין פרויקטים; Home ו-End לקצוות"
        aria-orientation="horizontal"
      >
        <div
          className="flex min-h-0 w-full min-w-0 items-center gap-0 overflow-x-auto overflow-y-visible px-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          dir="rtl"
          onKeyDown={handleTabStripKeyDown}
        >
          {projects.map((p, i) => {
            const isActive = p.id === activeProjectId
            return (
              <div
                key={p.id}
                data-project-row-index={i}
                className={[
                  'group relative flex min-w-0 max-w-[12rem] shrink items-center rounded-lg border transition-[background,box-shadow,color] duration-150',
                  isActive
                    ? 'z-[2] border-stone-400/80 bg-white shadow-sm'
                    : 'z-[1] border-stone-400/40 bg-stone-400/20 hover:bg-stone-400/35',
                ].join(' ')}
                dir="rtl"
              >
                <button
                  type="button"
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  data-project-tab-index={i}
                  ref={(el) => {
                    tabLabelRefs.current[i] = el
                  }}
                  onClick={() => selectProject(p)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setMenu({ x: e.clientX, y: e.clientY, projectId: p.id })
                  }}
                  className={[
                    'min-w-0 flex-1 truncate pe-2.5 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-stone-500/40 focus-visible:ring-offset-0',
                    isActive ? 'py-2 font-semibold text-stone-900' : 'py-1.5 font-medium text-stone-700 group-hover:text-stone-900',
                  ].join(' ')}
                  title={p.name}
                >
                  {p.name}
                </button>
                <button
                  type="button"
                  tabIndex={isActive ? 0 : -1}
                  onClick={(e) => void closeProject(e, p.id)}
                  className={[
                    'inline-flex w-7 shrink-0 items-center justify-center rounded-md text-stone-500 outline-none hover:bg-stone-200 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-500/40',
                    isActive ? 'opacity-90' : 'opacity-0 group-hover:opacity-100',
                  ].join(' ')}
                  aria-label="מחק פרויקט"
                  title="מחק פרויקט (נדרש אישור)"
                >
                  <X className="size-3.5" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            )
          })}

          <button
            type="button"
            data-project-new=""
            onClick={() => void createNew()}
            disabled={creating}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-xl font-light leading-none text-stone-800 hover:bg-stone-400/55 hover:text-stone-950 disabled:pointer-events-none disabled:opacity-40"
            aria-label="פרויקט חדש"
            title="פרויקט חדש"
          >
            +
          </button>
        </div>
      </div>

      {menu && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border border-stone-200 bg-white p-1 text-sm shadow-xl"
          style={{ left: menu.x, top: menu.y }}
          role="menu"
          aria-label="תפריט פרויקט"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full rounded-md px-3 py-2 text-start font-medium text-stone-800 hover:bg-stone-50"
            onClick={() => {
              const project = projects.find((p) => p.id === menu.projectId)
              const currentName = project?.name ?? ''
              const next = window.prompt('שם פרויקט חדש', currentName)
              setMenu(null)
              if (next == null) return
              void (async () => {
                const trimmed = next.trim()
                if (!trimmed) return
                try {
                  await renameProject(menu.projectId, trimmed)
                  setProjects((prev) =>
                    prev.map((p) => (p.id === menu.projectId ? { ...p, name: trimmed } : p)),
                  )
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                }
              })()
            }}
          >
            שנה שם…
          </button>
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </div>
      )}
    </div>
  )
}
