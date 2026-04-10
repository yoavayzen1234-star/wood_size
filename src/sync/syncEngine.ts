import { supabase } from '../lib/supabase'
import {
  offlineClearPendingFlags,
  offlineListOutboxOrdered,
  offlineMirrorServerProjects,
  offlineRemoveOutboxKey,
} from '../lib/offlineDb'
import { saveProjectEditorState } from '../services/projects'

const SYNC_EVENT = 'woodcut:sync-complete'

type ProjectListRow = {
  id: string
  user_id: string
  name: string
  created_at: string
  updated_at?: string
}

let syncInFlight = false

export function dispatchSyncComplete(): void {
  window.dispatchEvent(new Event(SYNC_EVENT))
}

export function onSyncComplete(cb: () => void): () => void {
  window.addEventListener(SYNC_EVENT, cb)
  return () => window.removeEventListener(SYNC_EVENT, cb)
}

async function requireUserIdOnline(): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw new Error(error.message)
  const uid = data.user?.id
  if (!uid) throw new Error('Not authenticated.')
  return uid
}

/**
 * מעבד את תור ה־outbox מול Supabase (סדר יצירה → שאר הפעולות).
 */
export async function runOfflineOutboxSync(): Promise<{ ok: boolean; error?: string }> {
  if (!navigator.onLine) return { ok: true }
  if (syncInFlight) return { ok: true }
  syncInFlight = true
  try {
    const uid = await requireUserIdOnline()
    const queue = await offlineListOutboxOrdered()
    if (queue.length === 0) {
      return { ok: true }
    }

    const sorted = [
      ...queue.filter((x) => x.op === 'create_project'),
      ...queue.filter((x) => x.op !== 'create_project'),
    ]

    for (const item of sorted) {
      switch (item.op) {
        case 'create_project': {
          const { error } = await supabase.from('projects').insert({
            id: item.projectId,
            user_id: item.userId,
            name: item.name,
            data: {},
          })
          if (error) throw new Error(error.message)
          await offlineClearPendingFlags(item.projectId)
          await offlineRemoveOutboxKey(item.key)
          break
        }
        case 'rename_project': {
          const { error } = await supabase
            .from('projects')
            .update({ name: item.name })
            .eq('id', item.projectId)
            .eq('user_id', uid)
          if (error) throw new Error(error.message)
          await offlineRemoveOutboxKey(item.key)
          break
        }
        case 'delete_project': {
          const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', item.projectId)
            .eq('user_id', uid)
          if (error) throw new Error(error.message)
          await offlineRemoveOutboxKey(item.key)
          break
        }
        case 'save_editor': {
          await saveProjectEditorState(item.projectId, item.payload)
          await offlineRemoveOutboxKey(item.key)
          break
        }
        default:
          break
      }
    }

    const { data, error } = await supabase
      .from('projects')
      .select('id, user_id, name, created_at, updated_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as ProjectListRow[]
    const list = rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      kerf_mm: 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }))
    await offlineMirrorServerProjects(uid, list)

    dispatchSyncComplete()
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  } finally {
    syncInFlight = false
  }
}

export function startOfflineSyncListeners(): void {
  const onOnline = () => {
    void runOfflineOutboxSync()
  }
  window.addEventListener('online', onOnline)
  if (navigator.onLine) {
    void runOfflineOutboxSync()
  }
}
