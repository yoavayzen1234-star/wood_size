import { useEffect, useMemo, useState } from 'react'
import type { Project } from '../services/projects'
import { pickInitialActiveProject } from '../lib/projectSelection'

export function useActiveProject(initialProjects: Project[]) {
  const [activeProject, setActiveProject] = useState<Project | null>(() =>
    pickInitialActiveProject(initialProjects),
  )

  const projectIdsKey = useMemo(
    () => initialProjects.map((p) => p.id).join('|'),
    [initialProjects],
  )

  useEffect(() => {
    if (initialProjects.length === 0) {
      setActiveProject(null)
      return
    }
    setActiveProject((prev) => {
      if (prev) {
        const fresh = initialProjects.find((p) => p.id === prev.id)
        if (fresh) return fresh
      }
      return pickInitialActiveProject(initialProjects)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- מסנכרן לפי זהות פרויקטים, לא לפי מערך חדש בכל רינדור
  }, [projectIdsKey])

  return { activeProject, setActiveProject }
}
