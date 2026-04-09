import { memo, type RefObject } from 'react'
import { ClipboardList } from 'lucide-react'
import type { CatalogOptimizationResult } from '../../lib/cuttingOptimizer'
import type { DraftRow } from '../../lib/draftRows'
import { formatLocalDateIso, metersBareFromCm, percentFixed2 } from '../../displayNumbers'
import { LtrNum } from '../../LtrNum'
import { beamCuttingPlanKey } from '../../lib/beamGrouping'
import { BeamProfileDims, BeamVisualization } from '../../features/cutting/beamVisualization/BeamVisualization'

export const ResultsPanel = memo(function ResultsPanel({
  result,
  rows,
  resultsRef,
}: {
  result: CatalogOptimizationResult
  rows: DraftRow[]
  resultsRef: RefObject<HTMLElement | null>
}) {
  if (result.patterns.length === 0) return null

  return (
    <section
      ref={resultsRef}
      id="results-print"
      className="mb-8 grid min-h-0 gap-6 border-t border-stone-200 pt-4 print:mb-0 print:grid-cols-1 print:border-0 print:pt-0 lg:grid-cols-2 lg:items-start"
    >
      <div className="order-1 min-h-0 space-y-6 lg:sticky lg:top-20 lg:order-1 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:self-start lg:pb-2">
        <div className="print-only mb-4 text-center text-sm text-stone-600">
          <p className="font-semibold text-stone-900">רשימת קניות ותוכנית חיתוך</p>
          <p>
            <span
              dir="ltr"
              style={{
                display: 'inline-block',
                direction: 'ltr',
                unicodeBidi: 'isolate',
              }}
            >
              {formatLocalDateIso()}
            </span>
          </p>
        </div>

        <div className="rounded-xl border border-stone-300 bg-white p-5 shadow-sm ring-1 ring-stone-100/60">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
            <ClipboardList className="size-5 text-stone-600" aria-hidden />
            רשימת קניות (לפי קורה)
          </h2>
          <p className="mb-4 text-sm text-stone-700">
            אורכי החנות מחושבים לפי הפרופיל (גובה×רוחב). אם לא הוגדר פרופיל — משתמשים בברירת המחדל.
          </p>
          <div className="space-y-4">
            {result.shoppingList.map((g) => (
              <div
                key={g.material}
                className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 shadow-sm"
              >
                <p className="mb-2 text-sm font-semibold text-stone-900">
                  קורה -{' '}
                  <BeamProfileDims material={g.material} ariaLabel={`מידות קורה ${g.material}`} />
                </p>
                <p className="mb-2 text-sm text-stone-700">
                  {(() => {
                    const totalCm = g.lines.reduce((s, line) => s + line.lengthCm * line.count, 0)
                    const m = metersBareFromCm(totalCm)
                    return (
                      <>
                        סה״כ לקניה:{' '}
                        <strong>
                          <LtrNum ariaLabel={`סה״כ לקניה ${m} מטר`}>{m}</LtrNum>
                        </strong>{' '}
                        מטר
                      </>
                    )
                  })()}
                </p>
                <ul className="list-disc space-y-1 ps-5 text-stone-800">
                  {g.lines.map((line) => (
                    <li key={line.lengthCm}>
                      <LtrNum ariaLabel={`כמות ${line.count}`}>
                        <strong>{line.count}×</strong>
                      </LtrNum>{' '}
                      קורה באורך{' '}
                      <strong>
                        <LtrNum ariaLabel={`אורך ${metersBareFromCm(line.lengthCm)} מטר`}>
                          {metersBareFromCm(line.lengthCm)}
                        </LtrNum>
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50/80 p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">סה״כ קורות</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              <LtrNum ariaLabel={`${result.beamsUsed} קורות`}>{result.beamsUsed}</LtrNum>
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">אחוז שארית</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              <LtrNum ariaLabel={`${percentFixed2(result.wastePercent)} אחוז`}>
                {percentFixed2(result.wastePercent)}%
              </LtrNum>
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">אורך כולל רכישה</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">
              {(() => {
                const totalCm =
                  result.patterns.reduce((s, p) => s + p.beam.lengthMm * p.quantity, 0) / 10
                const m = metersBareFromCm(totalCm)
                return <LtrNum ariaLabel={`אורך כולל רכישה ${m} מטר`}>{m}</LtrNum>
              })()}
            </p>
          </div>
        </div>
      </div>

      <div className="order-2 min-h-0 min-w-0 space-y-6 lg:order-2">
        <h2 className="mb-3 text-lg font-semibold text-stone-800 print:mb-3">
          <span className="inline-block w-fit border-b-2 border-[#1e293b] pb-1">הוראות חיתוך</span>
        </h2>
        <div className="space-y-2">
          {result.patterns.map((p, i) => (
            <BeamVisualization
              key={beamCuttingPlanKey(p.beam)}
              beam={p.beam}
              index={i}
              count={p.quantity}
              draftRows={rows}
            />
          ))}
        </div>
      </div>
    </section>
  )
})
