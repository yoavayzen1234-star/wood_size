import type { ProjectEditorPayload } from '../services/projects'

/** Editor payload cached per project (alias for clarity in this module). */
export type ProjectEditorState = ProjectEditorPayload

export const PROJECT_CACHE_STALE_TIME = 1000 * 60 * 3 // 3 minutes

export type CachedProjectState<T> = {
  data?: T
  fetchedAt?: number
  promise?: Promise<T>
}

const cache = new Map<string, CachedProjectState<ProjectEditorState>>()

export function cloneProjectEditorState(p: ProjectEditorState): ProjectEditorState {
  return {
    kerfMm: p.kerfMm,
    rows: p.rows.map((r) => ({ ...r })),
    storeStockLengthsCm: [...p.storeStockLengthsCm],
    storeStockLengthsByMaterial: { ...p.storeStockLengthsByMaterial },
  }
}

export function getCachedProjectState(
  projectId: string,
): CachedProjectState<ProjectEditorState> | undefined {
  const id = String(projectId ?? '').trim()
  if (!id) return undefined
  return cache.get(id)
}

export function setCachedProjectState(projectId: string, data: ProjectEditorState): void {
  const id = String(projectId ?? '').trim()
  if (!id) return
  cache.set(id, {
    data: cloneProjectEditorState(data),
    fetchedAt: Date.now(),
  })
}

export function invalidateProjectState(projectId: string): void {
  const id = String(projectId ?? '').trim()
  if (!id) return
  cache.delete(id)
}

export function invalidateAllProjectStates(): void {
  cache.clear()
}

/** @deprecated Prefer `invalidateAllProjectStates` */
export const clearProjectCache = invalidateAllProjectStates

export function isProjectStateFresh(projectId: string): boolean {
  const id = String(projectId ?? '').trim()
  if (!id) return false
  const e = cache.get(id)
  if (!e?.data || e.fetchedAt === undefined) return false
  return Date.now() - e.fetchedAt < PROJECT_CACHE_STALE_TIME
}

function clearPromiseIfCurrent(id: string, pending: Promise<unknown>): void {
  const cur = cache.get(id)
  if (cur?.promise !== pending) return
  const { promise: _p, ...rest } = cur
  cache.set(id, rest)
}

/**
 * Fetches latest state, updates cache, and optionally notifies (e.g. when the project is still open).
 * Deduplicates: reuses an in-flight promise for the same project.
 */
export function refreshProjectStateInBackground(
  projectId: string,
  fetcher: () => Promise<ProjectEditorState>,
  onUpdate?: (data: ProjectEditorState) => void,
): void {
  const id = String(projectId ?? '').trim()
  if (!id) return

  const entry = cache.get(id)
  if (entry?.promise) {
    void entry.promise
      .then((d) => onUpdate?.(cloneProjectEditorState(d)))
      .catch(() => {})
    return
  }

  const pending = fetcher()
    .then((data) => {
      cache.set(id, {
        data: cloneProjectEditorState(data),
        fetchedAt: Date.now(),
      })
      onUpdate?.(cloneProjectEditorState(data))
      return data
    })
    .finally(() => {
      clearPromiseIfCurrent(id, pending)
    })

  cache.set(id, {
    ...entry,
    data: entry?.data,
    fetchedAt: entry?.fetchedAt,
    promise: pending,
  })
  void pending.catch(() => {
    /* background refresh — errors are non-fatal */
  })
}

export async function getProjectStateOrFetch(
  projectId: string,
  fetcher: () => Promise<ProjectEditorState>,
  onBackgroundUpdate?: (data: ProjectEditorState) => void,
): Promise<ProjectEditorState> {
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('Project id is required.')

  const entry = cache.get(id)
  const now = Date.now()

  if (entry?.data !== undefined) {
    const isFresh =
      entry.fetchedAt !== undefined && now - entry.fetchedAt < PROJECT_CACHE_STALE_TIME
    if (isFresh) {
      return cloneProjectEditorState(entry.data)
    }
    if (entry.promise) {
      void entry.promise
        .then((d) => onBackgroundUpdate?.(cloneProjectEditorState(d)))
        .catch(() => {})
      return cloneProjectEditorState(entry.data)
    }
    refreshProjectStateInBackground(id, fetcher, onBackgroundUpdate)
    return cloneProjectEditorState(entry.data)
  }

  if (entry?.promise) {
    const data = await entry.promise
    return cloneProjectEditorState(data)
  }

  const pending = fetcher()
    .then((data) => {
      cache.set(id, {
        data: cloneProjectEditorState(data),
        fetchedAt: Date.now(),
      })
      return data
    })
    .catch((err) => {
      const cur = cache.get(id)
      if (!cur?.data) invalidateProjectState(id)
      throw err
    })
    .finally(() => {
      clearPromiseIfCurrent(id, pending)
    })

  cache.set(id, {
    ...entry,
    promise: pending,
  })

  const data = await pending
  return cloneProjectEditorState(data)
}
