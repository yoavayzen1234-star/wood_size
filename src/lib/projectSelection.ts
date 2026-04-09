import { LAST_OPENED_PROJECT_STORAGE_KEY } from '../services/preloadUserData'
import type { Project } from '../services/projects'

export function pickInitialActiveProject(projects: Project[]): Project | null {
  if (projects.length === 0) return null
  let lastId: string | null = null
  try {
    lastId = localStorage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return projects.find((p) => p.id === lastId) ?? projects[0]!
}
