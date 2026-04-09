import { memo, type CSSProperties, type ReactNode } from 'react'
import type { PackedBeam } from '../../../lib/cuttingOptimizer'
import { metersBareFromCm } from '../../../displayNumbers'
import { LtrNum } from '../../../LtrNum'
import {
  parseDraftPositiveCm,
  profileMaterialKey,
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
    if (profileMaterialKey(h, w) !== beam.material) return false
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

function beamSegmentFlexStyle(lengthMm: number): CSSProperties {
  return {
    flex: `${Math.max(lengthMm, 0.001)} 1 0%`,
    minWidth: 1,
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

type MergedBeamDimCol =
  | { kind: 'part'; key: string; flexMm: number; lengthMm: number }
  | { kind: 'waste'; key: string; flexMm: number; lengthMm: number }

function mergedBeamDimColumns(beam: PackedBeam): MergedBeamDimCol[] {
  const out: MergedBeamDimCol[] = []
  let partIdx = 0
  for (let i = 0; i < beam.segments.length; ) {
    const seg = beam.segments[i]
    if (seg.kind !== 'part') {
      i++
      continue
    }
    let flexMm = seg.lengthMm
    const keyBase = i
    i++
    if (i < beam.segments.length && beam.segments[i]!.kind === 'kerf') {
      flexMm += beam.segments[i]!.lengthMm
      i++
    }
    out.push({
      kind: 'part',
      key: `dim-part-${keyBase}-${partIdx++}`,
      flexMm,
      lengthMm: seg.lengthMm,
    })
  }
  if (beam.wasteMm > 0) {
    out.push({ kind: 'waste', key: 'dim-waste', flexMm: beam.wasteMm, lengthMm: beam.wasteMm })
  }
  return out
}

function ArchDimUnderSegment({
  lengthMm,
  ariaLabel,
  tone = 'dark',
  showNumber = true,
  isFirstColumn = false,
}: {
  lengthMm: number
  ariaLabel: string
  tone?: 'dark' | 'waste'
  showNumber?: boolean
  isFirstColumn?: boolean
}) {
  const line = tone === 'waste' ? 'bg-slate-600 print:bg-black' : 'bg-zinc-800 print:bg-black'
  const text = tone === 'waste' ? 'text-slate-800 print:text-black' : 'text-zinc-900 print:text-black'
  const t = formatDraftingLengthCm(lengthMm)
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 px-0">
      <div className="relative h-[6px] w-full min-w-0 shrink-0">
        <div className={`absolute inset-x-0 top-1/2 h-px -translate-y-1/2 ${line}`} />
        {isFirstColumn ? (
          <div className={`absolute left-0 top-1/2 h-[6px] w-[1.5px] -translate-y-1/2 ${line}`} />
        ) : null}
        <div className={`absolute right-0 top-1/2 h-[6px] w-[1.5px] -translate-y-1/2 ${line}`} />
      </div>
      {showNumber ? (
        <div
          className="flex min-h-[1.25rem] w-full min-w-0 items-start justify-center overflow-visible py-0"
          dir="ltr"
        >
          <span className="whitespace-nowrap font-mono text-[10px] font-semibold leading-none tabular-nums sm:text-[11px]">
            <DimLtrNum className={text} ariaLabel={ariaLabel}>
              {t}
            </DimLtrNum>
          </span>
        </div>
      ) : (
        <div className="min-h-[1.25rem] w-full shrink-0 py-0" aria-hidden />
      )}
    </div>
  )
}

function BeamArchitectDimRow({ beam }: { beam: PackedBeam }) {
  const cols = mergedBeamDimColumns(beam)
  return (
    <div
      className="mt-1 w-full min-w-0 border-b border-zinc-300/80 bg-[#fafafa] px-0 py-1.5 print:border-zinc-300 print:bg-white"
      dir="ltr"
      aria-hidden
    >
      <div className="flex w-full min-w-0 gap-0">
        {cols.map((col, idx) => (
          <div key={col.key} className="min-w-px shrink" style={beamSegmentFlexStyle(col.flexMm)}>
            <ArchDimUnderSegment
              lengthMm={col.lengthMm}
              isFirstColumn={idx === 0}
              tone={col.kind === 'waste' ? 'waste' : 'dark'}
              ariaLabel={
                col.kind === 'waste'
                  ? `אורך שארית ${formatDraftingLengthCm(col.lengthMm)} סנטימטר`
                  : `אורך ${formatDraftingLengthCm(col.lengthMm)} סנטימטר`
              }
            />
          </div>
        ))}
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

      <div className="w-full min-w-0 max-w-full overflow-x-hidden rounded-md px-1 py-2 sm:px-2 sm:py-2.5">
        <div
          className="flex h-[20px] w-full min-w-0 max-w-full gap-0 overflow-hidden rounded-sm border border-solid border-[#ccc] bg-[#fdfdfd] print:border-zinc-400 print:bg-white"
          dir="ltr"
        >
          {beam.segments.map((seg, i) =>
            seg.kind === 'kerf' ? (
              <div
                key={i}
                className="relative box-border min-w-px shrink"
                style={beamSegmentFlexStyle(seg.lengthMm)}
                aria-hidden
              >
                <div
                  className="pointer-events-none absolute inset-y-0 left-1/2 z-[1] w-[1.5px] -translate-x-1/2 bg-[#333] print:bg-black"
                  aria-hidden
                />
              </div>
            ) : (
              <div
                key={i}
                className="box-border min-w-px shrink"
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
              className="box-border min-w-px shrink border-l-[1.5px] border-solid border-l-[#333] bg-[#94a3b8] print:bg-slate-400"
              style={beamSegmentFlexStyle(beam.wasteMm)}
              aria-label="שארית"
              title="שארית"
            />
          )}
        </div>
        <BeamArchitectDimRow beam={beam} />
        <div className="border-x border-b border-stone-200/80 bg-stone-50/70 print:border-zinc-300 print:bg-white">
          <p className="border-t border-stone-200/90 px-2 py-1 text-center text-sm font-semibold text-stone-900 print:border-zinc-300 print:text-black sm:text-base">
            <LtrNum
              className="text-base font-semibold sm:text-lg"
              ariaLabel={`אורך קורה ${lengthMetersDisplay} מטר`}
            >
              {lengthMetersDisplay}
            </LtrNum>
          </p>
        </div>
      </div>
    </article>
  )
})
