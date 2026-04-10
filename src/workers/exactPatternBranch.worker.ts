/// <reference lib="webworker" />

import {
  generatePatternsFromFirstTypeBranch,
  type PartTypeLite,
} from '../lib/exactCatalogParallelCore'

export type ExactPatternBranchMessage = {
  types: PartTypeLite[]
  kerfMm: number
  maxStockMm: number
  storeStockLengthsCm: readonly number[]
  firstTypeCount: number
}

self.onmessage = (e: MessageEvent<ExactPatternBranchMessage>) => {
  const { types, kerfMm, maxStockMm, storeStockLengthsCm, firstTypeCount } = e.data
  try {
    const patterns = generatePatternsFromFirstTypeBranch(
      types,
      kerfMm,
      maxStockMm,
      storeStockLengthsCm,
      firstTypeCount,
    )
    self.postMessage({ ok: true as const, patterns })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ ok: false as const, message })
  }
}
