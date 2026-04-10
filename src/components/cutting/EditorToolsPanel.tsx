import { memo, type KeyboardEvent } from 'react'
import { AlertTriangle, FileDown, Loader2, Ruler } from 'lucide-react'
import type { CatalogOptimizationResult } from '../../lib/cuttingOptimizer'

export const EditorToolsPanel = memo(function EditorToolsPanel({
  kerfMm,
  onKerfChange,
  onExportPdf,
  pdfExporting,
  result,
  onToolSidebarKeyDown,
}: {
  kerfMm: number
  onKerfChange: (v: number) => void
  onExportPdf: () => void
  pdfExporting: boolean
  result: CatalogOptimizationResult | null
  onToolSidebarKeyDown: (e: KeyboardEvent<HTMLElement>, toolIndex: number) => void
}) {
  return (
    <div className="order-2 flex min-h-0 min-w-0 flex-col space-y-6 lg:sticky lg:top-20 lg:order-2 lg:max-h-[calc(100vh-5rem)] lg:min-h-0 lg:overflow-y-auto lg:self-start lg:pb-2">
      <div className="no-print flex w-full min-h-0 shrink-0 flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm ring-1 ring-stone-100/80">
        <h2 className="mb-3 text-sm font-semibold text-stone-900">כלים</h2>
        <div className="grid grid-cols-3 gap-2">
          <label
            className="flex h-11 min-h-11 cursor-text flex-row items-center justify-center gap-1 rounded-lg border border-stone-200 bg-stone-50/90 px-1.5 py-1 shadow-sm sm:gap-1.5 sm:px-2"
            title="עובי להב בין חיתוכים"
          >
            <Ruler className="size-4 shrink-0 text-stone-500" aria-hidden />
            <span className="hidden text-[10px] font-medium text-stone-700 sm:inline">להב</span>
            <input
              id="focus-tool-kerf"
              type="number"
              dir="ltr"
              min={0}
              step={0.1}
              value={kerfMm}
              onChange={(e) => onKerfChange(Number(e.target.value))}
              onKeyDown={(e) => onToolSidebarKeyDown(e, 0)}
              className="w-10 shrink-0 rounded border border-stone-300 bg-white px-0.5 py-0.5 text-center text-xs tabular-nums shadow-sm focus:border-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-400/50 sm:w-11 sm:text-sm"
              aria-label="עובי להב במילימטרים"
            />
            <span className="shrink-0 text-[9px] text-stone-500 sm:text-[10px]">מ״מ</span>
          </label>
          <button
            id="focus-tool-export-pdf"
            type="button"
            onClick={() => void onExportPdf()}
            onKeyDown={(e) => onToolSidebarKeyDown(e, 1)}
            disabled={!result || result.patterns.length === 0 || pdfExporting}
            className="flex h-11 min-h-11 flex-row items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white px-1 py-1 text-center text-[10px] font-medium leading-tight text-stone-800 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:pointer-events-none disabled:opacity-40 sm:gap-1.5 sm:text-[11px]"
          >
            {pdfExporting ? (
              <Loader2 className="size-4 shrink-0 animate-spin sm:size-[1.125rem]" aria-hidden />
            ) : (
              <FileDown className="size-4 shrink-0 sm:size-[1.125rem]" aria-hidden />
            )}
            <span className="min-w-0 leading-snug">
              {pdfExporting ? 'Generating PDF…' : 'יצא PDF'}
            </span>
          </button>
        </div>
      </div>

      {result && result.errors.length > 0 && (
        <div
          className="no-print flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
          role="alert"
        >
          <AlertTriangle className="size-6 shrink-0" aria-hidden />
          <ul className="list-disc space-y-1 ps-4 text-sm">
            {result.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
})
