/** Structural mirror of `ProjectEditorPayload` — avoids import cycles. */
export type EditorRowShape = {
  id: string
  heightCm: string
  widthCm: string
  lengthCm: string
  quantity: string
  name: string
}

export type EditorPayloadShape = {
  kerfMm: number
  rows: EditorRowShape[]
  storeStockLengthsCm: number[]
  storeStockLengthsByMaterial: Record<string, number[]>
}

export type ProjectEditorDiff = {
  any: boolean
  kerf: boolean
  parts: boolean
  stockDefaults: boolean
  stockMaterials: boolean
}

function rowsEqual(a: EditorRowShape[], b: EditorRowShape[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!
    const y = b[i]!
    if (
      x.id !== y.id ||
      x.heightCm !== y.heightCm ||
      x.widthCm !== y.widthCm ||
      x.lengthCm !== y.lengthCm ||
      x.quantity !== y.quantity ||
      x.name !== y.name
    ) {
      return false
    }
  }
  return true
}

function numArraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function materialMapsEqual(
  a: Record<string, number[]>,
  b: Record<string, number[]>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (!numArraysEqual(a[k] ?? [], b[k] ?? [])) return false
  }
  return true
}

export function computeProjectEditorDiff(
  prev: EditorPayloadShape | null | undefined,
  next: EditorPayloadShape,
): ProjectEditorDiff {
  if (!prev) {
    return {
      any: true,
      kerf: true,
      parts: true,
      stockDefaults: true,
      stockMaterials: true,
    }
  }
  const kerf = prev.kerfMm !== next.kerfMm
  const parts = !rowsEqual(prev.rows, next.rows)
  const stockDefaults = !numArraysEqual(prev.storeStockLengthsCm, next.storeStockLengthsCm)
  const stockMaterials = !materialMapsEqual(
    prev.storeStockLengthsByMaterial,
    next.storeStockLengthsByMaterial,
  )
  const any = kerf || parts || stockDefaults || stockMaterials
  return { any, kerf, parts, stockDefaults, stockMaterials }
}
