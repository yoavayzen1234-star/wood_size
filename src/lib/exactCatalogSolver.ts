/**
 * פותר מדויק (למצב שלם) לבעיית חיתוך ממלאי קטלוג:
 * מזעילים קודם **סך השאריות** (סך (אורך קורה − חומר בשימוש)), אחר כך **סך חיתוכי מסור**
 * (על כל קורה: מספר חלקים מינוס 1), ואז **סך מטרי קורות** קנויים, ואז **מספר קורות**.
 * לכל תבנית נבחר תמיד אורך הקטלוג **המינימלי** שעדיין מכיל את החיתוך.
 * בשחזור, בשוויון — תבנית עם **שארית קטנה יותר בצעד הנוכחי**, ואז **קורה קצרה יותר** (התאמה הדוקה).
 *
 * מגבלות: מרחב מצבים = ∏(dᵢ+1), וגם מספר סוגי חלקים — מעל סף — נפילה ל־optimizeWithStoreCatalog (heuristic).
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
  optimizeWithStoreCatalog,
  normalizeStoreStockLengthsCm,
} from './cuttingOptimizer'
import { metersBareFromCm } from '../numericFormat'
import { randomId } from './randomId'
import { groupIdenticalCuttingBeams } from './beamGrouping'

/** DP מדויק + יצירת תבניות כבדים מעל סף זה בדפדפן — קירוב מהיר. */
const MAX_STATE_PRODUCT = 150_000
/** יותר מדי סוגים (שם+אורך) → DFS תבניות ענקי גם כשמרחב המצבים נראה סביר. */
const MAX_TYPES_FOR_EXACT = 10
const MAX_PATTERNS = 75_000

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

function measureUsedMm(counts: number[], types: PartType[], kerfMm: number): number {
  let sumL = 0
  let n = 0
  for (let i = 0; i < types.length; i++) {
    const c = counts[i] ?? 0
    sumL += c * types[i].lengthMm
    n += c
  }
  if (n === 0) return 0
  return sumL + (n - 1) * kerfMm
}

function minStockMmForUsed(storeStockLengthsCm: readonly number[], usedMm: number): number | null {
  const cm = storeStockLengthsCm.find((l) => l * 10 + 1e-9 >= usedMm)
  return cm != null ? cm * 10 : null
}

function generatePatterns(
  types: PartType[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): Pattern[] {
  const m = types.length
  if (m === 0) return []

  const c = new Array(m).fill(0)
  const seen = new Set<string>()
  const patterns: Pattern[] = []

  function record(counts: number[]) {
    const used = measureUsedMm(counts, types, kerfMm)
    if (used <= 0 || used > maxStockMm + 1e-6) return
    const stockMm = minStockMmForUsed(storeStockLengthsCm, used)
    if (stockMm === null) return
    const key = counts.join(',')
    if (seen.has(key)) return
    seen.add(key)
    patterns.push({
      counts: [...counts],
      usedMm: used,
      stockLengthMm: stockMm,
    })
    if (patterns.length > MAX_PATTERNS) {
      throw new Error('PATTERN_LIMIT')
    }
  }

  function dfs(i: number, used: number, partsBeforeI: number) {
    if (i === m) {
      if (partsBeforeI > 0 && used <= maxStockMm + 1e-6) {
        record([...c])
      }
      return
    }

    c[i] = 0
    dfs(i + 1, used, partsBeforeI)

    let u = used
    let t = partsBeforeI
    for (;;) {
      const nu = u + types[i].lengthMm + (t > 0 ? kerfMm : 0)
      if (nu > maxStockMm + 1e-6) break
      c[i]++
      u = nu
      t = partsBeforeI + c[i]
      dfs(i + 1, u, t)
    }
    c[i] = 0
  }

  dfs(0, 0, 0)
  return patterns
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

function estimateStates(types: PartType[]): number {
  let p = 1
  for (const t of types) {
    p *= t.demand + 1
    if (p > MAX_STATE_PRODUCT) return p
  }
  return p
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

function solveOneMaterialExact(
  material: string,
  types: PartType[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): { beams: PackedBeam[]; costMm: number } {
  const demand = types.map((t) => t.demand)
  const patterns = generatePatterns(types, kerfMm, maxStockMm, storeStockLengthsCm)
  if (patterns.length === 0) {
    return { beams: [], costMm: Infinity }
  }

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
      if (dpBetter(cand, best)) best = cand
    }

    memo.set(k, best)
    return best
  }

  const optimal = dp(demand)
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

    for (const pat of patterns) {
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

/**
 * פותר קטלוג החנות בדיוק מרבי (בהנחת תבניות מלאות), או נופל ל-heuristic.
 */
export function solveExactStoreCatalog(
  partRows: PartInput[],
  kerfMm: number,
  defaultStoreStockLengthsCm: readonly number[] = DEFAULT_STORE_STOCK_LENGTHS_CM,
  storeStockLengthsByMaterial?: Readonly<Record<string, readonly number[]>>,
): CatalogOptimizationResult {
  const k = Math.max(0, kerfMm)
  const getStoreLengthsForMaterial = (material: string) =>
    normalizeStoreStockLengthsCm(storeStockLengthsByMaterial?.[material] ?? defaultStoreStockLengthsCm)

  const mats = materialsInParts(partRows)
  if (mats.length === 0) {
    return {
      patterns: [],
      errors: [],
      beamsUsed: 0,
      wastePercent: 0,
      mode: 'store-catalog',
      shoppingList: [],
      solverKind: 'exact-dp',
    }
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
    return {
      patterns: [],
      errors: [...new Set(errors)],
      beamsUsed: 0,
      wastePercent: 0,
      mode: 'store-catalog',
      shoppingList: [],
    }
  }

  let statesMax = 1
  for (const material of mats) {
    const types = buildTypesForMaterial(material, partRows)
    if (types.length === 0) continue
    statesMax = Math.max(statesMax, estimateStates(types))
  }

  const allBeams: PackedBeam[] = []
  const solverNotes: string[] = []
  const solverKinds = new Set<CatalogOptimizationResult['solverKind']>()
  try {
    for (const material of mats) {
      const storeLengths = getStoreLengthsForMaterial(material)
      const maxStockCm = storeLengths[storeLengths.length - 1]!
      const maxStockMm = maxStockCm * 10
      const types = buildTypesForMaterial(material, partRows)
      if (types.length === 0) continue

      const states = estimateStates(types)
      const tooManyStates = states > MAX_STATE_PRODUCT
      const tooManyTypes = types.length > MAX_TYPES_FOR_EXACT
      if (tooManyStates || tooManyTypes) {
        const filtered = partRows.filter((r) => r.material.trim() === material)
        const base = optimizeWithStoreCatalog(filtered, k, storeLengths)
        for (const p of base.patterns) {
          for (let i = 0; i < p.quantity; i++) allBeams.push(p.beam)
        }
        solverKinds.add('heuristic-best-fit')
        solverNotes.push(
          tooManyTypes
            ? `בחומר "${material}": יותר מדי סוגי חלקים שונים לחישוב מדויק — הוחל פתרון קירוב (Best Fit).`
            : `בחומר "${material}": מרחב המצבים גדול מדי לחישוב מדויק — הוחל פתרון קירוב (Best Fit).`,
        )
        continue
      }

      const { beams, costMm } = solveOneMaterialExact(material, types, k, maxStockMm, storeLengths)
      if (beams.length === 0 || costMm === Infinity) {
        const filtered = partRows.filter((r) => r.material.trim() === material)
        const base = optimizeWithStoreCatalog(filtered, k, storeLengths)
        for (const p of base.patterns) {
          for (let i = 0; i < p.quantity; i++) allBeams.push(p.beam)
        }
        solverKinds.add('heuristic-best-fit')
        solverNotes.push(`בחומר "${material}": לא נמצאה תוכנית מלאה בתבניות — הוחל פתרון קירוב.`)
        continue
      }

      allBeams.push(...beams)
      solverKinds.add('exact-dp')
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'PATTERN_LIMIT') {
      // במקרה חריג של מגבלת תבניות, נופלים ל-heuristic לכל הפרויקט (התנהגות קודמת).
      const base = optimizeWithStoreCatalog(partRows, k, normalizeStoreStockLengthsCm(defaultStoreStockLengthsCm))
      return { ...base, solverKind: 'heuristic-best-fit', solverNote: 'חריגה ממגבלת תבניות — הוחל פתרון קירוב.' }
    }
    throw e
  }

  allBeams.sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material, 'he')
    return a.lengthMm !== b.lengthMm ? b.lengthMm - a.lengthMm : a.id.localeCompare(b.id)
  })

  const totalStockMm = allBeams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = allBeams.reduce((s, b) => s + b.wasteMm, 0)
  const wastePercent = totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0

  return {
    patterns: groupIdenticalCuttingBeams(allBeams).map((g) => ({ beam: g.beam, quantity: g.count })),
    errors: [],
    beamsUsed: allBeams.length,
    wastePercent,
    mode: 'store-catalog',
    shoppingList: aggregateShoppingList(allBeams),
    solverKind: solverKinds.has('heuristic-best-fit') ? 'heuristic-best-fit' : 'exact-dp',
    solverNote: solverNotes.length ? solverNotes.join(' ') : undefined,
  }
}
