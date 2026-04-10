import type {
  CatalogOptimizationResult,
  PackedBeam,
  PartInput,
  WoodTypeOptimizationSummary,
} from './cuttingOptimizer'
import { aggregateShoppingList } from './cuttingOptimizer'
import { groupIdenticalCuttingBeams } from './beamGrouping'

function expandPatternsToBeams(patterns: CatalogOptimizationResult['patterns']): PackedBeam[] {
  const beams: PackedBeam[] = []
  for (const p of patterns) {
    const q = Math.max(0, Math.floor(p.quantity))
    for (let i = 0; i < q; i++) beams.push(p.beam)
  }
  return beams
}

function wastePercentForBeams(beams: PackedBeam[]): number {
  const totalStockMm = beams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = beams.reduce((s, b) => s + b.wasteMm, 0)
  return totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0
}

function totalPurchaseLengthCmFromBeams(beams: PackedBeam[]): number {
  return beams.reduce((s, b) => s + b.lengthMm, 0) / 10
}

/**
 * מיזוג תוצאות סולבר לפי סוג עץ (פרופיל) — אחרי חישוב מקבילי לכל קבוצה.
 */
export function mergeCatalogOptimizationResults(
  perWoodType: Array<{ woodTypeKey: string; result: CatalogOptimizationResult }>,
): CatalogOptimizationResult {
  if (perWoodType.length === 0) {
    return {
      patterns: [],
      errors: [],
      beamsUsed: 0,
      wastePercent: 0,
      mode: 'store-catalog',
      shoppingList: [],
      solverKind: 'exact-dp',
      solveTimeMs: 0,
      solveTimeSeconds: 0,
    }
  }

  /** קבוצה אחת — מוחזרת כמו שהסולבר החזיר, בלי שינוי (תאימות מלאה לפרויקט חד-פרופיל). */
  if (perWoodType.length === 1) {
    return perWoodType[0]!.result
  }

  const allBeams: PackedBeam[] = []
  const errors: string[] = []
  const solverNotes: string[] = []
  const woodTypeBreakdown: WoodTypeOptimizationSummary[] = []
  let totalSolveTimeMs = 0

  for (const { woodTypeKey, result } of perWoodType) {
    const beams = expandPatternsToBeams(result.patterns)
    allBeams.push(...beams)
    totalSolveTimeMs += result.solveTimeMs ?? 0

    for (const err of result.errors) {
      errors.push(err.includes(woodTypeKey) ? err : `[${woodTypeKey}] ${err}`)
    }
    if (result.solverNote?.trim()) {
      solverNotes.push(`${woodTypeKey}: ${result.solverNote.trim()}`)
    }

    woodTypeBreakdown.push({
      woodTypeKey,
      solverKind: 'exact-dp',
      solverNote: result.solverNote,
      beamsUsed: result.beamsUsed,
      wastePercent: wastePercentForBeams(beams),
      totalPurchaseLengthCm: totalPurchaseLengthCmFromBeams(beams),
    })
  }

  woodTypeBreakdown.sort((a, b) => a.woodTypeKey.localeCompare(b.woodTypeKey, 'he'))

  const patterns = groupIdenticalCuttingBeams(allBeams).map((g) => ({
    beam: g.beam,
    quantity: g.count,
  }))

  const shoppingList = aggregateShoppingList(allBeams)
  const totalStockMm = allBeams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = allBeams.reduce((s, b) => s + b.wasteMm, 0)
  const wastePercent = totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0
  const solveTimeSeconds = Math.round((totalSolveTimeMs / 1000) * 100) / 100

  return {
    patterns,
    errors,
    beamsUsed: allBeams.length,
    wastePercent,
    mode: 'store-catalog',
    shoppingList,
    solverKind: 'exact-dp',
    solveTimeMs: totalSolveTimeMs,
    solveTimeSeconds,
    solverNote: solverNotes.length ? solverNotes.join('\n') : undefined,
    woodTypeBreakdown,
  }
}

export function groupPartsByWoodType(parts: PartInput[]): Map<string, PartInput[]> {
  const m = new Map<string, PartInput[]>()
  for (const p of parts) {
    const key = p.material.trim()
    if (!key) continue
    let arr = m.get(key)
    if (!arr) {
      arr = []
      m.set(key, arr)
    }
    arr.push(p)
  }
  return m
}
