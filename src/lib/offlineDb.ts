/**
 * IndexedDB — עותק מקומי של פרויקטים + מצב עורך + תור סנכרון (outbox).
 * DB version — העלאה בעת שינוי סכמה.
 */
import type { ProjectEditorPayload } from '../services/projects'
import type { Project } from '../services/projects'

const DB_NAME = 'woodcut-offline-v1'
const DB_VERSION = 1

const S_PROJECTS = 'projects'
const S_EDITOR = 'editor'
const S_OUTBOX = 'outbox'

export type OfflineProjectRow = {
  id: string
  userId: string
  name: string
  created_at: string
  updated_at?: string
  pendingCreate?: boolean
  pendingDelete?: boolean
}

export type OfflineEditorRow = {
  projectId: string
  payload: ProjectEditorPayload
  updatedAt: number
}

export type OutboxEntry =
  | {
      key: string
      op: 'create_project'
      projectId: string
      userId: string
      name: string
      createdAt: number
    }
  | {
      key: string
      op: 'save_editor'
      projectId: string
      payload: ProjectEditorPayload
      createdAt: number
    }
  | {
      key: string
      op: 'rename_project'
      projectId: string
      name: string
      createdAt: number
    }
  | {
      key: string
      op: 'delete_project'
      projectId: string
      createdAt: number
    }

function reqToPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'))
    r.onsuccess = () => resolve(r.result as T)
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.oncomplete = () => resolve()
  })
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onerror = () => reject(r.error ?? new Error('IndexedDB open failed'))
    r.onsuccess = () => resolve(r.result)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(S_PROJECTS)) {
        const ps = db.createObjectStore(S_PROJECTS, { keyPath: 'id' })
        ps.createIndex('byUser', 'userId', { unique: false })
      }
      if (!db.objectStoreNames.contains(S_EDITOR)) {
        db.createObjectStore(S_EDITOR, { keyPath: 'projectId' })
      }
      if (!db.objectStoreNames.contains(S_OUTBOX)) {
        db.createObjectStore(S_OUTBOX, { keyPath: 'key' })
      }
    }
  })
  return dbPromise
}

function rowToProject(row: OfflineProjectRow): Project {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    kerf_mm: 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function offlineGetProjectsForUser(userId: string): Promise<Project[]> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_PROJECTS, 'readonly')
  const store = tx.objectStore(S_PROJECTS)
  const idx = store.index('byUser')
  const r = idx.getAll(userId)
  const rows = await reqToPromise(r as IDBRequest<OfflineProjectRow[]>)
  await txDone(tx)
  return rows
    .filter((x) => !x.pendingDelete)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(rowToProject)
}

export async function offlinePutProjectMirror(p: Project): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_PROJECTS, 'readwrite')
  const row: OfflineProjectRow = {
    id: p.id,
    userId: p.user_id,
    name: p.name,
    created_at: p.created_at,
    updated_at: p.updated_at,
    pendingCreate: false,
    pendingDelete: false,
  }
  tx.objectStore(S_PROJECTS).put(row)
  await txDone(tx)
}

export async function offlineUpsertProjectLocal(row: OfflineProjectRow): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_PROJECTS, 'readwrite')
  tx.objectStore(S_PROJECTS).put(row)
  await txDone(tx)
}

export async function offlineGetProjectRow(id: string): Promise<OfflineProjectRow | null> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_PROJECTS, 'readonly')
  const r = tx.objectStore(S_PROJECTS).get(id)
  const row = await reqToPromise(r as IDBRequest<OfflineProjectRow | undefined>)
  await txDone(tx)
  return row ?? null
}

export async function offlineDeleteProjectRecord(id: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction([S_PROJECTS, S_EDITOR], 'readwrite')
  tx.objectStore(S_PROJECTS).delete(id)
  tx.objectStore(S_EDITOR).delete(id)
  await txDone(tx)
}

export async function offlinePutEditorSnapshot(
  projectId: string,
  payload: ProjectEditorPayload,
): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_EDITOR, 'readwrite')
  const row: OfflineEditorRow = {
    projectId,
    payload,
    updatedAt: Date.now(),
  }
  tx.objectStore(S_EDITOR).put(row)
  await txDone(tx)
}

export async function offlineGetEditorSnapshot(
  projectId: string,
): Promise<ProjectEditorPayload | null> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_EDITOR, 'readonly')
  const r = tx.objectStore(S_EDITOR).get(projectId)
  const row = await reqToPromise(r as IDBRequest<OfflineEditorRow | undefined>)
  await txDone(tx)
  return row?.payload ?? null
}

export type OutboxAppendInput =
  | { op: 'create_project'; projectId: string; userId: string; name: string; createdAt?: number }
  | { op: 'rename_project'; projectId: string; name: string; createdAt?: number }
  | { op: 'delete_project'; projectId: string; createdAt?: number }

export async function offlineAppendOutbox(entry: OutboxAppendInput): Promise<void> {
  const db = await openOfflineDb()
  const key = crypto.randomUUID()
  const createdAt = entry.createdAt ?? Date.now()
  const full = { ...entry, key, createdAt } as OutboxEntry
  const tx = db.transaction(S_OUTBOX, 'readwrite')
  tx.objectStore(S_OUTBOX).put(full)
  await txDone(tx)
}

/** מחליף כל save_editor תלוי לפרויקט — רק המצב האחרון נשלח בסנכרון */
export async function offlineQueueSaveEditor(projectId: string, payload: ProjectEditorPayload): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_OUTBOX, 'readwrite')
  const store = tx.objectStore(S_OUTBOX)
  const all = await reqToPromise(store.getAll() as IDBRequest<OutboxEntry[]>)
  for (const e of all) {
    if (e.op === 'save_editor' && e.projectId === projectId) store.delete(e.key)
  }
  const key = crypto.randomUUID()
  const row: OutboxEntry = {
    key,
    op: 'save_editor',
    projectId,
    payload,
    createdAt: Date.now(),
  }
  store.put(row)
  await txDone(tx)
}

export async function offlineListOutboxOrdered(): Promise<OutboxEntry[]> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_OUTBOX, 'readonly')
  const store = tx.objectStore(S_OUTBOX)
  const r = store.getAll()
  const all = await reqToPromise(r as IDBRequest<OutboxEntry[]>)
  await txDone(tx)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function offlineRemoveOutboxKey(key: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_OUTBOX, 'readwrite')
  tx.objectStore(S_OUTBOX).delete(key)
  await txDone(tx)
}

export async function offlineRemoveOutboxForProject(projectId: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_OUTBOX, 'readwrite')
  const store = tx.objectStore(S_OUTBOX)
  const r = store.getAll()
  const all = await reqToPromise(r as IDBRequest<OutboxEntry[]>)
  for (const e of all) {
    if (e.projectId === projectId) store.delete(e.key)
  }
  await txDone(tx)
}

export async function offlineClearPendingFlags(projectId: string): Promise<void> {
  const row = await offlineGetProjectRow(projectId)
  if (!row) return
  row.pendingCreate = false
  row.pendingDelete = false
  await offlineUpsertProjectLocal(row)
}

/**
 * ממזג רשימת שרת ל־IDB: מעדכן קיימים, שומר pendingCreate מקומיים, מסיר מקומיים שלא בשרת (חוץ מ-pendingCreate).
 */
export async function offlineMirrorServerProjects(userId: string, serverList: Project[]): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_PROJECTS, 'readwrite')
  const store = tx.objectStore(S_PROJECTS)
  const idx = store.index('byUser')
  const r = idx.getAll(userId)
  const localRows = await reqToPromise(r as IDBRequest<OfflineProjectRow[]>)
  const serverIds = new Set(serverList.map((p) => p.id))

  for (const p of serverList) {
    const row: OfflineProjectRow = {
      id: p.id,
      userId: p.user_id,
      name: p.name,
      created_at: p.created_at,
      updated_at: p.updated_at,
      pendingCreate: false,
      pendingDelete: false,
    }
    store.put(row)
  }

  for (const lp of localRows) {
    if (serverIds.has(lp.id)) continue
    if (lp.pendingCreate) continue
    store.delete(lp.id)
  }

  await txDone(tx)
}

export async function offlineClearAllForUser(userId: string): Promise<void> {
  const db = await openOfflineDb()
  const projectIds = new Set<string>()
  {
    const tx = db.transaction(S_PROJECTS, 'readonly')
    const rows = await reqToPromise(
      tx.objectStore(S_PROJECTS).index('byUser').getAll(userId) as IDBRequest<OfflineProjectRow[]>,
    )
    await txDone(tx)
    rows.forEach((r) => projectIds.add(r.id))
  }
  const outboxKeysToDelete: string[] = []
  {
    const tx = db.transaction(S_OUTBOX, 'readonly')
    const all = await reqToPromise(tx.objectStore(S_OUTBOX).getAll() as IDBRequest<OutboxEntry[]>)
    await txDone(tx)
    for (const e of all) {
      if (e.op === 'create_project' && e.userId === userId) outboxKeysToDelete.push(e.key)
      else if (projectIds.has(e.projectId)) outboxKeysToDelete.push(e.key)
    }
  }
  const tx = db.transaction([S_PROJECTS, S_EDITOR, S_OUTBOX], 'readwrite')
  for (const pid of projectIds) {
    tx.objectStore(S_PROJECTS).delete(pid)
    tx.objectStore(S_EDITOR).delete(pid)
  }
  for (const k of outboxKeysToDelete) {
    tx.objectStore(S_OUTBOX).delete(k)
  }
  await txDone(tx)
}

/** מוחק את כל ה-outbox (למשל אחרי ניקוי זהיר) */
export async function offlineClearEntireOutbox(): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction(S_OUTBOX, 'readwrite')
  const store = tx.objectStore(S_OUTBOX)
  const keys = await reqToPromise(store.getAllKeys() as IDBRequest<IDBValidKey[]>)
  for (const k of keys) store.delete(k)
  await txDone(tx)
}
