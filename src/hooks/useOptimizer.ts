import { useCallback, useEffect, useRef, useState } from 'react'
import { runWithConcurrency } from '../lib/asyncPool'
import { solveExactStoreCatalog } from '../lib/exactCatalogSolver'
import { legacyKeyFromWoodTypeKey } from '../lib/draftRows'
import {
  groupPartsByWoodType,
  mergeCatalogOptimizationResults,
} from '../lib/mergeCatalogOptimization'
import {
  normalizeStoreStockLengthsCm,
  type CatalogOptimizationResult,
  type PartInput,
} from '../lib/cuttingOptimizer'
import type { DraftRow } from '../lib/draftRows'
import { rowsToParts } from '../lib/draftRows'
import OptimizerWorker from '../workers/cuttingOptimizer.worker.ts?worker'
import type { CuttingWorkerResponse } from '../workers/cuttingOptimizer.worker'

const GROUP_WORKER_CONCURRENCY = 6

function sliceStockMapForWoodType(
  woodKey: string,
  storeStockLengthsByMaterial: Record<string, number[]>,
): Record<string, number[]> {
  const legacy = legacyKeyFromWoodTypeKey(woodKey)
  const line =
    storeStockLengthsByMaterial[woodKey] ??
    (legacy != null ? storeStockLengthsByMaterial[legacy] : undefined)
  if (line == null || line.length === 0) return {}
  return { [woodKey]: normalizeStoreStockLengthsCm(line) }
}

function emptyCatalogResult(errors: string[] = []): CatalogOptimizationResult {
  return {
    patterns: [],
    errors,
    beamsUsed: 0,
    wastePercent: 0,
    mode: 'store-catalog',
    shoppingList: [],
    solverKind: 'exact-dp',
    solveTimeMs: 0,
    solveTimeSeconds: 0,
  }
}

export function useOptimizer() {
  const [result, setResult] = useState<CatalogOptimizationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const resultsRef = useRef<HTMLElement | null>(null)
  const calcGenerationRef = useRef(0)
  const optimizerWorkersRef = useRef<Worker[]>([])

  const clearResult = useCallback(() => {
    setResult(null)
  }, [])

  const terminateAllWorkers = useCallback(() => {
    for (const w of optimizerWorkersRef.current) {
      try {
        w.terminate()
      } catch {
        /* ignore */
      }
    }
    optimizerWorkersRef.current = []
  }, [])

  useEffect(() => {
    return () => {
      terminateAllWorkers()
    }
  }, [terminateAllWorkers])

  const runShoppingAndCuts = useCallback(
    (
      rows: DraftRow[],
      kerfMm: number,
      storeStockLengthsCm: number[],
      storeStockLengthsByMaterial: Record<string, number[]>,
    ) => {
      const parts = rowsToParts(rows)
      const kerf = Number(kerfMm) || 0
      const gen = ++calcGenerationRef.current

      terminateAllWorkers()

      setCalculating(true)
      setResult(null)

      const applyResult = (res: CatalogOptimizationResult) => {
        if (gen !== calcGenerationRef.current) return
        setCalculating(false)
        setResult(res)
      }

      const runOnMainThread = async (
        partsArg: PartInput[],
        storeMap: Record<string, number[]>,
        reason?: string,
      ) => {
        if (gen !== calcGenerationRef.current) return
        try {
          const res = await solveExactStoreCatalog(partsArg, kerf, storeStockLengthsCm, storeMap)
          if (reason) {
            applyResult({
              ...res,
              solverNote: [res.solverNote, reason].filter(Boolean).join(' '),
            })
          } else {
            applyResult(res)
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          applyResult({
            ...emptyCatalogResult([msg]),
          })
        }
      }

      if (parts.length === 0) {
        applyResult(emptyCatalogResult())
        return
      }

      const byWood = groupPartsByWoodType(parts)
      const groupEntries = [...byWood.entries()].sort((a, b) =>
        a[0].localeCompare(b[0], 'he'),
      )

      /** חד-פרופיל: אותו זרימה כמו לפני (עובד יחיד + מפתחות override מלאים). */
      if (groupEntries.length === 1) {
        let finished = false
        const finishOnce = (fn: () => void) => {
          if (finished) return
          finished = true
          fn()
        }

        let worker: Worker | null = null
        try {
          worker = new OptimizerWorker()
          optimizerWorkersRef.current = [worker]
        } catch (e) {
          console.error('OptimizerWorker constructor failed:', e)
          finishOnce(() =>
            void runOnMainThread(
              parts,
              storeStockLengthsByMaterial,
              'לא ניתן להפעיל Worker — החישוב רץ בממשק הראשי.',
            ),
          )
          return
        }

        const onMessage = (e: MessageEvent<CuttingWorkerResponse>) => {
          if (gen !== calcGenerationRef.current) return
          worker?.removeEventListener('message', onMessage)
          worker?.terminate()
          if (optimizerWorkersRef.current[0] === worker) optimizerWorkersRef.current = []
          worker = null
          finishOnce(() => {
            if (gen !== calcGenerationRef.current) return
            const data = e.data
            const res: CatalogOptimizationResult = data.ok
              ? data.result
              : {
                  ...emptyCatalogResult([`שגיאת חישוב: ${data.message}`]),
                }
            applyResult(res)
          })
        }

        worker.addEventListener('message', onMessage)
        worker.addEventListener('error', (ev) => {
          if (gen !== calcGenerationRef.current) return
          console.error('Optimizer worker error:', ev.message, ev.filename, ev.lineno, ev.error)
          worker?.removeEventListener('message', onMessage)
          worker?.terminate()
          if (optimizerWorkersRef.current[0] === worker) optimizerWorkersRef.current = []
          worker = null
          finishOnce(() =>
            void runOnMainThread(
              parts,
              storeStockLengthsByMaterial,
              `תקלה ב-Worker (${ev.message || 'לא ידוע'}). החישוב הושלם בממשק הראשי.`,
            ),
          )
        })
        worker.addEventListener('messageerror', (ev) => {
          if (gen !== calcGenerationRef.current) return
          console.error('Optimizer worker messageerror:', ev)
          worker?.removeEventListener('message', onMessage)
          worker?.terminate()
          if (optimizerWorkersRef.current[0] === worker) optimizerWorkersRef.current = []
          worker = null
          finishOnce(() =>
            void runOnMainThread(
              parts,
              storeStockLengthsByMaterial,
              'הודעת Worker נכשלה — החישוב רץ בממשק הראשי.',
            ),
          )
        })

        try {
          worker.postMessage({
            parts,
            kerfMm: kerf,
            storeStockLengthsCm,
            storeStockLengthsByMaterial,
          })
        } catch (e) {
          console.error('postMessage to worker failed:', e)
          worker.removeEventListener('message', onMessage)
          worker.terminate()
          if (optimizerWorkersRef.current[0] === worker) optimizerWorkersRef.current = []
          worker = null
          finishOnce(() =>
            void runOnMainThread(
              parts,
              storeStockLengthsByMaterial,
              'לא ניתן לשלוח נתונים ל-Worker — החישוב רץ בממשק הראשי.',
            ),
          )
        }
        return
      }

      /** רב-פרופיל: עובדים מקביליים (תור), מיזוג תוצאות. */
      void (async () => {
        const solveOneGroup = async ([woodKey, groupParts]: [
          string,
          PartInput[],
        ]): Promise<{ woodTypeKey: string; result: CatalogOptimizationResult }> => {
          const overrides = sliceStockMapForWoodType(woodKey, storeStockLengthsByMaterial)

          const fallbackMain = async (reason?: string) => {
            try {
              const res = await solveExactStoreCatalog(
                groupParts,
                kerf,
                storeStockLengthsCm,
                overrides,
              )
              return {
                woodTypeKey: woodKey,
                result: reason
                  ? { ...res, solverNote: [res.solverNote, reason].filter(Boolean).join(' ') }
                  : res,
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              return {
                woodTypeKey: woodKey,
                result: emptyCatalogResult([msg]),
              }
            }
          }

          let worker: Worker | null = null
          try {
            worker = new OptimizerWorker()
            optimizerWorkersRef.current.push(worker)
          } catch (e) {
            console.error('OptimizerWorker constructor failed (group):', e)
            return await fallbackMain('לא ניתן להפעיל Worker — קבוצה בממשק הראשי.')
          }

          return await new Promise((resolve) => {
            const done = (value: { woodTypeKey: string; result: CatalogOptimizationResult }) => {
              cleanup()
              resolve(value)
            }

            const cleanup = () => {
              worker?.removeEventListener('message', onMessage)
              worker?.removeEventListener('error', onError)
              worker?.removeEventListener('messageerror', onMsgErr)
              if (worker) {
                try {
                  worker.terminate()
                } catch {
                  /* ignore */
                }
                const i = optimizerWorkersRef.current.indexOf(worker)
                if (i >= 0) optimizerWorkersRef.current.splice(i, 1)
              }
              worker = null
            }

            const onMessage = (e: MessageEvent<CuttingWorkerResponse>) => {
              if (gen !== calcGenerationRef.current) {
                cleanup()
                resolve({ woodTypeKey: woodKey, result: emptyCatalogResult() })
                return
              }
              const data = e.data
              const res: CatalogOptimizationResult = data.ok
                ? data.result
                : {
                    ...emptyCatalogResult([`שגיאת חישוב: ${data.message}`]),
                  }
              done({ woodTypeKey: woodKey, result: res })
            }

            const onError = (ev: ErrorEvent) => {
              if (gen !== calcGenerationRef.current) {
                cleanup()
                resolve({ woodTypeKey: woodKey, result: emptyCatalogResult() })
                return
              }
              console.error('Optimizer worker error (group):', ev)
              void fallbackMain(
                `תקלה ב-Worker (${ev.message || 'לא ידוע'}). קבוצה בממשק הראשי.`,
              ).then(done)
            }

            const onMsgErr = () => {
              if (gen !== calcGenerationRef.current) {
                cleanup()
                resolve({ woodTypeKey: woodKey, result: emptyCatalogResult() })
                return
              }
              void fallbackMain('הודעת Worker נכשלה — קבוצה בממשק הראשי.').then(done)
            }

            worker!.addEventListener('message', onMessage)
            worker!.addEventListener('error', onError)
            worker!.addEventListener('messageerror', onMsgErr)

            try {
              worker!.postMessage({
                parts: groupParts,
                kerfMm: kerf,
                storeStockLengthsCm,
                storeStockLengthsByMaterial: overrides,
              })
            } catch (e) {
              console.error('postMessage to worker failed (group):', e)
              void fallbackMain('לא ניתן לשלוח נתונים ל-Worker — קבוצה בממשק הראשי.').then(done)
            }
          })
        }

        try {
          const partial = await runWithConcurrency(
            groupEntries,
            GROUP_WORKER_CONCURRENCY,
            solveOneGroup,
          )
          if (gen !== calcGenerationRef.current) return
          applyResult(mergeCatalogOptimizationResults(partial))
        } catch (e) {
          console.error('parallel optimizer failed:', e)
          if (gen !== calcGenerationRef.current) return
          void runOnMainThread(
            parts,
            storeStockLengthsByMaterial,
            'כשל במיזוג מקבילי — חישוב מלא בממשק הראשי.',
          )
        }
      })()
    },
    [terminateAllWorkers],
  )

  const exportPdf = useCallback(async () => {
    if (!result || result.patterns.length === 0) return
    setPdfExporting(true)
    try {
      const { exportOptimizationPdf } = await import('../pdf/exportOptimizationPdf')
      exportOptimizationPdf(result, `woodcut-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error('PDF export failed', e)
      window.alert('יצירת PDF נכשלה. נסו שוב או בדקו הרשאות הורדה בדפדפן.')
    } finally {
      setPdfExporting(false)
    }
  }, [result])

  return {
    result,
    calculating,
    pdfExporting,
    resultsRef,
    runShoppingAndCuts,
    exportPdf,
    clearResult,
  }
}
