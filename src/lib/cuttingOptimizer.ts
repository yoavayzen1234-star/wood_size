import { metersBareFromCm } from '../numericFormat'
import { randomId } from './randomId'
import { groupIdenticalCuttingBeams } from './beamGrouping'

export type StockInput = {
  lengthCm: number
  quantity: number
  material: string
}

export type PartInput = {
  lengthCm: number
  quantity: number
  label: string
  material: string
}

export type BeamSegment =
  | { kind: 'part'; label: string; lengthMm: number }
  | { kind: 'kerf'; lengthMm: number }

export type PackedBeam = {
  id: string
  material: string
  lengthMm: number
  segments: BeamSegment[]
  usedMm: number
  wasteMm: number
  stockRowIndex: number
  isAdditionalPurchase: boolean
}

export type UniqueCuttingPattern = {
  beam: PackedBeam
  quantity: number
}

export type OptimizationResult = {
  patterns: UniqueCuttingPattern[]
  errors: string[]
  beamsUsed: number
  wastePercent: number
}

/** ברירת מחדל לאורכי קורות זמינים בחנות (בס״מ). */
export const DEFAULT_STORE_STOCK_LENGTHS_CM: readonly number[] = [300, 360, 420, 480, 540, 600]

export function normalizeStoreStockLengthsCm(raw: readonly number[]): number[] {
  const cleaned = raw
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x) && x > 0)
    .map((x) => Math.round(x))
  const uniq = [...new Set(cleaned)].sort((a, b) => a - b)
  return uniq.length ? uniq : [...DEFAULT_STORE_STOCK_LENGTHS_CM]
}

export type ShoppingLine = {
  lengthCm: number
  count: number
}

export type ShoppingGroup = {
  material: string
  lines: ShoppingLine[]
}

export type CatalogOptimizationResult = OptimizationResult & {
  mode: 'store-catalog'
  shoppingList: ShoppingGroup[]
  /** מציין אם נעשה שימוש בפותר מדויק (DP) או בגירוסטיקה */
  solverKind?: 'exact-dp' | 'heuristic-best-fit'
  /** הערה למשתמש (למשל נפילה ל־heuristic בגלל גודל) */
  solverNote?: string
}

const cmToMm = (cm: number) => cm * 10

const normalizeMaterial = (s: string) => s.trim()

function usedLengthMm(partCount: number, sumPartsMm: number, kerfMm: number): number {
  if (partCount === 0) return 0
  return sumPartsMm + (partCount - 1) * kerfMm
}

function canPlace(
  bin: { capacityMm: number; parts: { label: string; lengthMm: number }[] },
  partMm: number,
  kerfMm: number,
): boolean {
  const n = bin.parts.length
  const sum = bin.parts.reduce((a, p) => a + p.lengthMm, 0)
  const next = usedLengthMm(n, sum, kerfMm) + (n > 0 ? kerfMm : 0) + partMm
  return next <= bin.capacityMm + 1e-6
}

function slackAfterPlaceIfFits(
  bin: { capacityMm: number; parts: { label: string; lengthMm: number }[] },
  partMm: number,
  kerfMm: number,
): number | null {
  if (!canPlace(bin, partMm, kerfMm)) return null
  const n = bin.parts.length
  const sum = bin.parts.reduce((a, p) => a + p.lengthMm, 0)
  const used = usedLengthMm(n, sum, kerfMm) + (n > 0 ? kerfMm : 0) + partMm
  return bin.capacityMm - used
}

function smallestStoreLengthCm(storeStockLengthsCm: readonly number[], partLenCm: number): number | null {
  const L = storeStockLengthsCm.find((l) => l + 1e-9 >= partLenCm)
  return L ?? null
}

function maxStoreLengthCm(storeStockLengthsCm: readonly number[]): number {
  return storeStockLengthsCm[storeStockLengthsCm.length - 1]!
}

export function aggregateShoppingList(beams: PackedBeam[]): ShoppingGroup[] {
  const tally = new Map<string, Map<number, number>>()
  for (const b of beams) {
    const lenCm = Math.round(b.lengthMm / 10)
    let inner = tally.get(b.material)
    if (!inner) {
      inner = new Map()
      tally.set(b.material, inner)
    }
    inner.set(lenCm, (inner.get(lenCm) ?? 0) + 1)
  }
  const groups: ShoppingGroup[] = []
  for (const [material, m] of tally) {
    const lines: ShoppingLine[] = [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lengthCm, count]) => ({ lengthCm, count }))
    groups.push({ material, lines })
  }
  groups.sort((a, b) => a.material.localeCompare(b.material, 'he'))
  return groups
}

export function aggregateShoppingListFromPatterns(patterns: UniqueCuttingPattern[]): ShoppingGroup[] {
  const expanded: PackedBeam[] = []
  for (const p of patterns) {
    const q = Math.max(0, Math.floor(p.quantity))
    for (let i = 0; i < q; i++) expanded.push(p.beam)
  }
  return aggregateShoppingList(expanded)
}

type WipBin = {
  id: string
  capacityMm: number
  material: string
  parts: { label: string; lengthMm: number }[]
  stockRowIndex: number
  isAdditionalPurchase: boolean
}

function expandParts(rows: PartInput[]): { label: string; lengthMm: number; material: string }[] {
  const out: { label: string; lengthMm: number; material: string }[] = []
  for (const r of rows) {
    const m = normalizeMaterial(r.material)
    if (!m || r.quantity <= 0) continue
    const len = cmToMm(r.lengthCm)
    if (len <= 0) continue
    const base = (r.label || 'ללא שם').trim() || 'ללא שם'
    for (let i = 0; i < r.quantity; i++) {
      out.push({ label: base, lengthMm: len, material: m })
    }
  }
  return out
}

function buildInitialBins(stockRows: StockInput[]): Map<string, WipBin[]> {
  const byMaterial = new Map<string, WipBin[]>()
  stockRows.forEach((row, stockRowIndex) => {
    const m = normalizeMaterial(row.material)
    if (!m || cmToMm(row.lengthCm) <= 0) return
    let list = byMaterial.get(m)
    if (!list) {
      list = []
      byMaterial.set(m, list)
    }
    const cap = cmToMm(row.lengthCm)
    const q = Math.max(0, Math.floor(row.quantity))
    for (let i = 0; i < q; i++) {
      list.push({
        id: randomId(),
        capacityMm: cap,
        material: m,
        parts: [],
        stockRowIndex,
        isAdditionalPurchase: false,
      })
    }
  })
  return byMaterial
}

function maxStockLengthMmForMaterial(stockRows: StockInput[], material: string): number {
  let max = 0
  for (const r of stockRows) {
    if (normalizeMaterial(r.material) !== material) continue
    max = Math.max(max, cmToMm(r.lengthCm))
  }
  return max
}

function firstStockRowIndexForLength(
  stockRows: StockInput[],
  material: string,
  lengthMm: number,
): number {
  for (let i = 0; i < stockRows.length; i++) {
    const r = stockRows[i]
    if (normalizeMaterial(r.material) !== material) continue
    if (Math.abs(cmToMm(r.lengthCm) - lengthMm) < 1e-6) return i
  }
  return -1
}

function wipToPacked(b: WipBin, kerfMm: number): PackedBeam | null {
  if (b.parts.length === 0) return null
  const segments: BeamSegment[] = []
  for (let i = 0; i < b.parts.length; i++) {
    if (i > 0) segments.push({ kind: 'kerf', lengthMm: kerfMm })
    const p = b.parts[i]
    segments.push({ kind: 'part', label: p.label, lengthMm: p.lengthMm })
  }
  const sumParts = b.parts.reduce((a, p) => a + p.lengthMm, 0)
  const used = usedLengthMm(b.parts.length, sumParts, kerfMm)
  return {
    id: b.id,
    material: b.material,
    lengthMm: b.capacityMm,
    segments,
    usedMm: used,
    wasteMm: Math.max(0, b.capacityMm - used),
    stockRowIndex: b.stockRowIndex,
    isAdditionalPurchase: b.isAdditionalPurchase,
  }
}

function groupPartsByMaterial(
  rows: PartInput[],
): Map<string, { label: string; lengthMm: number }[]> {
  const expanded = expandParts(rows)
  const by = new Map<string, { label: string; lengthMm: number }[]>()
  for (const p of expanded) {
    let list = by.get(p.material)
    if (!list) {
      list = []
      by.set(p.material, list)
    }
    list.push({ label: p.label, lengthMm: p.lengthMm })
  }
  for (const [, list] of by) {
    list.sort((a, b) => b.lengthMm - a.lengthMm)
  }
  return by
}

export function optimizeCutting(
  stockRows: StockInput[],
  partRows: PartInput[],
  kerfMm: number,
): OptimizationResult {
  const k = Math.max(0, kerfMm)
  const errors: string[] = []

  const byMatParts = groupPartsByMaterial(partRows)
  if (byMatParts.size === 0) {
    return { patterns: [], errors: [], beamsUsed: 0, wastePercent: 0 }
  }

  for (const [material, pieces] of byMatParts) {
    const maxLen = maxStockLengthMmForMaterial(stockRows, material)
    if (maxLen <= 0) {
      errors.push(`אין הגדרת מלאי עבור סוג החומר "${material}".`)
      continue
    }
    const oversized = pieces.filter((p) => p.lengthMm > maxLen + 1e-6)
    if (oversized.length > 0) {
      errors.push(
        `חלקים ארוכים מדי לקורה המקסימלית באורך ${metersBareFromCm(maxLen / 10)} מטר בחומר "${material}".`,
      )
    }
  }

  if (errors.length > 0) {
    return { patterns: [], errors: [...new Set(errors)], beamsUsed: 0, wastePercent: 0 }
  }

  const initialPools = buildInitialBins(stockRows)
  const allBeams: PackedBeam[] = []

  for (const [material, pieces] of byMatParts) {
    const maxLen = maxStockLengthMmForMaterial(stockRows, material)
    const bins: WipBin[] = [...(initialPools.get(material) ?? [])]
    bins.sort((a, b) => b.capacityMm - a.capacityMm || a.id.localeCompare(b.id))

    for (const piece of pieces) {
      let placed = false
      for (const bin of bins) {
        if (canPlace(bin, piece.lengthMm, k)) {
          bin.parts.push({ label: piece.label, lengthMm: piece.lengthMm })
          placed = true
          break
        }
      }
      if (!placed) {
        const idx = firstStockRowIndexForLength(stockRows, material, maxLen)
        bins.push({
          id: randomId(),
          capacityMm: maxLen,
          material,
          parts: [{ label: piece.label, lengthMm: piece.lengthMm }],
          stockRowIndex: idx,
          isAdditionalPurchase: true,
        })
      }
    }

    for (const b of bins) {
      const pack = wipToPacked(b, k)
      if (pack) allBeams.push(pack)
    }
  }

  allBeams.sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material, 'he')
    return a.id.localeCompare(b.id)
  })

  const totalStockMm = allBeams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = allBeams.reduce((s, b) => s + b.wasteMm, 0)
  const wastePercent = totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0

  const patterns = groupIdenticalCuttingBeams(allBeams).map((g) => ({ beam: g.beam, quantity: g.count }))
  return {
    patterns,
    errors: [],
    beamsUsed: allBeams.length,
    wastePercent,
  }
}

/**
 * אריזה לפי מלאי החנות בלבד: אורכים 3–6 מ׳ בקפיצות 60 ס״מ.
 * Best Fit: בוחרים את הקורה עם השארית המצומצמת ביותר אחרי ההנחה; בשוויון — קורה **קצרה** יותר (התאמה הדוקה).
 * קורה חדשה = האורך הקטן ביותר מהקטלוג שעדיין מכיל את החלק.
 */
export function optimizeWithStoreCatalog(
  partRows: PartInput[],
  kerfMm: number,
  storeStockLengthsCm: readonly number[] = DEFAULT_STORE_STOCK_LENGTHS_CM,
): CatalogOptimizationResult {
  const k = Math.max(0, kerfMm)
  const storeLengths = normalizeStoreStockLengthsCm(storeStockLengthsCm)
  const errors: string[] = []
  const maxCm = maxStoreLengthCm(storeLengths)
  const maxMm = cmToMm(maxCm)

  const byMatParts = groupPartsByMaterial(partRows)
  if (byMatParts.size === 0) {
    return {
      patterns: [],
      errors: [],
      beamsUsed: 0,
      wastePercent: 0,
      mode: 'store-catalog',
      shoppingList: [],
    }
  }

  for (const [material, pieces] of byMatParts) {
    const oversized = pieces.filter((p) => p.lengthMm > maxMm + 1e-6)
    if (oversized.length > 0) {
      errors.push(
        `חלקים ארוכים מדי — מקס׳ קורה מהחנות ${metersBareFromCm(maxMm / 10)} מטר — בחומר "${material}".`,
      )
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

  const allBeams: PackedBeam[] = []

  for (const [material, pieces] of byMatParts) {
    const bins: WipBin[] = []

    for (const piece of pieces) {
      let bestBin: WipBin | null = null
      let bestSlack = Infinity
      let bestCapacity = Infinity
      for (const bin of bins) {
        const slack = slackAfterPlaceIfFits(bin, piece.lengthMm, k)
        if (slack === null) continue
        if (slack < bestSlack - 1e-9) {
          bestSlack = slack
          bestCapacity = bin.capacityMm
          bestBin = bin
        } else if (Math.abs(slack - bestSlack) < 1e-9 && bin.capacityMm < bestCapacity - 1e-9) {
          bestCapacity = bin.capacityMm
          bestBin = bin
        }
      }

      if (bestBin) {
        bestBin.parts.push({ label: piece.label, lengthMm: piece.lengthMm })
      } else {
        const lenCm = piece.lengthMm / 10
        const stockCm = smallestStoreLengthCm(storeLengths, lenCm)
        if (stockCm === null) {
          errors.push(`לא נמצאה קורה מתאימה לחלק באורך ${metersBareFromCm(lenCm)} מטר בחומר "${material}".`)
          return {
            patterns: [],
            errors: [...new Set(errors)],
            beamsUsed: 0,
            wastePercent: 0,
            mode: 'store-catalog',
            shoppingList: [],
          }
        }
        bins.push({
          id: randomId(),
          capacityMm: cmToMm(stockCm),
          material,
          parts: [{ label: piece.label, lengthMm: piece.lengthMm }],
          stockRowIndex: -1,
          isAdditionalPurchase: true,
        })
      }
    }

    for (const b of bins) {
      const pack = wipToPacked(b, k)
      if (pack) allBeams.push(pack)
    }
  }

  allBeams.sort((a, b) => {
    if (a.material !== b.material) return a.material.localeCompare(b.material, 'he')
    return a.lengthMm !== b.lengthMm
      ? b.lengthMm - a.lengthMm
      : a.id.localeCompare(b.id)
  })

  const totalStockMm = allBeams.reduce((s, b) => s + b.lengthMm, 0)
  const totalWasteMm = allBeams.reduce((s, b) => s + b.wasteMm, 0)
  const wastePercent = totalStockMm > 0 ? (100 * totalWasteMm) / totalStockMm : 0
  const patterns = groupIdenticalCuttingBeams(allBeams).map((g) => ({ beam: g.beam, quantity: g.count }))

  return {
    patterns,
    errors: [],
    beamsUsed: allBeams.length,
    wastePercent,
    mode: 'store-catalog',
    shoppingList: aggregateShoppingList(allBeams),
    solverKind: 'heuristic-best-fit',
  }
}
