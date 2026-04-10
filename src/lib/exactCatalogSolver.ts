/**
 * פותר מדויק (למצב שלם) לבעיית חיתוך ממלאי קטלוג:
 * מזעילים קודם **סך השאריות** (סך (אורך קורה − חומר בשימוש)), אחר כך **סך חיתוכי מסור**
 * (על כל קורה: מספר חלקים מינוס 1), ואז **סך מטרי קורות** קנויים, ואז **מספר קורות**.
 * לכל תבנית נבחר תמיד אורך הקטלוג **המינימלי** שעדיין מכיל את החיתוך.
 * בשחזור, בשוויון — תבנית עם **שארית קטנה יותר בצעד הנוכחי**, ואז **קורה קצרה יותר** (התאמה הדוקה).
 *
 * תמיד פותר באלגוריתם המדויק (DP) — ללא קירוב.
 *
 * ייעולים (לא משנים את סדר העדיפויות / הפתרון האופטימלי):
 * - סינון תבניות **נשלטות** (dominated) + **אימות** מול DP על כל התבניות כשהתקציב זעום
 * - **מיון** תבניות לסריקה: שארית → חיתוכים → אורך קורה
 * - **חסם עליון** FFD (מטריקות ב־`exactSolverDebug.lastDiagnostics`)
 * - memo לפי וקטור `rem` (כמו קודם)
 */

import type {
  BeamSegment,
  CatalogOptimizationResult,
  PackedBeam,
  PartInput,
} from './cuttingOptimizer'
import {
  DEFAULT_STORE_STOCK_LENGTHS_CM,
  aggregateShoppingList,
  normalizeStoreStockLengthsCm,
} from './cuttingOptimizer'
import { metersBareFromCm } from '../numericFormat'
import { randomId } from './randomId'
import { groupIdenticalCuttingBeams } from './beamGrouping'
import {
  generatePatternsParallel,
  removeDominatedPatternsParallel,
} from './exactCatalogParallel'

type PartType = {
  label: string
  lengthMm: number
  demand: number
}

type Pattern = {
  counts: number[]
  usedMm: number
  stockLengthMm: number
}

const normalizeMaterial = (s: string) => s.trim()

function minStockMmForUsed(storeStockLengthsCm: readonly number[], usedMm: number): number | null {
  const cm = storeStockLengthsCm.find((l) => l * 10 + 1e-9 >= usedMm)
  return cm != null ? cm * 10 : null
}

function remKey(rem: number[]) {
  return rem.join(',')
}

function patternToPackedBeam(
  p: Pattern,
  types: PartType[],
  material: string,
  kerfMm: number,
): PackedBeam {
  type Piece = { label: string; lengthMm: number }
  const pieces: Piece[] = []
  for (let i = 0; i < types.length; i++) {
    for (let k = 0; k < p.counts[i]; k++) {
      pieces.push({ label: types[i].label, lengthMm: types[i].lengthMm })
    }
  }
  pieces.sort((a, b) => b.lengthMm - a.lengthMm)

  const segments: BeamSegment[] = []
  for (let i = 0; i < pieces.length; i++) {
    if (i > 0) segments.push({ kind: 'kerf', lengthMm: kerfMm })
    segments.push({ kind: 'part', label: pieces[i].label, lengthMm: pieces[i].lengthMm })
  }

  const usedMm = p.usedMm
  return {
    id: randomId(),
    material,
    lengthMm: p.stockLengthMm,
    segments,
    usedMm,
    wasteMm: Math.max(0, p.stockLengthMm - usedMm),
    stockRowIndex: -1,
    isAdditionalPurchase: true,
  }
}

/** חיתוכים על קורה אחת: בין חלק לחלק (חלק יחיד = 0). */
function patternCutsFromCounts(counts: number[]): number {
  let n = 0
  for (const c of counts) n += c
  return n <= 1 ? 0 : n - 1
}

function buildTypesForMaterial(material: string, rows: PartInput[]): PartType[] {
  const acc = new Map<string, { label: string; lengthMm: number; demand: number }>()
  for (const r of rows) {
    const m = normalizeMaterial(r.material)
    if (m !== material || r.quantity <= 0) continue
    const lengthMm = r.lengthCm * 10
    if (lengthMm <= 0) continue
    const label = (r.label || 'ללא שם').trim() || 'ללא שם'
    const k = `${label}\t${lengthMm}`
    const prev = acc.get(k)
    if (prev) prev.demand += Math.floor(r.quantity)
    else acc.set(k, { label, lengthMm, demand: Math.floor(r.quantity) })
  }
  const types = [...acc.values()]
  types.sort((a, b) => b.lengthMm - a.lengthMm || a.label.localeCompare(b.label, 'he'))
  return types
}

function materialsInParts(rows: PartInput[]): string[] {
  const s = new Set<string>()
  for (const r of rows) {
    const m = normalizeMaterial(r.material)
    if (m && r.quantity > 0 && r.lengthCm > 0) s.add(m)
  }
  return [...s]
}

/** ערך DP: שאריות ← חיתוכים ← סך מטרי קורות ← מספר קורות */
type DpVal = { wasteMm: number; cuts: number; stockMm: number; boards: number }

const DP_INF: DpVal = { wasteMm: Infinity, cuts: Infinity, stockMm: Infinity, boards: Infinity }

function dpBetter(a: DpVal, b: DpVal): boolean {
  if (a.wasteMm < b.wasteMm - 1e-6) return true
  if (b.wasteMm < a.wasteMm - 1e-6) return false
  if (a.cuts < b.cuts - 1e-6) return true
  if (b.cuts < a.cuts - 1e-6) return false
  if (a.stockMm < b.stockMm - 1e-6) return true
  if (b.stockMm < a.stockMm - 1e-6) return false
  return a.boards < b.boards
}

function dpEqual(a: DpVal, b: DpVal): boolean {
  return (
    Math.round(a.wasteMm) === Math.round(b.wasteMm) &&
    a.cuts === b.cuts &&
    Math.round(a.stockMm) === Math.round(b.stockMm) &&
    a.boards === b.boards
  )
}

/** מטריקות אחרונות (בונוס) — לא משפיעות על תוצאת החישוב */
export type ExactSolverDiagnostics = {
  patternCountGenerated: number
  patternCountAfterDominationFilter: number
  greedyUpperBound: DpVal | null
  dominationFilterVerified: boolean
  memoSize: number
}

export const exactSolverDebug: { lastDiagnostics: ExactSolverDiagnostics | null } = {
  lastDiagnostics: null,
}

function patternWasteMm(pat: Pattern): number {
  return Math.max(0, pat.stockLengthMm - pat.usedMm)
}

/** סדר ענפים: שארית נמוכה → פחות חיתוכים → קורה קצרה */
function sortPatternsForBranching(patterns: Pattern[], m: number): Pattern[] {
  return [...patterns].sort((A, B) => {
    const wA = patternWasteMm(A)
    const wB = patternWasteMm(B)
    if (wA !== wB) return wA - wB
    const cA = patternCutsFromCounts(A.counts)
    const cB = patternCutsFromCounts(B.counts)
    if (cA !== cB) return cA - cB
    if (A.stockLengthMm !== B.stockLengthMm) return A.stockLengthMm - B.stockLengthMm
    for (let i = 0; i < m; i++) {
      const d = (B.counts[i] ?? 0) - (A.counts[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })
}

function usedMmForBeamPartLengths(lengths: readonly number[], kerfMm: number): number {
  if (lengths.length === 0) return 0
  let s = 0
  for (const L of lengths) s += L
  return s + (lengths.length - 1) * kerfMm
}

/**
 * חסם עליון חוקי (פתרון אפשרי) — First Fit Decreasing על רשימת אורכים שטוחה.
 * לא משמש לקיצוץ ענפים ב-DP (נדרש חסם תחתון תקף); רק לאבחון ולעצירה מוקדמת של «מושלם».
 */
function greedyFfdUpperBound(
  types: PartType[],
  demand: number[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): DpVal | null {
  const pieces: number[] = []
  for (let i = 0; i < types.length; i++) {
    for (let k = 0; k < (demand[i] ?? 0); k++) pieces.push(types[i]!.lengthMm)
  }
  if (pieces.length === 0) return { wasteMm: 0, cuts: 0, stockMm: 0, boards: 0 }
  pieces.sort((a, b) => b - a)
  const beams: number[][] = []
  for (const L of pieces) {
    if (L > maxStockMm + 1e-6) return null
    let placed = false
    for (const beam of beams) {
      const next = [...beam, L]
      const u = usedMmForBeamPartLengths(next, kerfMm)
      if (u <= maxStockMm + 1e-6) {
        beam.push(L)
        placed = true
        break
      }
    }
    if (!placed) beams.push([L])
  }
  let wasteMm = 0
  let cuts = 0
  let stockMm = 0
  const boards = beams.length
  for (const beam of beams) {
    const u = usedMmForBeamPartLengths(beam, kerfMm)
    const sm = minStockMmForUsed(storeStockLengthsCm, u)
    if (sm === null) return null
    wasteMm += sm - u
    cuts += beam.length <= 1 ? 0 : beam.length - 1
    stockMm += sm
  }
  return { wasteMm, cuts, stockMm, boards }
}

function createDpSolver(patterns: Pattern[]) {
  const memo = new Map<string, DpVal>()

  function dp(rem: number[]): DpVal {
    if (rem.every((r) => r <= 0)) return { wasteMm: 0, cuts: 0, stockMm: 0, boards: 0 }
    const k = remKey(rem)
    if (memo.has(k)) return memo.get(k)!
    let best = DP_INF

    for (const pat of patterns) {
      // Strict quantity enforcement: never cut more than remaining demand for any part type.
      // Without this, DP may "overcut" by selecting a pattern that exceeds rem[] and then clamping to zero.
      let exceeds = false
      for (let i = 0; i < rem.length; i++) {
        if ((pat.counts[i] ?? 0) > rem[i]!) {
          exceeds = true
          break
        }
      }
      if (exceeds) continue
      const next = rem.map((r, i) => Math.max(0, r - (pat.counts[i] ?? 0)))
      const helps = next.some((n, i) => n < rem[i])
      if (!helps) continue
      const sub = dp(next)
      if (sub.wasteMm === Infinity) continue
      const wasteStep = Math.max(0, pat.stockLengthMm - pat.usedMm)
      const cutsStep = patternCutsFromCounts(pat.counts)
      const cand: DpVal = {
        wasteMm: wasteStep + sub.wasteMm,
        cuts: cutsStep + sub.cuts,
        stockMm: pat.stockLengthMm + sub.stockMm,
        boards: 1 + sub.boards,
      }
      if (dpBetter(cand, best)) best = cand
    }

    memo.set(k, best)
    return best
  }

  return { dp, memo }
}

/** השוואת ערך אופטימלי בין שתי קבוצות תבניות — לאימות סינון dominated */
function dpOptimalEquals(demand: number[], patternsA: Pattern[], patternsB: Pattern[]): boolean {
  const { dp: dpA } = createDpSolver(patternsA)
  const { dp: dpB } = createDpSolver(patternsB)
  const va = dpA(demand)
  const vb = dpB(demand)
  if (va.wasteMm === Infinity || vb.wasteMm === Infinity) return va.wasteMm === vb.wasteMm
  return dpEqual(va, vb)
}

async function solveOneMaterialExact(
  material: string,
  types: PartType[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): Promise<{ beams: PackedBeam[]; costMm: number }> {
  const demand = types.map((t) => t.demand)
  const m = types.length
  const generatedLite = await generatePatternsParallel(
    types,
    kerfMm,
    maxStockMm,
    storeStockLengthsCm,
  )
  const generated: Pattern[] = generatedLite.map((p) => ({
    counts: p.counts,
    usedMm: p.usedMm,
    stockLengthMm: p.stockLengthMm,
  }))
  if (generated.length === 0) {
    exactSolverDebug.lastDiagnostics = {
      patternCountGenerated: 0,
      patternCountAfterDominationFilter: 0,
      greedyUpperBound: null,
      dominationFilterVerified: false,
      memoSize: 0,
    }
    return { beams: [], costMm: Infinity }
  }

  const sortedFull = sortPatternsForBranching(generated, m)
  const greedyUb = greedyFfdUpperBound(types, demand, kerfMm, maxStockMm, storeStockLengthsCm)

  let patternsWork = sortedFull
  let dominationVerified = false
  const filteredRaw = await removeDominatedPatternsParallel(sortedFull, m)
  const filteredSorted = sortPatternsForBranching(filteredRaw, m)

  if (filteredSorted.length < sortedFull.length) {
    const sumDemand = demand.reduce((a, b) => a + b, 0)
    const estOps = sumDemand * Math.max(sortedFull.length, filteredSorted.length)
    const canVerify = estOps <= 4_000_000
    if (canVerify && dpOptimalEquals(demand, sortedFull, filteredSorted)) {
      patternsWork = filteredSorted
      dominationVerified = true
    }
  }

  const { dp, memo } = createDpSolver(patternsWork)
  exactSolverDebug.lastDiagnostics = {
    patternCountGenerated: sortedFull.length,
    patternCountAfterDominationFilter: patternsWork.length,
    greedyUpperBound: greedyUb,
    dominationFilterVerified: dominationVerified,
    memoSize: 0,
  }

  const optimal = dp(demand)
  if (exactSolverDebug.lastDiagnostics) {
    exactSolverDebug.lastDiagnostics.memoSize = memo.size
  }

  if (optimal.wasteMm === Infinity) {
    return { beams: [], costMm: Infinity }
  }

  const beams: PackedBeam[] = []
  let rem = [...demand]
  while (!rem.every((r) => r <= 0)) {
    const target = dp(rem)
    let chosen: Pattern | null = null
    let chosenNext: number[] | null = null
    let bestStepWaste = Infinity
    let bestStepCuts = Infinity
    let bestPatStock = Infinity

    for (const pat of patternsWork) {
      // Same strict quantity rule during reconstruction.
      let exceeds = false
      for (let i = 0; i < rem.length; i++) {
        if ((pat.counts[i] ?? 0) > rem[i]!) {
          exceeds = true
          break
        }
      }
      if (exceeds) continue
      const next = rem.map((r, i) => Math.max(0, r - pat.counts[i]))
      const helps = next.some((n, i) => n < rem[i])
      if (!helps) continue
      const sub = dp(next)
      if (sub.wasteMm === Infinity) continue
      const wasteStep = Math.max(0, pat.stockLengthMm - pat.usedMm)
      const cutsStep = patternCutsFromCounts(pat.counts)
      const cand: DpVal = {
        wasteMm: wasteStep + sub.wasteMm,
        cuts: cutsStep + sub.cuts,
        stockMm: pat.stockLengthMm + sub.stockMm,
        boards: 1 + sub.boards,
      }
      if (!dpEqual(cand, target)) continue
      const tighter =
        wasteStep < bestStepWaste - 1e-6 ||
        (Math.abs(wasteStep - bestStepWaste) < 1e-6 && cutsStep < bestStepCuts - 1e-6) ||
        (Math.abs(wasteStep - bestStepWaste) < 1e-6 &&
          Math.abs(cutsStep - bestStepCuts) < 1e-6 &&
          pat.stockLengthMm < bestPatStock - 1e-6)
      if (tighter) {
        bestStepWaste = wasteStep
        bestStepCuts = cutsStep
        bestPatStock = pat.stockLengthMm
        chosen = pat
        chosenNext = next
      }
    }

    if (!chosen || !chosenNext) {
      return { beams: [], costMm: Infinity }
    }

    beams.push(patternToPackedBeam(chosen, types, material, kerfMm))
    rem = chosenNext
  }

  return { beams, costMm: optimal.stockMm }
}

function roundSolveSeconds(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100
}

/**
 * פותר קטלוג החנות תמיד באלגוריתם המדויק (DP).
 */
export async function solveExactStoreCatalog(
  partRows: PartInput[],
  kerfMm: number,
  defaultStoreStockLengthsCm: readonly number[] = DEFAULT_STORE_STOCK_LENGTHS_CM,
  storeStockLengthsByMaterial?: Readonly<Record<string, readonly number[]>>,
): Promise<CatalogOptimizationResult> {
  const t0 = performance.now()
  const k = Math.max(0, kerfMm)
  const getStoreLengthsForMaterial = (material: string) =>
    normalizeStoreStockLengthsCm(storeStockLengthsByMaterial?.[material] ?? defaultStoreStockLengthsCm)

  const finish = (partial: Omit<CatalogOptimizationResult, 'mode' | 'solveTimeMs' | 'solveTimeSeconds'>): CatalogOptimizationResult => {
    const solveTimeMs = performance.now() - t0
    return {
      ...partial,
      mode: 'store-catalog',
      solverKind: 'exact-dp',
      solveTimeMs,
      solveTimeSeconds: roundSolveSeconds(solveTimeMs),
    }
  }

  const mats = materialsInParts(partRows)
  if (mats.length === 0) {
    return finish({
      patterns: [],
      errors: [],
      beamsUsed: 0,
      wastePercent: 0,
      shoppingList: [],
    })
  }

  const errors: string[] = []
  for (const material of mats) {
    const storeLengths = getStoreLengthsForMaterial(material)
    const maxStockCm = storeLengths[storeLengths.length - 1]!
    const maxStockMm = maxStockCm * 10
    const types = buildTypesForMaterial(material, partRows)
    for (const t of types) {
      if (t.lengthMm > maxStockMm + 1e-6) {
        errors.push(
          `חלק ארוך מדי באורך ${metersBareFromCm(t.lengthMm / 10)} מטר בחומר "${material}" — מקס׳ קורה ${metersBareFromCm(maxStockCm)} מטר.`,
        )
      }
    }
  }

  if (errors.length > 0) {
    return finish({
      patterns: [],
      errors: [...new Set(errors)],
      beamsUsed: 0,
      wastePercent: 0,
      shoppingList: [],
    })
  }

  const allBeams: PackedBeam[] = []
  for (const material of mats) {
    const storeLengths = getStoreLengthsForMaterial(material)
    const maxStockCm = storeLengths[storeLengths.length - 1]!
    const maxStockMm = maxStockCm * 10
    const types = buildTypesForMaterial(material, partRows)
    if (types.length === 0) continue

    const { beams, costMm } = await solveOneMaterialExact(material, types, k, maxStockMm, storeLengths)
    if (beams.length === 0 || costMm === Infinity) {
      errors.push(
        `בחומר "${material}": לא נמצאה תוכנית חיתוך מלאה. בדקו אורכי קורה בקטלוג או מידות חלקים.`,
      )
      continue
    }

    allBeams.push(...beams)
  }

  allBeams.sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material, 'he')
    return a.lengthMm !== b.lengthMm ? b.lengthMm - a.lengthMm : a.id.localeCompare(b.id)
  })

  const totalStockMm = allBeams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = allBeams.reduce((s, b) => s + b.wasteMm, 0)
  const wastePercent = totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0

  return finish({
    patterns: groupIdenticalCuttingBeams(allBeams).map((g) => ({ beam: g.beam, quantity: g.count })),
    errors: [...new Set(errors)],
    beamsUsed: allBeams.length,
    wastePercent,
    shoppingList: aggregateShoppingList(allBeams),
  })
}
