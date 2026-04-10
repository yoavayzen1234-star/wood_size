import { memo, type CSSProperties, type ReactNode } from 'react'
import type { PackedBeam } from '../../../lib/cuttingOptimizer'
import { metersBareFromCm } from '../../../displayNumbers'
import { LtrNum } from '../../../LtrNum'
import {
  parseDraftPositiveCm,
  profileMaterialKey,
  woodTypeKey,
  type DraftRow,
} from '../../../lib/draftRows'

export function shouldShowPartLabel(label: string | null | undefined): boolean {
  const t = (label ?? '').trim()
  if (t === '') return false
  if (t === 'ללא שם') return false
  return true
}

export function resolvePartLabelForDisplay(
  beam: PackedBeam,
  segLengthMm: number,
  solverLabel: string,
  rows: DraftRow[],
): string {
  const matching = rows.filter((r) => {
    const h = parseDraftPositiveCm(r.heightCm)
    const w = parseDraftPositiveCm(r.widthCm)
    const len = parseDraftPositiveCm(r.lengthCm)
    if (h == null || w == null || len == null) return false
    if (beam.material !== woodTypeKey(w, h) && beam.material !== profileMaterialKey(h, w)) return false
    return Math.abs(len * 10 - segLengthMm) < 0.5
  })
  if (matching.length === 1) {
    const raw = (matching[0]!.name ?? '').trim()
    if (raw === '' || raw === 'ללא שם') return ''
    return raw
  }
  return solverLabel
}

function formatDraftingLengthCm(lengthMm: number): string {
  return (lengthMm / 10).toFixed(1)
}

/** יחס flex זהה בשכבת הקורה ובשכבת המידות — mm כיחסי grow (סה״כ = אורך קורה) */
function beamSegmentFlexStyle(flexBasisMm: number): CSSProperties {
  return {
    flexGrow: Math.max(flexBasisMm, 0.001),
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    minHeight: 0,
  }
}

function DimLtrNum({
  children,
  ariaLabel,
  className = '',
}: {
  children: ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <span
      dir="ltr"
      className={`inline-block [unicode-bidi:isolate] tabular-nums ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {children}
    </span>
  )
}

/** פריסת חלק + מסור שאחריו (אם יש) — ליישור מידות עם פס הקורה */
function slicePartFlexSlices(beam: PackedBeam): { lengthMm: number; flexMm: number }[] {
  const out: { lengthMm: number; flexMm: number }[] = []
  const segs = beam.segments
  let i = 0
  while (i < segs.length) {
    const s = segs[i]!
    if (s.kind !== 'part') {
      i++
      continue
    }
    let flexMm = s.lengthMm
    i++
    if (i < segs.length && segs[i]!.kind === 'kerf') {
      flexMm += segs[i]!.lengthMm
      i++
    }
    out.push({ lengthMm: s.lengthMm, flexMm })
  }
  return out
}

type DimCol =
  | {
      kind: 'partGroup'
      key: string
      flexMm: number
      lengthMm: number
      count: number
    }
  | { kind: 'waste'; key: string; flexMm: number; lengthMm: number }

/** קיבוץ חלקים עוקבים באותו אורך — שורת מידות אחת לכל קבוצה */
function buildDimensionColumns(beam: PackedBeam): DimCol[] {
  const slices = slicePartFlexSlices(beam)
  const cols: DimCol[] = []
  let g = 0
  let keyIdx = 0
  while (g < slices.length) {
    const len = slices[g]!.lengthMm
    let totalFlex = slices[g]!.flexMm
    let count = 1
    g++
    while (g < slices.length && slices[g]!.lengthMm === len) {
      totalFlex += slices[g]!.flexMm
      count++
      g++
    }
    cols.push({
      kind: 'partGroup',
      key: `dim-grp-${keyIdx++}-${len}-${count}`,
      flexMm: totalFlex,
      lengthMm: len,
      count,
    })
  }
  if (beam.wasteMm > 0) {
    cols.push({ kind: 'waste', key: 'dim-waste', flexMm: beam.wasteMm, lengthMm: beam.wasteMm })
  }
  return cols
}

function totalDimFlexMm(cols: DimCol[]): number {
  let s = 0
  for (const c of cols) s += c.flexMm
  return s
}

/** אחוזי גבול לאורך ציר המידות (0 … 100) — קצה שמאל, בין עמודות, קצה ימין (שארית) */
function dimensionTickPositionsPercent(cols: DimCol[], totalFlexMm: number): number[] {
  if (cols.length === 0) return [0, 100]
  const pct: number[] = [0]
  let cum = 0
  for (const c of cols) {
    cum += c.flexMm
    pct.push(totalFlexMm > 0 ? (cum / totalFlexMm) * 100 : 100)
  }
  pct[pct.length - 1] = 100
  return pct
}

const DIM_AXIS_COLOR = '#000000'

/** תא תווית מידה מתחת לציר; רק טקסט השארית נדחף */
function ArchDimLabelCell({
  flexMm,
  totalFlexMm,
  label,
  ariaLabel,
  isWaste = false,
}: {
  flexMm: number
  totalFlexMm: number
  label: string
  ariaLabel: string
  isWaste?: boolean
}) {
  const ratio = totalFlexMm > 0 ? flexMm / totalFlexMm : 0
  const narrow = ratio < 0.07 || flexMm < 32
  const fontClass = narrow ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-[11px]'

  return (
    <div
      className="flex min-h-[1.125rem] w-full min-w-0 items-start justify-center overflow-visible py-0 pt-1 text-center sm:min-h-[1.25rem]"
      dir="ltr"
    >
      <span
        className={`max-w-full whitespace-nowrap font-mono font-normal leading-none tabular-nums antialiased text-black ${fontClass} ${
          isWaste ? 'inline-block translate-x-5' : ''
        }`.trim()}
      >
        <DimLtrNum className="text-black" ariaLabel={ariaLabel}>
          {label}
        </DimLtrNum>
      </span>
    </div>
  )
}

function BeamArchitectDimRow({ beam }: { beam: PackedBeam }) {
  const cols = buildDimensionColumns(beam)
  const totalFlex = totalDimFlexMm(cols)
  const tickPct = dimensionTickPositionsPercent(cols, totalFlex)
  const nTicks = tickPct.length

  return (
    <div
      className="mt-0.5 w-full min-w-0 bg-transparent px-0 py-0.5 print:bg-transparent sm:mt-1 sm:py-1"
      dir="ltr"
      aria-hidden
    >
      <div className="relative w-full min-w-0">
        {/* ציר אופקי רציף אחד + סימונים אנכיים על הגבולות — רוחב זהה לשורת flex מתחת */}
        <div className="relative h-[7px] w-full min-w-0 shrink-0">
          <div
            className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
            style={{ backgroundColor: DIM_AXIS_COLOR }}
          />
          {tickPct.map((pct, i) => {
            const isFirst = i === 0
            const isLast = i === nTicks - 1
            return (
              <div
                key={`tick-${i}-${pct}`}
                className="pointer-events-none absolute top-1/2 w-px -translate-y-1/2"
                style={{
                  left: isFirst ? 0 : isLast ? '100%' : `${pct}%`,
                  height: 5,
                  backgroundColor: DIM_AXIS_COLOR,
                  transform: isFirst
                    ? 'translateY(-50%)'
                    : isLast
                      ? 'translate(-100%, -50%)'
                      : 'translate(-50%, -50%)',
                }}
              />
            )
          })}
        </div>

        <div className="flex w-full min-w-0 gap-0 box-border">
          {cols.map((col) => (
            <div
              key={col.key}
              className={`min-w-0 shrink overflow-visible ${col.kind === 'waste' ? 'relative z-[2]' : ''}`.trim()}
              style={beamSegmentFlexStyle(col.flexMm)}
            >
              {col.kind === 'waste' ? (
                <ArchDimLabelCell
                  flexMm={col.flexMm}
                  totalFlexMm={totalFlex}
                  isWaste
                  label={formatDraftingLengthCm(col.lengthMm)}
                  ariaLabel={`אורך שארית ${formatDraftingLengthCm(col.lengthMm)} סנטימטר`}
                />
              ) : (
                <ArchDimLabelCell
                  flexMm={col.flexMm}
                  totalFlexMm={totalFlex}
                  label={
                    col.count > 1
                      ? `${formatDraftingLengthCm(col.lengthMm)} × ${col.count}`
                      : formatDraftingLengthCm(col.lengthMm)
                  }
                  ariaLabel={
                    col.count > 1
                      ? `אורך ${formatDraftingLengthCm(col.lengthMm)} סנטימטר, ${col.count} חלקים`
                      : `אורך ${formatDraftingLengthCm(col.lengthMm)} סנטימטר`
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function BeamProfileDims({
  material,
  className = '',
  ariaLabel,
}: {
  material: string
  className?: string
  ariaLabel?: string
}) {
  const dims = (material || '—').replace(/x/gi, '×')
  return (
    <span
      className={`inline-block font-bold [unicode-bidi:isolate] ${className}`.trim()}
      dir="ltr"
      style={{ direction: 'ltr' }}
      aria-label={ariaLabel}
    >
      {dims}
    </span>
  )
}

function PartBeamCell({ label, lengthMm }: { label: string; lengthMm: number }) {
  const lenM = metersBareFromCm(lengthMm / 10)
  const showName = shouldShowPartLabel(label)
  const title = showName ? `${label} · ${lenM} מטר` : `${lenM} מטר`
  return (
    <div
      className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden bg-transparent px-0"
      title={title}
    >
      {showName ? (
        <span className="line-clamp-1 max-w-full text-center text-[8px] font-semibold leading-none tracking-wide text-stone-800 print:text-black">
          {label.trim()}
        </span>
      ) : null}
    </div>
  )
}

export const BeamVisualization = memo(function BeamVisualization({
  beam,
  index,
  count,
  draftRows,
}: {
  beam: PackedBeam
  index: number
  count: number
  draftRows: DraftRow[]
}) {
  const lengthCm = beam.lengthMm / 10
  const lengthMetersDisplay = metersBareFromCm(lengthCm)

  return (
    <article className="beam-visual w-full min-w-0 max-w-full rounded-lg border border-stone-200/90 bg-white px-3 py-2 shadow-none ring-1 ring-stone-100 sm:px-4 sm:py-2.5">
      <div className="mb-1 flex min-w-0 flex-nowrap items-center gap-x-3 overflow-x-auto text-xs sm:text-sm [-ms-overflow-style:none] [scrollbar-width:none] print:overflow-visible [&::-webkit-scrollbar]:hidden">
        <span
          className="inline-flex size-8 shrink-0 items-center justify-center rounded border-2 border-stone-500 bg-stone-100 text-base font-bold text-stone-900 shadow-sm print:border-stone-700"
          aria-label={`מספר ${index + 1}`}
        >
          <LtrNum ariaLabel={`מספר ${index + 1}`}>{index + 1}</LtrNum>
        </span>
        <span className="min-w-0 shrink whitespace-nowrap text-stone-900">
          <span className="font-semibold">קורה</span>
          {' - '}
          <BeamProfileDims
            material={beam.material ?? ''}
            ariaLabel={`מידות קורה ${beam.material ?? ''}`}
          />
        </span>
        <span className="shrink-0 whitespace-nowrap text-stone-700">
          <span className="font-semibold text-stone-900">אורך קורה:</span>{' '}
          <LtrNum ariaLabel={`אורך קורה ${lengthMetersDisplay} מטר`}>{lengthMetersDisplay}</LtrNum>
        </span>
        <span className="shrink-0 whitespace-nowrap text-stone-700">
          <span className="font-semibold text-stone-900">כמות:</span>{' '}
          <LtrNum ariaLabel={`כמות ${count}`}>{count}</LtrNum>
        </span>
      </div>

      <div className="w-full min-w-0 max-w-full overflow-visible rounded-md px-2 py-1.5 pr-7 sm:px-2 sm:py-2.5 sm:pr-9">
        {/*
          מיכל אחד לפס קורה + מידות: אותו רוחב פנימי, ריפוד סימטרי בלבד (ללא pr נוסף לשארית),
          gap-0 — כדי שיישור flex יזהה בין שכבות.
        */}
        <div
          className="flex h-[18px] w-full min-w-0 max-w-full gap-0 overflow-hidden rounded-sm border border-solid border-black bg-[#fdfdfd] box-border print:border-black print:bg-white sm:h-[20px]"
          dir="ltr"
        >
          {beam.segments.map((seg, i) =>
            seg.kind === 'kerf' ? (
              <div
                key={i}
                className="relative min-w-0 shrink box-border"
                style={beamSegmentFlexStyle(seg.lengthMm)}
                aria-hidden
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-1/2 z-[1] w-px -translate-x-1/2 bg-black print:bg-black"
                  aria-hidden
                />
              </div>
            ) : (
              <div
                key={i}
                className="min-w-0 shrink box-border"
                style={beamSegmentFlexStyle(seg.lengthMm)}
              >
                <PartBeamCell
                  label={resolvePartLabelForDisplay(beam, seg.lengthMm, seg.label, draftRows)}
                  lengthMm={seg.lengthMm}
                />
              </div>
            ),
          )}
          {beam.wasteMm > 0 && (
            <div
              className="min-w-0 shrink box-border border-l border-solid border-l-black bg-[#94a3b8] print:bg-slate-400"
              style={beamSegmentFlexStyle(beam.wasteMm)}
              aria-label="שארית"
              title="שארית"
            />
          )}
        </div>
        <BeamArchitectDimRow beam={beam} />
        <p className="pt-1.5 text-center text-sm font-normal text-black tabular-nums print:text-black sm:pt-2 sm:text-base">
          <LtrNum
            className="text-base font-normal text-black print:text-black sm:text-lg"
            ariaLabel={`אורך קורה ${lengthMetersDisplay} מטר`}
          >
            {lengthMetersDisplay}
          </LtrNum>
        </p>
      </div>
    </article>
  )
})
