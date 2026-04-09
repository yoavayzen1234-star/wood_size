/** שדות בשורת טבלת החלקים — כולל כפתור מחיקה */
export type PartField = 'h' | 'w' | 'l' | 'q' | 'n' | 'd'

/**
 * סדר שדות **קלט בלבד** לניווט חיצים (גיליון): ממשמאל לימין במסך (טבלה dir=rtl).
 * ArrowRight → האינדקס הבא; ArrowLeft → הקודם; עטיפה לשורה הבאה/קודמת.
 * שם → כמות → אורך → גובה → רוחב — בלי עמודת המחיקה.
 */
export const PART_DATA_FIELD_ORDER: PartField[] = ['n', 'q', 'l', 'h', 'w']

/** אחרי השדה האחרון בשורה — מעבר לשורה הבאה מתחיל בגובה (ימין בטבלה RTL). */
export const PART_NEXT_ROW_START_FIELD: PartField = 'h'

/** יש שני עותקים של אותו שדה (מובייל + דסקטופ); רק אחד גלוי — לא ממקדים אלמנט עם display:none. */
function isPartFieldVisible(el: HTMLElement): boolean {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  }
  let n: HTMLElement | null = el
  while (n) {
    const s = window.getComputedStyle(n)
    if (s.display === 'none' || s.visibility === 'hidden' || Number.parseFloat(s.opacity) === 0) {
      return false
    }
    n = n.parentElement
  }
  return true
}

export function focusPartField(rowId: string, field: PartField): void {
  /** rowId מזהה פנימי (UUID וכו׳) — ללא מרכאות בתוך הערך */
  const nodes = document.querySelectorAll<HTMLElement>(`[data-part-field="${rowId}:${field}"]`)
  for (const el of nodes) {
    if (!isPartFieldVisible(el)) continue
    try {
      el.focus()
    } catch {
      /* ignore */
    }
    return
  }
}

export function focusById(id: string): void {
  document.getElementById(id)?.focus()
}
