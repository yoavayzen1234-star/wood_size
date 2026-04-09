/** אורך בס״מ → מטרים כמחרוזת עם שתי ספרות אחרי הנקודה (מספר בלבד) */
export function metersBareFromCm(lengthCm: number): string {
  return (lengthCm / 100).toFixed(2)
}

/** תווית «X.XX מ׳» — כשצריך יחידה גלויה בטקסט */
export function formatMetersFromCm(lengthCm: number): string {
  return `${metersBareFromCm(lengthCm)} מ׳`
}

/** אורך במ״מ → ס״מ לתצוגה עם שתי ספרות */
export function cmFromMmFixed2(lengthMm: number): string {
  return (lengthMm / 10).toFixed(2)
}

/** ערכים במ״מ */
export function mmFixed2(mm: number): string {
  return mm.toFixed(2)
}

export function percentFixed2(p: number): string {
  return p.toFixed(2)
}

/** Local calendar date as YYYY-MM-DD — stable LTR string, not affected by locale/RTL formatting */
export function formatLocalDateIso(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
