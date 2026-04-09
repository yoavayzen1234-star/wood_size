/// <reference lib="webworker" />

import { solveExactStoreCatalog } from '../lib/exactCatalogSolver'
import type { CatalogOptimizationResult, PartInput } from '../lib/cuttingOptimizer'

export type CuttingWorkerRequest = {
  parts: PartInput[]
  kerfMm: number
  storeStockLengthsCm: number[]
  storeStockLengthsByMaterial?: Record<string, number[]>
}

export type CuttingWorkerResponse =
  | { ok: true; result: CatalogOptimizationResult }
  | { ok: false; message: string }

self.onmessage = (e: MessageEvent<CuttingWorkerRequest>) => {
  try {
    const result = solveExactStoreCatalog(
      e.data.parts,
      e.data.kerfMm,
      e.data.storeStockLengthsCm,
      e.data.storeStockLengthsByMaterial,
    )
    const out: CuttingWorkerResponse = { ok: true, result }
    self.postMessage(out)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const out: CuttingWorkerResponse = { ok: false, message }
    self.postMessage(out)
  }
}
