import { throwIfAborted } from '../lib/asyncGuards'
import { getMyProfile, type UserProfile } from './profile'
import {
  getProjects,
  loadProjectEditorState,
  type Project,
  type ProjectEditorPayload,
} from './projects'

export type UserWorkspaceBootstrap = {
  profile: UserProfile | null
  projects: Project[]
  editorByProjectId: Record<string, ProjectEditorPayload>
}

/** מפתח localStorage לפרויקט האחרון שנפתח (ממשק בלבד) */
export const LAST_OPENED_PROJECT_STORAGE_KEY = 'lastProjectId'

function readLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED_PROJECT_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * אחרי התחברות: פרופיל + רשימת פרויקטים קלה, טעינה חוסמת של הפרויקט האחרון שנפתח,
 * ואז טעינת שאר הפרויקטים במקביל ברקע (למטמון — בלי לחסום UI).
 * `signal` — ביטול כל הרשת (למשל unmount לפני סיום); לא מעדכן state אחרי abort.
 */
export async function preloadUserWorkspaceData(signal?: AbortSignal): Promise<UserWorkspaceBootstrap> {
  throwIfAborted(signal)

  const [profile, projects] = await Promise.all([
    getMyProfile(signal).catch((): null => null),
    getProjects(signal).catch((): Project[] => []),
  ])

  throwIfAborted(signal)

  if (!projects.length) {
    return { profile, projects, editorByProjectId: {} }
  }

  const lastProjectId = readLastProjectId()
  const lastProject = projects.find((p) => p.id === lastProjectId) ?? projects[0]!

  const editorByProjectId: Record<string, ProjectEditorPayload> = {}

  try {
    const current = await loadProjectEditorState(lastProject.id, undefined, signal)
    editorByProjectId[lastProject.id] = current
  } catch {
    /* העורך יטען מחדש מהרשת או מהמטמון ב־AuthedApp */
  }

  throwIfAborted(signal)

  const rest = projects.filter((p) => p.id !== lastProject.id)
  void Promise.all(
    rest.map((p) => loadProjectEditorState(p.id, undefined, signal).catch(() => null)),
  )

  return { profile, projects, editorByProjectId }
}
