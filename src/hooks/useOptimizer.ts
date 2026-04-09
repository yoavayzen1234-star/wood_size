import { useCallback, useEffect, useRef, useState } from 'react'
import { solveExactStoreCatalog } from '../lib/exactCatalogSolver'
import type { CatalogOptimizationResult } from '../lib/cuttingOptimizer'
import type { DraftRow } from '../lib/draftRows'
import { rowsToParts } from '../lib/draftRows'
import OptimizerWorker from '../workers/cuttingOptimizer.worker.ts?worker'
import type { CuttingWorkerResponse } from '../workers/cuttingOptimizer.worker'

export function useOptimizer() {
  const [result, setResult] = useState<CatalogOptimizationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const resultsRef = useRef<HTMLElement | null>(null)
  const calcGenerationRef = useRef(0)
  const optimizerWorkerRef = useRef<Worker | null>(null)

  const clearResult = useCallback(() => {
    setResult(null)
  }, [])

  useEffect(() => {
    return () => {
      try {
        optimizerWorkerRef.current?.terminate()
      } catch {
        /* ignore */
      }
      optimizerWorkerRef.current = null
    }
  }, [])

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

      try {
        optimizerWorkerRef.current?.terminate()
      } catch {
        /* ignore */
      }
      optimizerWorkerRef.current = null

      setCalculating(true)
      setResult(null)

      const applyResult = (res: CatalogOptimizationResult) => {
        if (gen !== calcGenerationRef.current) return
        setCalculating(false)
        setResult(res)
      }

      const runOnMainThread = (reason?: string) => {
        if (gen !== calcGenerationRef.current) return
        try {
          const res = solveExactStoreCatalog(parts, kerf, storeStockLengthsCm, storeStockLengthsByMaterial)
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
            patterns: [],
            errors: [msg],
            beamsUsed: 0,
            wastePercent: 0,
            mode: 'store-catalog',
            shoppingList: [],
          })
        }
      }

      let finished = false
      const finishOnce = (fn: () => void) => {
        if (finished) return
        finished = true
        fn()
      }

      let worker: Worker | null = null
      try {
        worker = new OptimizerWorker()
        optimizerWorkerRef.current = worker
      } catch (e) {
        console.error('OptimizerWorker constructor failed:', e)
        finishOnce(() =>
          runOnMainThread('לא ניתן להפעיל Worker — החישוב רץ בממשק הראשי.'),
        )
        return
      }

      const onMessage = (e: MessageEvent<CuttingWorkerResponse>) => {
        if (gen !== calcGenerationRef.current) return
        worker?.removeEventListener('message', onMessage)
        worker?.terminate()
        if (optimizerWorkerRef.current === worker) optimizerWorkerRef.current = null
        worker = null
        finishOnce(() => {
          if (gen !== calcGenerationRef.current) return
          const data = e.data
          const res: CatalogOptimizationResult = data.ok
            ? data.result
            : {
                patterns: [],
                errors: [`שגיאת חישוב: ${data.message}`],
                beamsUsed: 0,
                wastePercent: 0,
                mode: 'store-catalog',
                shoppingList: [],
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
        if (optimizerWorkerRef.current === worker) optimizerWorkerRef.current = null
        worker = null
        finishOnce(() =>
          runOnMainThread(
            `תקלה ב-Worker (${ev.message || 'לא ידוע'}). החישוב הושלם בממשק הראשי.`,
          ),
        )
      })
      worker.addEventListener('messageerror', (ev) => {
        if (gen !== calcGenerationRef.current) return
        console.error('Optimizer worker messageerror:', ev)
        worker?.removeEventListener('message', onMessage)
        worker?.terminate()
        if (optimizerWorkerRef.current === worker) optimizerWorkerRef.current = null
        worker = null
        finishOnce(() =>
          runOnMainThread('הודעת Worker נכשלה — החישוב רץ בממשק הראשי.'),
        )
      })

      try {
        worker.postMessage({ parts, kerfMm: kerf, storeStockLengthsCm, storeStockLengthsByMaterial })
      } catch (e) {
        console.error('postMessage to worker failed:', e)
        worker.removeEventListener('message', onMessage)
        worker.terminate()
        if (optimizerWorkerRef.current === worker) optimizerWorkerRef.current = null
        worker = null
        finishOnce(() =>
          runOnMainThread('לא ניתן לשלוח נתונים ל-Worker — החישוב רץ בממשק הראשי.'),
        )
      }
    },
    [],
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
