import { randomId } from './randomId'
import type { PartInput } from './cuttingOptimizer'

export type DraftRow = {
  id: string
  heightCm: string
  widthCm: string
  lengthCm: string
  quantity: string
  name: string
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

export function profileMaterialKey(h: number, w: number) {
  return `${h}x${w}`
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
    parts.push({
      lengthCm,
      quantity,
      label: name,
      material: profileMaterialKey(heightCm, widthCm),
    })
  }
  return parts
}
