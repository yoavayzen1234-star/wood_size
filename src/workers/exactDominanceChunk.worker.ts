/// <reference lib="webworker" />

import {
  isPatternDominatedByAny,
  type PatternLite,
} from '../lib/exactCatalogParallelCore'

export type ExactDominanceChunkMessage = {
  patterns: PatternLite[]
  m: number
  from: number
  to: number
}

/** מינימום i ב־[from, to) שנשלט, או -1 */
self.onmessage = (e: MessageEvent<ExactDominanceChunkMessage>) => {
  const { patterns, m, from, to } = e.data
  try {
    let minIdx = -1
    for (let i = Math.max(0, from); i < to && i < patterns.length; i++) {
      if (isPatternDominatedByAny(patterns, m, i)) {
        minIdx = i
        break
      }
    }
    self.postMessage({ ok: true as const, minIdx })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ ok: false as const, message })
  }
}
