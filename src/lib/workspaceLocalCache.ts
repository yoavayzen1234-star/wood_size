import type { UserProfile } from '../services/profile'
import type { Project } from '../services/projects'

const CACHE_VERSION = 1 as const
/** 7 דקות — איזון בין כניסה מהירה לעדכניות */
export const WORKSPACE_LOCAL_CACHE_TTL_MS = 7 * 60 * 1000

export type WorkspaceLocalCachePayload = {
  v: typeof CACHE_VERSION
  ts: number
  profile: UserProfile | null
  projects: Project[]
}

function keyForUser(userId: string): string {
  return `workspace_cache_v${CACHE_VERSION}_${userId}`
}

function isFresh(ts: number): boolean {
  return Date.now() - ts < WORKSPACE_LOCAL_CACHE_TTL_MS
}

export function readWorkspaceLocalCache(userId: string): WorkspaceLocalCachePayload | null {
  const uid = String(userId ?? '').trim()
  if (!uid) return null
  try {
    const raw = localStorage.getItem(keyForUser(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const o = parsed as Record<string, unknown>
    if (o.v !== CACHE_VERSION || typeof o.ts !== 'number') return null
    if (!Array.isArray(o.projects)) return null
    return {
      v: CACHE_VERSION,
      ts: o.ts,
      profile: (o.profile ?? null) as UserProfile | null,
      projects: o.projects as Project[],
    }
  } catch {
    return null
  }
}

export function writeWorkspaceLocalCache(
  userId: string,
  data: { profile: UserProfile | null; projects: Project[] },
): void {
  const uid = String(userId ?? '').trim()
  if (!uid) return
  try {
    const payload: WorkspaceLocalCachePayload = {
      v: CACHE_VERSION,
      ts: Date.now(),
      profile: data.profile,
      projects: data.projects,
    }
    localStorage.setItem(keyForUser(uid), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearWorkspaceLocalCache(userId: string): void {
  const uid = String(userId ?? '').trim()
  if (!uid) return
  try {
    localStorage.removeItem(keyForUser(uid))
  } catch {
    /* ignore */
  }
}

export function isWorkspaceLocalCacheFresh(entry: WorkspaceLocalCachePayload | null): boolean {
  if (!entry) return false
  return isFresh(entry.ts)
}
