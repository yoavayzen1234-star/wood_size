import { randomId } from './randomId'
import {
  normalizeStoreStockLengthsCm,
  type PartInput,
  type PartSplitStrategy,
} from './cuttingOptimizer'

export type DraftRow = {
  id: string
  heightCm: string
  widthCm: string
  lengthCm: string
  quantity: string
  name: string
  /** פיצול חלק ארוך מקטלוג; חסר = max-first */
  splitStrategy?: PartSplitStrategy
}

export const newDraftRowId = () => randomId()

export const emptyDraftRow = (): DraftRow => ({
  id: newDraftRowId(),
  heightCm: '',
  widthCm: '',
  lengthCm: '',
  quantity: '',
  name: '',
})

export function rowHasAnyInput(r: DraftRow): boolean {
  return (
    r.heightCm.trim() !== '' ||
    r.widthCm.trim() !== '' ||
    r.lengthCm.trim() !== '' ||
    r.quantity.trim() !== '' ||
    r.name.trim() !== ''
  )
}

export function normalizePartRows(rows: DraftRow[]): DraftRow[] {
  if (rows.length === 0) return [emptyDraftRow()]
  const out = [...rows]
  while (out.length > 1 && !rowHasAnyInput(out[out.length - 1]!)) {
    out.pop()
  }
  if (rowHasAnyInput(out[out.length - 1]!)) {
    out.push(emptyDraftRow())
  }
  return out
}

export function parseDraftPositiveCm(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function parseDraftQuantity(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Math.floor(Number(t))
  if (!Number.isFinite(n) || n < 1) return null
  return n
}

/** סוג עץ יציב: רוחב×גובה (ס״מ) — מתאים ל־material בחלקים ובקורות. */
export function woodTypeKey(widthCm: number, heightCm: number): string {
  return `${widthCm}x${heightCm}`
}

/** @deprecated מפתח ישן גובה×רוחב — תאימות לפרויקטים/מפתחות שמורים ב-DB */
export function profileMaterialKey(h: number, w: number) {
  return `${h}x${w}`
}

/** מפתח legacy (גובה×רוחב) מתוך מפתח רוחב×גובה */
export function legacyKeyFromWoodTypeKey(woodKey: string): string | null {
  const m = /^([0-9.]+)x([0-9.]+)$/.exec(woodKey.trim())
  if (!m) return null
  const width = Number(m[1])
  const height = Number(m[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return profileMaterialKey(height, width)
}

/** אורך קורה מקסימלי בקטלוג לפרופיל (ס״מ). */
export function maxStoreCatalogCmForPartRow(
  widthCm: number,
  heightCm: number,
  storeStockLengthsByMaterial: Readonly<Record<string, readonly number[]>>,
  defaultStockLengthsCm: readonly number[],
): number {
  const key = woodTypeKey(widthCm, heightCm)
  const legacy = legacyKeyFromWoodTypeKey(key)
  const raw =
    storeStockLengthsByMaterial[key] ??
    (legacy != null ? storeStockLengthsByMaterial[legacy] : undefined) ??
    defaultStockLengthsCm
  const L = normalizeStoreStockLengthsCm([...raw])
  return L[L.length - 1]!
}

export function rowsToParts(rows: DraftRow[]): PartInput[] {
  const parts: PartInput[] = []
  for (const r of rows) {
    const heightCm = parseDraftPositiveCm(r.heightCm)
    const widthCm = parseDraftPositiveCm(r.widthCm)
    const lengthCm = parseDraftPositiveCm(r.lengthCm)
    const quantity = parseDraftQuantity(r.quantity)
    if (heightCm == null || widthCm == null || lengthCm == null || quantity == null) continue
    const name = (r.name || 'ללא שם').trim() || 'ללא שם'
    const part: PartInput = {
      lengthCm,
      quantity,
      label: name,
      material: woodTypeKey(widthCm, heightCm),
    }
    if (r.splitStrategy === 'symmetric') part.splitStrategy = 'symmetric'
    parts.push(part)
  }
  return parts
}
