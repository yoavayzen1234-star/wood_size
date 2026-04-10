import { isAbortError, throwIfAborted } from '../lib/asyncGuards'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_STORE_STOCK_LENGTHS_CM,
  normalizeStoreStockLengthsCm,
  type PartSplitStrategy,
} from '../lib/cuttingOptimizer'
import {
  offlineAppendOutbox,
  offlineDeleteProjectRecord,
  offlineGetEditorSnapshot,
  offlineGetProjectRow,
  offlineGetProjectsForUser,
  offlineMirrorServerProjects,
  offlinePutEditorSnapshot,
  offlinePutProjectMirror,
  offlineQueueSaveEditor,
  offlineRemoveOutboxForProject,
  offlineUpsertProjectLocal,
  type OfflineProjectRow,
} from '../lib/offlineDb'
import { computeProjectEditorDiff } from '../lib/projectEditorDiff'
import {
  getProjectStateOrFetch,
  invalidateProjectState,
  setCachedProjectState,
} from '../lib/projectCache'
import { randomId } from '../lib/randomId'

/** מגבלה בממשק בלבד — השרת/DB אחראים לאכיפה נפרדת */
export const MAX_USER_PROJECTS_FRONTEND = 10

export type Project = {
  id: string
  user_id: string
  name: string
  kerf_mm: number
  created_at: string
  updated_at?: string
}

export type ProjectEditorRow = {
  id: string
  heightCm: string
  widthCm: string
  lengthCm: string
  quantity: string
  name: string
  splitStrategy?: PartSplitStrategy
}

export type ProjectEditorPayload = {
  kerfMm: number
  rows: ProjectEditorRow[]
  storeStockLengthsCm: number[]
  storeStockLengthsByMaterial: Record<string, number[]>
}

function emptyEditorRow(): ProjectEditorRow {
  return {
    id: randomId(),
    heightCm: '',
    widthCm: '',
    lengthCm: '',
    quantity: '',
    name: '',
  }
}

function legacyEditorPayloadFromData(data: unknown): ProjectEditorPayload | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const rows: ProjectEditorRow[] = []
  const rowsRaw = d.rows
  if (Array.isArray(rowsRaw)) {
    for (const item of rowsRaw) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      if (typeof o.id !== 'string') continue
      const symmetric = o.splitStrategy === 'symmetric'
      rows.push({
        id: o.id,
        heightCm: typeof o.heightCm === 'string' ? o.heightCm : '',
        widthCm: typeof o.widthCm === 'string' ? o.widthCm : '',
        lengthCm: typeof o.lengthCm === 'string' ? o.lengthCm : '',
        quantity: typeof o.quantity === 'string' ? o.quantity : '',
        name: typeof o.name === 'string' ? o.name : '',
        ...(symmetric ? { splitStrategy: 'symmetric' as const } : {}),
      })
    }
  }
  const kerfMm =
    typeof d.kerfMm === 'number' && Number.isFinite(d.kerfMm) ? Math.max(0, d.kerfMm) : 0
  let storeStockLengthsCm = [...DEFAULT_STORE_STOCK_LENGTHS_CM]
  if (Array.isArray(d.storeStockLengthsCm)) {
    const nums = (d.storeStockLengthsCm as unknown[])
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .map((x) => Math.round(x))
    if (nums.length) storeStockLengthsCm = [...new Set(nums)].sort((a, b) => a - b)
  }
  const storeStockLengthsByMaterial: Record<string, number[]> = {}
  const mat = d.storeStockLengthsByMaterial
  if (mat && typeof mat === 'object' && !Array.isArray(mat)) {
    for (const [k, v] of Object.entries(mat as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue
      const nums = v
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0)
        .map((x) => Math.round(x))
      if (nums.length) storeStockLengthsByMaterial[k] = [...new Set(nums)].sort((a, b) => a - b)
    }
  }
  return { kerfMm, rows, storeStockLengthsCm, storeStockLengthsByMaterial }
}

/** בלי `data` — חוסך העברת JSON כבד לכל פרויקט ברשימה; kerf נטען מ־loadProjectEditorState */
const PROJECT_LIST_SELECT_LITE = 'id, user_id, name, created_at, updated_at'

type ProjectListRowLite = {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at?: string
}

function projectFromListRowLite(row: ProjectListRowLite): Project {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    kerf_mm: 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function isMissingDbObject(err: { message?: string } | null): boolean {
  const m = (err?.message ?? '').toLowerCase()
  return (
    m.includes('does not exist') ||
    m.includes('could not find') ||
    m.includes('schema cache') ||
    m.includes('undefined table')
  )
}

function isOfflineWorkMode(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

function defaultOfflineEditorPayload(): ProjectEditorPayload {
  return {
    kerfMm: 0,
    rows: [emptyEditorRow()],
    storeStockLengthsCm: normalizeStoreStockLengthsCm([...DEFAULT_STORE_STOCK_LENGTHS_CM]),
    storeStockLengthsByMaterial: {},
  }
}

function offlineRowToProject(row: OfflineProjectRow): Project {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    kerf_mm: 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function shouldFallbackSaveToDataJson(err: { message?: string } | null): boolean {
  const m = (err?.message ?? '').toLowerCase()
  return m.includes('save_project_editor_state') || (m.includes('function') && m.includes('does not exist'))
}

async function requireUserId(signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal)
  if (isOfflineWorkMode()) {
    const { data } = await supabase.auth.getSession()
    throwIfAborted(signal)
    const uid = data.session?.user?.id
    if (!uid) throw new Error('Not authenticated.')
    return uid
  }
  const { data, error } = await supabase.auth.getUser()
  throwIfAborted(signal)
  if (error) throw new Error(error.message)
  const uid = data.user?.id
  if (!uid) throw new Error('Not authenticated.')
  return uid
}

/** Per-project save coordination: abort stale requests; latest generation wins. */
const saveAbortByProject = new Map<string, AbortController>()
const saveGenerationByProject = new Map<string, number>()

export function abortPendingProjectSave(projectId: string): void {
  const id = String(projectId ?? '').trim()
  if (!id) return
  saveAbortByProject.get(id)?.abort()
}

function beginProjectSave(projectId: string): {
  generation: number
  signal: AbortSignal
  releaseController: () => void
} {
  const id = String(projectId ?? '').trim()
  saveAbortByProject.get(id)?.abort()
  const ac = new AbortController()
  saveAbortByProject.set(id, ac)
  const generation = (saveGenerationByProject.get(id) ?? 0) + 1
  saveGenerationByProject.set(id, generation)
  return {
    generation,
    signal: ac.signal,
    releaseController: () => {
      if (saveAbortByProject.get(id) === ac) saveAbortByProject.delete(id)
    },
  }
}

function isCurrentSaveGeneration(projectId: string, generation: number): boolean {
  const id = String(projectId ?? '').trim()
  return saveGenerationByProject.get(id) === generation
}

export async function createProject(name: string): Promise<Project> {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Project name is required.')

  const userId = await requireUserId()

  if (isOfflineWorkMode()) {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const row: OfflineProjectRow = {
      id,
      userId,
      name: trimmed,
      created_at: now,
      pendingCreate: true,
    }
    await offlineUpsertProjectLocal(row)
    const initial = defaultOfflineEditorPayload()
    await offlinePutEditorSnapshot(id, initial)
    await offlineAppendOutbox({
      op: 'create_project',
      projectId: id,
      userId,
      name: trimmed,
    })
    return offlineRowToProject(row)
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name: trimmed })
    .select(PROJECT_LIST_SELECT_LITE)
    .single<ProjectListRowLite>()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Create project failed (missing row).')
  const created = projectFromListRowLite(data)
  try {
    await offlinePutProjectMirror(created)
  } catch {
    /* ignore */
  }
  return created
}

export async function getProjects(signal?: AbortSignal): Promise<Project[]> {
  const userId = await requireUserId(signal)
  throwIfAborted(signal)

  if (isOfflineWorkMode()) {
    return offlineGetProjectsForUser(userId)
  }

  let q = supabase
    .from('projects')
    .select(PROJECT_LIST_SELECT_LITE)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q

  if (error) throw new Error(error.message)
  const list = (data ?? []).map((row) => projectFromListRowLite(row as ProjectListRowLite))
  try {
    await offlineMirrorServerProjects(userId, list)
  } catch {
    /* IndexedDB לא זמין — ממשיכים */
  }
  return list
}

export async function deleteProject(projectId: string): Promise<void> {
  const id = String(projectId ?? '').trim()
  if (!id) return

  if (isOfflineWorkMode()) {
    await requireUserId()
    const row = await offlineGetProjectRow(id)
    if (row?.pendingCreate) {
      await offlineDeleteProjectRecord(id)
      await offlineRemoveOutboxForProject(id)
    } else if (row) {
      await offlineUpsertProjectLocal({ ...row, pendingDelete: true })
      await offlineAppendOutbox({ op: 'delete_project', projectId: id })
    } else {
      await offlineAppendOutbox({ op: 'delete_project', projectId: id })
    }
    invalidateProjectState(id)
    saveAbortByProject.delete(id)
    saveGenerationByProject.delete(id)
    return
  }

  const userId = await requireUserId()
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', userId)
  if (error) throw new Error(error.message)
  invalidateProjectState(id)
  saveAbortByProject.delete(id)
  saveGenerationByProject.delete(id)
  try {
    await offlineDeleteProjectRecord(id)
  } catch {
    /* ignore */
  }
}

async function saveProjectEditorStateRpcFull(
  projectId: string,
  payload: ProjectEditorPayload,
  signal: AbortSignal,
): Promise<void> {
  const id = String(projectId ?? '').trim()
  throwIfAborted(signal)
  await requireUserId()
  throwIfAborted(signal)

  const { error } = await supabase
    .rpc('save_project_editor_state', {
      p_project_id: id,
      p_kerf_mm: payload.kerfMm,
      p_parts: payload.rows,
      p_default_lengths: payload.storeStockLengthsCm,
      p_material_overrides: payload.storeStockLengthsByMaterial,
    })
    .abortSignal(signal)

  if (!error) return

  if (shouldFallbackSaveToDataJson(error)) {
    throwIfAborted(signal)
    const dataDoc = {
      kerfMm: payload.kerfMm,
      rows: payload.rows,
      storeStockLengthsCm: payload.storeStockLengthsCm,
      storeStockLengthsByMaterial: payload.storeStockLengthsByMaterial,
    }
    const { error: e2 } = await supabase
      .from('projects')
      .update({ data: dataDoc })
      .eq('id', id)
      .abortSignal(signal)
    if (e2) throw new Error(e2.message)
    return
  }

  throw new Error(error.message)
}

async function updateProjectKerfOnly(
  projectId: string,
  kerfMm: number,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const { error } = await supabase
    .from('projects')
    .update({ kerf_mm: Math.max(0, kerfMm) })
    .eq('id', projectId)
    .abortSignal(signal)
  if (error) throw new Error(error.message)
}

async function replaceProjectPartsTable(
  projectId: string,
  rows: ProjectEditorRow[],
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const { error: dErr } = await supabase
    .from('project_parts')
    .delete()
    .eq('project_id', projectId)
    .abortSignal(signal)
  if (dErr) {
    if (isMissingDbObject(dErr)) throw dErr
    throw new Error(dErr.message)
  }
  if (rows.length === 0) return
  const insert = rows.map((r, i) => ({
    project_id: projectId,
    sort_order: i,
    client_row_id: r.id,
    height_cm: r.heightCm,
    width_cm: r.widthCm,
    length_cm: r.lengthCm,
    quantity: r.quantity,
    name: r.name,
    split_strategy: r.splitStrategy === 'symmetric' ? 'symmetric' : 'max-first',
  }))
  const { error } = await supabase.from('project_parts').insert(insert).abortSignal(signal)
  if (error) throw new Error(error.message)
}

async function replaceProjectStockTable(
  projectId: string,
  payload: ProjectEditorPayload,
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal)
  const { error: dErr } = await supabase
    .from('project_stock_lengths')
    .delete()
    .eq('project_id', projectId)
    .abortSignal(signal)
  if (dErr) {
    if (isMissingDbObject(dErr)) throw dErr
    throw new Error(dErr.message)
  }

  const insertRows: Array<{
    project_id: string
    material_key: string
    sort_order: number
    length_cm: number
  }> = []

  const g = payload.storeStockLengthsCm
  for (let i = 0; i < g.length; i++) {
    insertRows.push({
      project_id: projectId,
      material_key: '',
      sort_order: i,
      length_cm: g[i]!,
    })
  }
  for (const [matKey, arr] of Object.entries(payload.storeStockLengthsByMaterial)) {
    if (!matKey) continue
    for (let i = 0; i < arr.length; i++) {
      insertRows.push({
        project_id: projectId,
        material_key: matKey,
        sort_order: i,
        length_cm: arr[i]!,
      })
    }
  }
  if (insertRows.length === 0) return
  const { error } = await supabase.from('project_stock_lengths').insert(insertRows).abortSignal(signal)
  if (error) throw new Error(error.message)
}

export type PersistProjectResult = 'saved' | 'noop' | 'aborted'

/**
 * Persists editor state when it differs from `baseline` (last known saved snapshot).
 * Uses granular updates when a single section changed; otherwise one transactional RPC.
 * Latest in-flight save wins; superseded work returns `aborted` without updating cache.
 */
export async function persistProjectEditorIfChanged(
  projectId: string,
  baseline: ProjectEditorPayload | null | undefined,
  next: ProjectEditorPayload,
): Promise<PersistProjectResult> {
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('Project id is required.')

  const diff = computeProjectEditorDiff(baseline ?? null, next)
  if (!diff.any) return 'noop'

  const { generation, signal, releaseController } = beginProjectSave(id)

  try {
    if (isOfflineWorkMode()) {
      throwIfAborted(signal)
      const snap = cloneEditorPayload(next)
      await offlinePutEditorSnapshot(id, snap)
      await offlineQueueSaveEditor(id, snap)
      if (!isCurrentSaveGeneration(id, generation)) return 'aborted'
      setCachedProjectState(id, next)
      return 'saved'
    }

    await requireUserId()
    throwIfAborted(signal)

    const stockTouched = diff.stockDefaults || diff.stockMaterials
    const sectionCount =
      (diff.kerf ? 1 : 0) + (diff.parts ? 1 : 0) + (stockTouched ? 1 : 0)

    const useFullRpc = baseline == null || sectionCount > 1

    try {
      if (useFullRpc) {
        await saveProjectEditorStateRpcFull(id, next, signal)
      } else if (diff.kerf) {
        await updateProjectKerfOnly(id, next.kerfMm, signal)
      } else if (diff.parts) {
        await replaceProjectPartsTable(id, next.rows, signal)
      } else if (stockTouched) {
        await replaceProjectStockTable(id, next, signal)
      }
    } catch (e) {
      if (signal.aborted || isAbortError(e)) return 'aborted'
      if (!useFullRpc && (isMissingDbObject(e as { message?: string }) || shouldFallbackSaveToDataJson(e as { message?: string }))) {
        try {
          await saveProjectEditorStateRpcFull(id, next, signal)
        } catch (e2) {
          if (signal.aborted || isAbortError(e2)) return 'aborted'
          throw e2
        }
      } else {
        throw e
      }
    }

    if (!isCurrentSaveGeneration(id, generation)) return 'aborted'
    setCachedProjectState(id, next)
    try {
      await offlinePutEditorSnapshot(id, cloneEditorPayload(next))
    } catch {
      /* ignore */
    }
    return 'saved'
  } finally {
    releaseController()
  }
}

/** Full save (no baseline). Prefer `persistProjectEditorIfChanged` when you track last saved state. */
export async function saveProjectEditorState(projectId: string, payload: ProjectEditorPayload): Promise<void> {
  await persistProjectEditorIfChanged(projectId, null, payload)
}

/** Removes one part row from `project_parts` (e.g. user deleted a row before debounced save). */
export async function deleteProjectPartRow(
  projectId: string,
  clientRowId: string,
  signal?: AbortSignal,
): Promise<void> {
  const id = String(projectId ?? '').trim()
  const rid = String(clientRowId ?? '').trim()
  if (!id || !rid) return

  if (isOfflineWorkMode()) return

  await requireUserId()
  let q = supabase.from('project_parts').delete().eq('project_id', id).eq('client_row_id', rid)
  if (signal) q = q.abortSignal(signal)
  const { error } = await q
  if (error) {
    if (isMissingDbObject(error)) return
    throw new Error(error.message)
  }
}

export function cloneEditorPayload(p: ProjectEditorPayload): ProjectEditorPayload {
  return {
    kerfMm: p.kerfMm,
    rows: p.rows.map((r) => ({ ...r })),
    storeStockLengthsCm: [...p.storeStockLengthsCm],
    storeStockLengthsByMaterial: { ...p.storeStockLengthsByMaterial },
  }
}

/**
 * Loads editor state from Supabase only (no cache read). Used by the cache layer.
 */
async function fetchProjectEditorStateFromRemote(
  projectId: string,
  signal: AbortSignal,
): Promise<ProjectEditorPayload> {
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('Project id is required.')

  await requireUserId(signal)
  throwIfAborted(signal)

  let projRowRes = await supabase
    .from('projects')
    .select('kerf_mm, data')
    .eq('id', id)
    .abortSignal(signal)
    .single()
  let eProj = projRowRes.error
  let projRow: unknown = projRowRes.data

  if (eProj?.message?.includes('kerf_mm')) {
    const retry = await supabase
      .from('projects')
      .select('data')
      .eq('id', id)
      .abortSignal(signal)
      .single()
    eProj = retry.error
    projRow = retry.data
  }

  throwIfAborted(signal)
  if (eProj) throw new Error(eProj.message)
  if (!projRow || typeof projRow !== 'object') throw new Error('Project not found.')
  const proj = projRow as { kerf_mm?: unknown; data?: unknown }

  const kerfMmRaw = proj.kerf_mm
  let kerfMm =
    typeof kerfMmRaw === 'number' && Number.isFinite(kerfMmRaw) ? Math.max(0, kerfMmRaw) : 0

  const partsRes = await supabase
    .from('project_parts')
    .select('client_row_id, height_cm, width_cm, length_cm, quantity, name, split_strategy')
    .eq('project_id', id)
    .order('sort_order', { ascending: true })
    .abortSignal(signal)

  let partRows = partsRes.data
  if (partsRes.error) {
    if (!isMissingDbObject(partsRes.error)) throw new Error(partsRes.error.message)
    partRows = []
  }

  throwIfAborted(signal)

  const stockRes = await supabase
    .from('project_stock_lengths')
    .select('material_key, sort_order, length_cm')
    .eq('project_id', id)
    .order('material_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .abortSignal(signal)

  let stockRows = stockRes.data
  if (stockRes.error) {
    if (!isMissingDbObject(stockRes.error)) throw new Error(stockRes.error.message)
    stockRows = []
  }

  throwIfAborted(signal)

  let rows: ProjectEditorRow[] = (partRows ?? []).map((r) => {
    const base: ProjectEditorRow = {
      id: r.client_row_id,
      heightCm: r.height_cm ?? '',
      widthCm: r.width_cm ?? '',
      lengthCm: r.length_cm ?? '',
      quantity: r.quantity ?? '',
      name: r.name ?? '',
    }
    const ss = (r as { split_strategy?: string }).split_strategy
    if (ss === 'symmetric') base.splitStrategy = 'symmetric'
    return base
  })

  const legacy = legacyEditorPayloadFromData((proj as { data?: unknown }).data)

  const hasNormalizedTables =
    (partRows ?? []).length > 0 || (stockRows ?? []).length > 0

  if (rows.length === 0) {
    if (legacy && legacy.rows.length > 0) {
      rows = legacy.rows
    } else {
      rows = [emptyEditorRow()]
    }
  }

  if (!hasNormalizedTables && kerfMm === 0 && legacy && legacy.kerfMm > 0) {
    kerfMm = legacy.kerfMm
  }

  let storeStockLengthsCm = [...DEFAULT_STORE_STOCK_LENGTHS_CM]
  const byMaterial: Record<string, number[]> = {}
  const global: number[] = []

  for (const s of stockRows ?? []) {
    const mk = s.material_key ?? ''
    if (mk === '') {
      global.push(s.length_cm)
    } else {
      if (!byMaterial[mk]) byMaterial[mk] = []
      byMaterial[mk].push(s.length_cm)
    }
  }

  if (global.length > 0) {
    storeStockLengthsCm = [...new Set(global)].sort((a, b) => a - b)
  } else if (!hasNormalizedTables && legacy) {
    storeStockLengthsCm = legacy.storeStockLengthsCm
  }

  let storeStockLengthsByMaterial = byMaterial
  if (Object.keys(storeStockLengthsByMaterial).length === 0) {
    if (!hasNormalizedTables && legacy) {
      storeStockLengthsByMaterial = { ...legacy.storeStockLengthsByMaterial }
    }
  }

  return {
    kerfMm,
    rows,
    storeStockLengthsCm,
    storeStockLengthsByMaterial,
  }
}

/** אות שמעולם לא מבוטל — לטעינות legacy בלי AbortController חיצוני. */
const STATIC_NON_ABORTING = new AbortController().signal

/**
 * Cache-first load with staleTime, deduplicated fetches, and optional background refresh callback.
 * `signal` — ביטול טעינה (מעבר פרויקט / unmount); קריאות ל־onBackgroundFresh נחסמות אחרי abort.
 */
export async function loadProjectEditorState(
  projectId: string,
  onBackgroundFresh?: (data: ProjectEditorPayload) => void,
  signal?: AbortSignal,
): Promise<ProjectEditorPayload> {
  const id = String(projectId ?? '').trim()
  if (!id) throw new Error('Project id is required.')
  throwIfAborted(signal)

  const eff = signal ?? STATIC_NON_ABORTING
  const wrapBg = onBackgroundFresh
    ? (d: ProjectEditorPayload) => {
        if (eff.aborted) return
        onBackgroundFresh(cloneEditorPayload(d))
      }
    : undefined

  const fetcher = async (): Promise<ProjectEditorPayload> => {
    if (isOfflineWorkMode()) {
      let snap = await offlineGetEditorSnapshot(id)
      if (!snap) {
        const pr = await offlineGetProjectRow(id)
        if (pr && !pr.pendingDelete) {
          snap = defaultOfflineEditorPayload()
          await offlinePutEditorSnapshot(id, snap)
        }
      }
      if (snap) return snap
      throw new Error('אין נתוני פרויקט במכשיר (אופליין).')
    }
    const remote = await fetchProjectEditorStateFromRemote(id, eff)
    try {
      await offlinePutEditorSnapshot(id, cloneEditorPayload(remote))
    } catch {
      /* ignore */
    }
    return remote
  }

  return getProjectStateOrFetch(id, fetcher, wrapBg, eff)
}

export async function renameProject(projectId: string, name: string): Promise<void> {
  const pid = String(projectId ?? '').trim()
  if (!pid) throw new Error('Project id is required.')
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('Project name is required.')

  if (isOfflineWorkMode()) {
    const row = await offlineGetProjectRow(pid)
    if (!row) throw new Error('Project not found offline.')
    await offlineUpsertProjectLocal({ ...row, name: trimmed })
    await offlineAppendOutbox({ op: 'rename_project', projectId: pid, name: trimmed })
    return
  }

  const userId = await requireUserId()
  const { error } = await supabase
    .from('projects')
    .update({ name: trimmed })
    .eq('id', pid)
    .eq('user_id', userId)

  if (error) throw new Error(error.message)
}
