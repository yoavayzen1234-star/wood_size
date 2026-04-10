/**
 * יצירת תבניות וסינון dominated במקביל (Web Workers) עם נפילה לסינכרון.
 */

import PatternBranchWorker from '../workers/exactPatternBranch.worker.ts?worker'
import DominanceChunkWorker from '../workers/exactDominanceChunk.worker.ts?worker'
import {
  findMinimumDominatedIndex,
  generatePatternsFromFirstTypeBranch,
  generatePatternsSerial,
  isPatternDominatedByAny,
  maxCountFirstType,
  mergePatternsDedupe,
  type PartTypeLite,
  type PatternLite,
} from './exactCatalogParallelCore'

function maxParallelWorkers(): number {
  if (typeof navigator === 'undefined' || !navigator.hardwareConcurrency) return 4
  return Math.min(8, navigator.hardwareConcurrency)
}

const scheduleTimeout = typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout.bind(globalThis) : setTimeout
const cancelTimeout = typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout.bind(globalThis) : clearTimeout

export async function generatePatternsParallel(
  types: PartTypeLite[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): Promise<PatternLite[]> {
  const m = types.length
  if (m === 0) return []

  const maxK = maxCountFirstType(types, kerfMm, maxStockMm)
  const branchCount = maxK + 1

  if (typeof Worker === 'undefined' || branchCount < 3) {
    return generatePatternsSerial(types, kerfMm, maxStockMm, storeStockLengthsCm)
  }

  const typesPayload = types.map((t) => ({
    label: t.label,
    lengthMm: t.lengthMm,
    demand: t.demand,
  }))
  const storeCm = [...storeStockLengthsCm]
  const maxW = maxParallelWorkers()

  const runBranch = (k: number): Promise<PatternLite[]> =>
    new Promise((resolve, reject) => {
      try {
        const w = new PatternBranchWorker()
        const timer = scheduleTimeout(() => {
          w.terminate()
          reject(new Error('pattern worker timeout'))
        }, 120_000)
        w.onmessage = (ev: MessageEvent<{ ok: boolean; patterns?: PatternLite[]; message?: string }>) => {
          cancelTimeout(timer)
          w.terminate()
          const d = ev.data
          if (d.ok && d.patterns) resolve(d.patterns)
          else reject(new Error(d.message ?? 'pattern worker failed'))
        }
        w.onerror = (err) => {
          cancelTimeout(timer)
          w.terminate()
          reject(err)
        }
        w.postMessage({
          types: typesPayload,
          kerfMm,
          maxStockMm,
          storeStockLengthsCm: storeCm,
          firstTypeCount: k,
        })
      } catch {
        resolve(
          generatePatternsFromFirstTypeBranch(types, kerfMm, maxStockMm, storeStockLengthsCm, k),
        )
      }
    })

  const ks = Array.from({ length: branchCount }, (_, i) => i)
  const batches: number[][] = []
  for (let i = 0; i < ks.length; i += maxW) {
    batches.push(ks.slice(i, i + maxW))
  }

  const parts: PatternLite[][] = []
  for (const batch of batches) {
    const settled = await Promise.all(
      batch.map((k) =>
        runBranch(k).catch(() =>
          generatePatternsFromFirstTypeBranch(types, kerfMm, maxStockMm, storeStockLengthsCm, k),
        ),
      ),
    )
    parts.push(...settled)
  }

  return mergePatternsDedupe(parts)
}

function dominanceChunkMinSync(patterns: PatternLite[], m: number, from: number, to: number): number {
  for (let i = from; i < to && i < patterns.length; i++) {
    if (isPatternDominatedByAny(patterns, m, i)) return i
  }
  return -1
}

async function dominanceChunkMin(
  patterns: PatternLite[],
  m: number,
  from: number,
  to: number,
): Promise<number> {
  if (typeof Worker === 'undefined') {
    return dominanceChunkMinSync(patterns, m, from, to)
  }

  return new Promise((resolve, reject) => {
    try {
      const w = new DominanceChunkWorker()
      const timer = scheduleTimeout(() => {
        w.terminate()
        reject(new Error('dominance worker timeout'))
      }, 60_000)
      w.onmessage = (ev: MessageEvent<{ ok: boolean; minIdx?: number; message?: string }>) => {
        cancelTimeout(timer)
        w.terminate()
        const d = ev.data
        if (d.ok && d.minIdx !== undefined) resolve(d.minIdx)
        else reject(new Error(d.message ?? 'dominance chunk failed'))
      }
      w.onerror = (e) => {
        cancelTimeout(timer)
        w.terminate()
        reject(e)
      }
      w.postMessage({ patterns, m, from, to })
    } catch (e) {
      reject(e)
    }
  })
}

export async function removeDominatedPatternsParallel(
  patternsInput: PatternLite[],
  m: number,
): Promise<PatternLite[]> {
  let cur = patternsInput.map((p) => ({ ...p, counts: [...p.counts] }))

  while (cur.length > 0) {
    const n = cur.length
    let idx: number

    if (typeof Worker === 'undefined' || n < 64) {
      idx = findMinimumDominatedIndex(cur, m)
    } else {
      const maxW = maxParallelWorkers()
      const chunk = Math.max(1, Math.ceil(n / maxW))
      const tasks: Promise<number>[] = []
      for (let from = 0; from < n; from += chunk) {
        const to = Math.min(n, from + chunk)
        tasks.push(
          dominanceChunkMin(cur, m, from, to).catch(() => dominanceChunkMinSync(cur, m, from, to)),
        )
      }
      const mins = await Promise.all(tasks)
      const valid = mins.filter((x) => x >= 0)
      idx = valid.length === 0 ? -1 : Math.min(...valid)
    }

    if (idx < 0) break
    cur.splice(idx, 1)
  }

  return cur
}
