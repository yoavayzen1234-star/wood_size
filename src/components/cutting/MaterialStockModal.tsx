import { memo, type KeyboardEvent, type MutableRefObject } from 'react'
import { Trash2 } from 'lucide-react'
import { LtrNum } from '../../LtrNum'

export const MaterialStockModal = memo(function MaterialStockModal({
  editingMaterialKey,
  materialStockDraft,
  materialStockInputRefs,
  onClose,
  onSave,
  onResetToDefault,
  updateMaterialDraftAt,
  removeMaterialDraftAt,
  addMaterialDraft,
  handleMaterialDraftKeyDown,
}: {
  editingMaterialKey: string | null
  materialStockDraft: number[]
  materialStockInputRefs: MutableRefObject<Array<HTMLInputElement | null>>
  onClose: () => void
  onSave: () => void
  onResetToDefault: () => void
  updateMaterialDraftAt: (index: number, nextCmRaw: string) => void
  removeMaterialDraftAt: (index: number) => void
  addMaterialDraft: () => void
  handleMaterialDraftKeyDown: (e: KeyboardEvent<HTMLInputElement>, index: number) => void
}) {
  if (!editingMaterialKey) return null

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-stone-900/30 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="עריכת אורכי חנות לפרופיל"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-stone-900">
              אורכי קורות בחנות לפרופיל{' '}
              <LtrNum ariaLabel={`פרופיל ${editingMaterialKey.replace('x', '×')}`}>
                {editingMaterialKey.replace('x', '×')}
              </LtrNum>{' '}
              (ס״מ)
            </h3>
            <p className="mt-1 text-xs text-stone-600">
              אם לא תגדיר כאן — החישוב ישתמש בברירת המחדל הגלובלית.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
            aria-label="סגור"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {materialStockDraft.map((cm, i) => (
            <div
              key={i}
              className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1"
              dir="ltr"
            >
              <input
                type="number"
                min={1}
                step={1}
                value={cm}
                onChange={(e) => updateMaterialDraftAt(i, e.target.value)}
                onKeyDown={(e) => handleMaterialDraftKeyDown(e, i)}
                onFocus={(e) => {
                  try {
                    e.currentTarget.select()
                  } catch {
                    /* ignore */
                  }
                }}
                ref={(el) => {
                  materialStockInputRefs.current[i] = el
                }}
                className="w-16 rounded border border-stone-300 bg-white px-1 py-0.5 text-center text-xs tabular-nums shadow-sm focus:border-stone-600 focus:outline-none focus:ring-1 focus:ring-stone-400/50"
                aria-label={`אורך קורה בחנות בסנטימטרים, שורה ${i + 1}`}
              />
              <span className="text-[10px] text-stone-500">ס״מ</span>
              <button
                type="button"
                onClick={() => removeMaterialDraftAt(i)}
                className="ms-1 p-0.5 text-stone-400 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
                aria-label="הסר אורך"
                title="הסר"
                disabled={materialStockDraft.length <= 1}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addMaterialDraft}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
            >
              הוסף אורך
            </button>
            <button
              type="button"
              onClick={onResetToDefault}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
              title="מוחק התאמה לפרופיל וחוזר לברירת המחדל"
            >
              חזרה לברירת מחדל
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onSave}
              className="rounded-lg border border-stone-800 bg-stone-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
            >
              שמור
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
