/**
 * לוגיקה טהורה ל־pattern generation ול־dominance — משותפת ל-main ול־Web Workers (ללא תלות ב־React/RandomId).
 */

export type PartTypeLite = {
  label: string
  lengthMm: number
  demand: number
}

export type PatternLite = {
  counts: number[]
  usedMm: number
  stockLengthMm: number
}

export function measureUsedMm(
  counts: number[],
  types: PartTypeLite[],
  kerfMm: number,
): number {
  let sumL = 0
  let n = 0
  for (let i = 0; i < types.length; i++) {
    const c = counts[i] ?? 0
    sumL += c * types[i]!.lengthMm
    n += c
  }
  if (n === 0) return 0
  return sumL + (n - 1) * kerfMm
}

export function minStockMmForUsed(
  storeStockLengthsCm: readonly number[],
  usedMm: number,
): number | null {
  const cm = storeStockLengthsCm.find((l) => l * 10 + 1e-9 >= usedMm)
  return cm != null ? cm * 10 : null
}

export function patternCutsFromCounts(counts: number[]): number {
  let n = 0
  for (const c of counts) n += c
  return n <= 1 ? 0 : n - 1
}

export function patternWasteMm(pat: PatternLite): number {
  return Math.max(0, pat.stockLengthMm - pat.usedMm)
}

export function patternDominates(B: PatternLite, A: PatternLite, m: number): boolean {
  for (let i = 0; i < m; i++) {
    if ((B.counts[i] ?? 0) < (A.counts[i] ?? 0)) return false
  }
  const wB = patternWasteMm(B)
  const wA = patternWasteMm(A)
  const cB = patternCutsFromCounts(B.counts)
  const cA = patternCutsFromCounts(A.counts)
  const sB = B.stockLengthMm
  const sA = A.stockLengthMm
  if (wB > wA + 1e-6) return false
  if (cB > cA + 1e-6) return false
  if (sB > sA + 1e-6) return false
  return wB < wA - 1e-6 || cB < cA - 1e-6 || sB < sA - 1e-6
}

/** כמה יחידות מקסימום של סוג 0 נכנסות לקורה אחת */
export function maxCountFirstType(types: PartTypeLite[], kerfMm: number, maxStockMm: number): number {
  if (types.length === 0) return 0
  let maxK = 0
  let u = 0
  let t = 0
  for (;;) {
    const nu = u + types[0]!.lengthMm + (t > 0 ? kerfMm : 0)
    if (nu > maxStockMm + 1e-6) break
    maxK++
    u = nu
    t = maxK
  }
  return maxK
}

function recordPattern(
  counts: number[],
  types: PartTypeLite[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
  seen: Set<string>,
  patterns: PatternLite[],
) {
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
}

/**
 * DFS על סוגים 1..m-1 עם קידומת קבועה לסוג 0 (מספר עותקים).
 */
export function generatePatternsFromFirstTypeBranch(
  types: PartTypeLite[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
  firstTypeCount: number,
): PatternLite[] {
  const m = types.length
  if (m === 0) return []

  const c = new Array(m).fill(0)
  c[0] = firstTypeCount
  let used0 = 0
  let parts0 = 0
  if (firstTypeCount > 0) {
    used0 = firstTypeCount * types[0]!.lengthMm + (firstTypeCount - 1) * kerfMm
    parts0 = firstTypeCount
  }

  const seen = new Set<string>()
  const patterns: PatternLite[] = []

  function dfs(i: number, used: number, partsBeforeI: number) {
    if (i === m) {
      if (partsBeforeI > 0 && used <= maxStockMm + 1e-6) {
        recordPattern([...c], types, kerfMm, maxStockMm, storeStockLengthsCm, seen, patterns)
      }
      return
    }

    c[i] = 0
    dfs(i + 1, used, partsBeforeI)

    let u = used
    let t = partsBeforeI
    for (;;) {
      const nu = u + types[i]!.lengthMm + (t > 0 ? kerfMm : 0)
      if (nu > maxStockMm + 1e-6) break
      c[i]++
      u = nu
      t = partsBeforeI + c[i]!
      dfs(i + 1, u, t)
    }
    c[i] = 0
  }

  dfs(1, used0, parts0)
  return patterns
}

/** יצירת תבניות — שקול לאיחוד ענפי firstTypeCount = 0..max (זהה ל־DFS מלא מ־i=0). */
export function generatePatternsSerial(
  types: PartTypeLite[],
  kerfMm: number,
  maxStockMm: number,
  storeStockLengthsCm: readonly number[],
): PatternLite[] {
  const m = types.length
  if (m === 0) return []
  const maxK = maxCountFirstType(types, kerfMm, maxStockMm)
  const branches: PatternLite[][] = []
  for (let k = 0; k <= maxK; k++) {
    branches.push(
      generatePatternsFromFirstTypeBranch(types, kerfMm, maxStockMm, storeStockLengthsCm, k),
    )
  }
  return mergePatternsDedupe(branches)
}

export function mergePatternsDedupe(branches: PatternLite[][]): PatternLite[] {
  const seen = new Set<string>()
  const out: PatternLite[] = []
  for (const arr of branches) {
    for (const p of arr) {
      const key = p.counts.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(p)
    }
  }
  return out
}

/** האם קיים j≠i כך ש־patterns[j] משתלט על patterns[i] */
export function isPatternDominatedByAny(
  patterns: PatternLite[],
  m: number,
  i: number,
): boolean {
  const A = patterns[i]!
  for (let j = 0; j < patterns.length; j++) {
    if (j === i) continue
    if (patternDominates(patterns[j]!, A, m)) return true
  }
  return false
}

/**
 * סיבוב אחד: מוצא את האינדקס המינימלי i שנשלט (כמו הלולאה המקורית).
 * מחזיר -1 אם אין כזה.
 */
export function findMinimumDominatedIndex(patterns: PatternLite[], m: number): number {
  for (let i = 0; i < patterns.length; i++) {
    if (isPatternDominatedByAny(patterns, m, i)) return i
  }
  return -1
}
