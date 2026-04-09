import { memo, type FocusEvent, type KeyboardEvent } from 'react'
import { Loader2, Plus, Ruler, ShoppingCart, Trash2 } from 'lucide-react'
import type { DraftRow } from '../../lib/draftRows'
import { parseDraftPositiveCm, profileMaterialKey } from '../../lib/draftRows'
import { focusById, focusPartField, type PartField } from '../../partTableFocus'

export type EditorPanelProps = {
  rows: DraftRow[]
  storeStockLengthsCm: number[]
  storeStockLengthsByMaterial: Record<string, number[]>
  hasValidPartsForCalc: boolean
  calculating: boolean
  onUpdateRow: (rowId: string, patch: Partial<Omit<DraftRow, 'id'>>) => void
  onRemoveRow: (rowId: string) => void
  onAddRow: () => void
  onRunOptimizer: () => void
  onOpenMaterialStockEditor: (materialKey: string) => void
  onPartFieldFocusSelect: (e: FocusEvent<HTMLInputElement>) => void
  onPartFieldEnter: (e: KeyboardEvent<HTMLInputElement>, rowIndex: number, field: PartField) => void
  onPartFieldKeyDown: (e: KeyboardEvent<HTMLElement>, rowId: string, field: PartField) => void
}

export const EditorPanel = memo(function EditorPanel({
  rows,
  storeStockLengthsByMaterial,
  hasValidPartsForCalc,
  calculating,
  onUpdateRow,
  onRemoveRow,
  onAddRow,
  onRunOptimizer,
  onOpenMaterialStockEditor,
  onPartFieldFocusSelect,
  onPartFieldEnter,
  onPartFieldKeyDown,
}: EditorPanelProps) {
  return (
    <>
      <div className="no-print order-1 flex min-h-0 min-w-0 flex-col lg:order-1">
        <div className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-stone-100/80">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-stone-800">
            <Plus className="size-4 text-stone-500" aria-hidden />
            רשימת חלקים
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-stone-700">
            <strong>גובה×רוחב</strong>, <strong>אורך</strong>, <strong>כמות</strong> (ס״מ); <strong>שם</strong>{' '}
            אופציונלי. חצים / Enter לניווט בין שדות. אחרי עריכה — חישוב מחדש; רק שורות מלאות נספרות.
          </p>

          <div className="sm:hidden space-y-3">
            {rows.map((row, rowIndex) => (
              <div key={row.id} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-stone-800">מידת עץ (ס״מ)</p>
                  <button
                    type="button"
                    onClick={() => onRemoveRow(row.id)}
                    disabled={rows.length <= 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-500 shadow-sm hover:bg-stone-50 hover:text-stone-800 disabled:pointer-events-none disabled:opacity-40"
                    aria-label="מחק שורה"
                    title="מחק"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2" dir="ltr">
                  <input
                    type="number"
                    dir="ltr"
                    min={0.1}
                    step={0.1}
                    value={row.heightCm}
                    data-part-field={`${row.id}:h`}
                    onChange={(e) => onUpdateRow(row.id, { heightCm: e.target.value })}
                    onKeyDown={(e) => {
                      onPartFieldKeyDown(e, row.id, 'h')
                      onPartFieldEnter(e, rowIndex, 'h')
                    }}
                    onFocus={onPartFieldFocusSelect}
                    enterKeyHint="next"
                    className="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-3 text-center text-base tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
                    placeholder="גובה"
                    aria-label="גובה קורה בס״מ"
                  />
                  <span className="text-stone-500 select-none" aria-hidden>
                    ×
                  </span>
                  <input
                    type="number"
                    dir="ltr"
                    min={0.1}
                    step={0.1}
                    value={row.widthCm}
                    data-part-field={`${row.id}:w`}
                    onChange={(e) => onUpdateRow(row.id, { widthCm: e.target.value })}
                    onKeyDown={(e) => {
                      onPartFieldKeyDown(e, row.id, 'w')
                      onPartFieldEnter(e, rowIndex, 'w')
                    }}
                    onFocus={onPartFieldFocusSelect}
                    enterKeyHint="next"
                    className="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-3 text-center text-base tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
                    placeholder="רוחב"
                    aria-label="רוחב קורה בס״מ"
                  />
                  {(() => {
                    const h = parseDraftPositiveCm(row.heightCm)
                    const w = parseDraftPositiveCm(row.widthCm)
                    const key = h != null && w != null ? profileMaterialKey(h, w) : null
                    const hasOverride = key ? storeStockLengthsByMaterial[key] != null : false
                    return (
                      <button
                        type="button"
                        onClick={() => key && onOpenMaterialStockEditor(key)}
                        disabled={!key}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:pointer-events-none disabled:opacity-40"
                        title={
                          key
                            ? hasOverride
                              ? 'אורכי חנות לפרופיל (מותאם)'
                              : 'אורכי חנות לפרופיל (ברירת מחדל)'
                            : 'הזינו גובה ורוחב כדי לערוך אורכי חנות לפרופיל'
                        }
                        aria-label="ערוך אורכי חנות לפרופיל"
                      >
                        <Ruler className={`size-4 ${hasOverride ? 'text-stone-900' : ''}`} aria-hidden />
                      </button>
                    )
                  })()}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-xs font-semibold text-stone-800">אורך (ס״מ)</p>
                    <input
                      type="number"
                      dir="ltr"
                      min={0.1}
                      step={0.1}
                      value={row.lengthCm}
                      data-part-field={`${row.id}:l`}
                      onChange={(e) => onUpdateRow(row.id, { lengthCm: e.target.value })}
                      onKeyDown={(e) => {
                        onPartFieldKeyDown(e, row.id, 'l')
                        onPartFieldEnter(e, rowIndex, 'l')
                      }}
                      onFocus={onPartFieldFocusSelect}
                      enterKeyHint="next"
                      className="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-3 text-center text-base tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-stone-800">כמות</p>
                    <input
                      type="number"
                      dir="ltr"
                      min={1}
                      step={1}
                      value={row.quantity}
                      data-part-field={`${row.id}:q`}
                      onChange={(e) => onUpdateRow(row.id, { quantity: e.target.value })}
                      onKeyDown={(e) => {
                        onPartFieldKeyDown(e, row.id, 'q')
                        onPartFieldEnter(e, rowIndex, 'q')
                      }}
                      onFocus={onPartFieldFocusSelect}
                      enterKeyHint="next"
                      className="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-3 text-center text-base tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-xs font-semibold text-stone-800">שם / מטרה</p>
                  <input
                    type="text"
                    value={row.name}
                    data-part-field={`${row.id}:n`}
                    onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
                    onKeyDown={(e) => {
                      onPartFieldKeyDown(e, row.id, 'n')
                      onPartFieldEnter(e, rowIndex, 'n')
                    }}
                    onFocus={onPartFieldFocusSelect}
                    enterKeyHint="done"
                    className="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-3 text-base shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
                    placeholder="אופציונלי"
                    aria-label="שם או מטרה"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg sm:block">
            <table
              className="w-auto max-w-full border-collapse border-2 border-stone-600 text-xs sm:text-sm"
              dir="rtl"
            >
              <thead>
                <tr className="bg-stone-200">
                  <th className="min-w-[10.5rem] border border-stone-600 px-2 py-1.5 text-start text-[11px] font-semibold whitespace-nowrap text-stone-800 sm:min-w-[12rem] sm:px-3 sm:py-2 sm:text-xs">
                    מידת עץ (ס״מ)
                  </th>
                  <th className="border border-stone-600 px-2 py-1.5 text-start text-[11px] font-semibold whitespace-nowrap text-stone-800 sm:px-3 sm:py-2 sm:text-xs">
                    אורך (ס״מ)
                  </th>
                  <th className="border border-stone-600 px-2 py-1.5 text-start text-[11px] font-semibold whitespace-nowrap text-stone-800 sm:px-3 sm:py-2 sm:text-xs">
                    כמות
                  </th>
                  <th className="min-w-[6.5rem] border border-stone-600 px-2 py-1.5 text-start text-[11px] font-semibold text-stone-800 sm:min-w-[7rem] sm:px-3 sm:py-2 sm:text-xs">
                    שם / מטרה
                  </th>
                  <th className="w-10 border border-stone-600 px-1.5 py-1.5 sm:w-11 sm:px-2 sm:py-2" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.id} className="bg-stone-50">
                    <td className="min-w-[10.5rem] border border-stone-600 px-1.5 py-1.5 align-middle whitespace-nowrap sm:min-w-[12rem] sm:px-2 sm:py-2">
                      <div className="flex shrink-0 flex-nowrap items-center gap-1.5 whitespace-nowrap" dir="ltr">
                        <input
                          type="number"
                          dir="ltr"
                          min={0.1}
                          step={0.1}
                          value={row.heightCm}
                          data-part-field={`${row.id}:h`}
                          onChange={(e) => onUpdateRow(row.id, { heightCm: e.target.value })}
                          onKeyDown={(e) => {
                            onPartFieldKeyDown(e, row.id, 'h')
                            onPartFieldEnter(e, rowIndex, 'h')
                          }}
                          onFocus={onPartFieldFocusSelect}
                          className="box-border min-h-8 w-[4.25rem] rounded border border-stone-600 bg-white px-1.5 py-1 text-center text-xs tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60 sm:min-h-9 sm:w-[4.75rem] sm:px-2 sm:py-1.5 sm:text-sm"
                          title="גובה (ס״מ)"
                          aria-label="גובה קורה בס״מ"
                        />
                        <span className="text-stone-500 select-none" aria-hidden>
                          ×
                        </span>
                        <input
                          type="number"
                          dir="ltr"
                          min={0.1}
                          step={0.1}
                          value={row.widthCm}
                          data-part-field={`${row.id}:w`}
                          onChange={(e) => onUpdateRow(row.id, { widthCm: e.target.value })}
                          onKeyDown={(e) => {
                            onPartFieldKeyDown(e, row.id, 'w')
                            onPartFieldEnter(e, rowIndex, 'w')
                          }}
                          onFocus={onPartFieldFocusSelect}
                          className="box-border min-h-8 w-[4.25rem] rounded border border-stone-600 bg-white px-1.5 py-1 text-center text-xs tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60 sm:min-h-9 sm:w-[4.75rem] sm:px-2 sm:py-1.5 sm:text-sm"
                          title="רוחב (ס״מ)"
                          aria-label="רוחב קורה בס״מ"
                        />
                        {(() => {
                          const h = parseDraftPositiveCm(row.heightCm)
                          const w = parseDraftPositiveCm(row.widthCm)
                          const key = h != null && w != null ? profileMaterialKey(h, w) : null
                          const hasOverride = key ? storeStockLengthsByMaterial[key] != null : false
                          return (
                            <button
                              type="button"
                              onClick={() => key && onOpenMaterialStockEditor(key)}
                              disabled={!key}
                              className="ms-1 inline-flex h-7 w-7 items-center justify-center rounded border border-stone-300 bg-white text-stone-600 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:pointer-events-none disabled:opacity-40 sm:h-8 sm:w-8"
                              title={
                                key
                                  ? hasOverride
                                    ? 'אורכי חנות לפרופיל (מותאם)'
                                    : 'אורכי חנות לפרופיל (ברירת מחדל)'
                                  : 'הזינו גובה ורוחב כדי לערוך אורכי חנות לפרופיל'
                              }
                              aria-label="ערוך אורכי חנות לפרופיל"
                            >
                              <Ruler className={`size-3.5 ${hasOverride ? 'text-stone-900' : ''}`} aria-hidden />
                            </button>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="border border-stone-600 px-1.5 py-1.5 align-middle whitespace-nowrap sm:px-2 sm:py-2">
                      <input
                        type="number"
                        dir="ltr"
                        min={0.1}
                        step={0.1}
                        value={row.lengthCm}
                        data-part-field={`${row.id}:l`}
                        onChange={(e) => onUpdateRow(row.id, { lengthCm: e.target.value })}
                        onKeyDown={(e) => {
                          onPartFieldKeyDown(e, row.id, 'l')
                          onPartFieldEnter(e, rowIndex, 'l')
                        }}
                        onFocus={onPartFieldFocusSelect}
                        className="box-border min-h-8 w-[6.5rem] rounded border border-stone-600 bg-white px-1.5 py-1 text-center text-xs tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60 sm:min-h-9 sm:w-[7.25rem] sm:px-2 sm:py-1.5 sm:text-sm"
                      />
                    </td>
                    <td className="border border-stone-600 px-1.5 py-1.5 align-middle whitespace-nowrap sm:px-2 sm:py-2">
                      <input
                        type="number"
                        dir="ltr"
                        min={1}
                        step={1}
                        value={row.quantity}
                        data-part-field={`${row.id}:q`}
                        onChange={(e) => onUpdateRow(row.id, { quantity: e.target.value })}
                        onKeyDown={(e) => {
                          onPartFieldKeyDown(e, row.id, 'q')
                          onPartFieldEnter(e, rowIndex, 'q')
                        }}
                        onFocus={onPartFieldFocusSelect}
                        className="box-border min-h-8 w-[4.25rem] rounded border border-stone-600 bg-white px-1.5 py-1 text-center text-xs tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60 sm:min-h-9 sm:w-[4.75rem] sm:px-2 sm:py-1.5 sm:text-sm"
                      />
                    </td>
                    <td className="min-w-[7.5rem] border border-stone-600 px-1.5 py-1.5 align-middle sm:min-w-[8rem] sm:px-2 sm:py-2">
                      <input
                        type="text"
                        value={row.name}
                        data-part-field={`${row.id}:n`}
                        onChange={(e) => onUpdateRow(row.id, { name: e.target.value })}
                        onKeyDown={(e) => {
                          onPartFieldKeyDown(e, row.id, 'n')
                          onPartFieldEnter(e, rowIndex, 'n')
                        }}
                        onFocus={onPartFieldFocusSelect}
                        className="box-border min-h-8 w-full min-w-[6.5rem] rounded border border-stone-600 bg-white px-1.5 py-1 text-xs text-stone-800 shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60 sm:min-h-9 sm:min-w-[7rem] sm:px-2 sm:py-1.5 sm:text-sm"
                        placeholder="אופציונלי"
                        aria-label="שם או מטרה"
                      />
                    </td>
                    <td className="border border-stone-600 bg-white px-1 py-1.5 align-middle sm:py-2">
                      <button
                        type="button"
                        aria-label="מחק שורה"
                        data-part-field={`${row.id}:d`}
                        onClick={() => onRemoveRow(row.id)}
                        disabled={rows.length <= 1}
                        className="p-1 text-stone-400 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 disabled:pointer-events-none disabled:opacity-25"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 hidden sm:block">
            <button
              id="focus-part-add-row"
              type="button"
              onClick={onAddRow}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusById('focus-part-calculate')
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  const last = rows[rows.length - 1]!
                  focusPartField(last.id, 'w')
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
            >
              <Plus className="size-5" aria-hidden />
              הוסף שורה
            </button>
          </div>

          <div className="mt-4 hidden border-t border-stone-200 pt-4 sm:block">
            <button
              id="focus-part-calculate"
              type="button"
              onClick={onRunOptimizer}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  focusById('focus-part-add-row')
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  focusById('focus-tool-kerf')
                }
              }}
              disabled={!hasValidPartsForCalc || calculating}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-stone-800 bg-stone-900 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-50"
            >
              {calculating ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <ShoppingCart className="size-5" aria-hidden />
              )}
              {calculating ? 'מחשב פתרון אופטימלי…' : 'חשב רשימת קניות + תוכנית חיתוך'}
            </button>
          </div>
        </div>

        <div className="sm:hidden">
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] gap-3">
              <button
                type="button"
                onClick={onAddRow}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-semibold text-stone-800 shadow-sm hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
              >
                <Plus className="size-5" aria-hidden />
                הוסף
              </button>
              <button
                type="button"
                onClick={onRunOptimizer}
                disabled={!hasValidPartsForCalc || calculating}
                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl border border-stone-800 bg-stone-900 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:pointer-events-none disabled:opacity-50"
              >
                {calculating ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <ShoppingCart className="size-5" aria-hidden />
                )}
                {calculating ? 'מחשב…' : 'חשב'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
})
