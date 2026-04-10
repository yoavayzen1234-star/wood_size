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

/** פרופיל + רשימת פרויקטים בלבד — בלי חסימה על טעינת עורך. */
export async function fetchUserWorkspaceCore(signal?: AbortSignal): Promise<{
  profile: UserProfile | null
  projects: Project[]
}> {
  throwIfAborted(signal)

  const [profile, projects] = await Promise.all([
    getMyProfile(signal).catch((): null => null),
    getProjects(signal).catch((): Project[] => []),
  ])

  throwIfAborted(signal)
  return { profile, projects }
}

/**
 * מתחיל טעינת מצבי עורך לרקע (ממלא את מטמון הזיכרון ב־projectCache).
 * לא מחכים לסיום — ה־UI נשען על useProjectEditor + loadProjectEditorState.
 */
export function startEditorBackgroundPrefetch(projects: Project[], signal?: AbortSignal): void {
  if (!projects.length) return

  const lastProjectId = readLastProjectId()
  const lastProject = projects.find((p) => p.id === lastProjectId) ?? projects[0]!

  void loadProjectEditorState(lastProject.id, undefined, signal).catch(() => {
    /* העורך ייטען שוב מהרשת או מהמטמון */
  })

  const rest = projects.filter((p) => p.id !== lastProject.id)
  void Promise.all(
    rest.map((p) => loadProjectEditorState(p.id, undefined, signal).catch(() => null)),
  )
}

/**
 * אחרי התחברות: פרופיל + פרויקטים במקביל; מצבי עורך נטענים ברקע בלבד (לא חוסמים החזרה).
 * `signal` — ביטול רשת; לא מעדכן state אחרי abort.
 */
export async function preloadUserWorkspaceData(signal?: AbortSignal): Promise<UserWorkspaceBootstrap> {
  const { profile, projects } = await fetchUserWorkspaceCore(signal)
  startEditorBackgroundPrefetch(projects, signal)
  return { profile, projects, editorByProjectId: {} }
}
