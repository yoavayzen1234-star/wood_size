import type { PackedBeam } from './cuttingOptimizer'

/** מפתח לזיהוי קורות זהות לחלוטין (קורה, אורך קורה, סדר חיתוכים ושארית) */
export function beamCuttingPlanKey(beam: PackedBeam): string {
  return JSON.stringify({
    material: beam.material.trim(),
    lengthMm: beam.lengthMm,
    wasteMm: beam.wasteMm,
    segments: beam.segments,
  })
}

/** קיבוץ קורות זהות — נשארת תצוגה אחת עם מונה */
export function groupIdenticalCuttingBeams(beams: PackedBeam[]): { beam: PackedBeam; count: number }[] {
  const out: { beam: PackedBeam; count: number }[] = []
  const keyToIndex = new Map<string, number>()
  for (const b of beams) {
    const key = beamCuttingPlanKey(b)
    const i = keyToIndex.get(key)
    if (i === undefined) {
      keyToIndex.set(key, out.length)
      out.push({ beam: b, count: 1 })
    } else {
      out[i]!.count += 1
    }
  }
  return out
}

