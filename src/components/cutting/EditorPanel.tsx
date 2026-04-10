import { memo, type FocusEvent, type KeyboardEvent } from 'react'
import { Loader2, Plus, Ruler, ShoppingCart, Trash2 } from 'lucide-react'
import type { DraftRow } from '../../lib/draftRows'
import {
  legacyKeyFromWoodTypeKey,
  maxStoreCatalogCmForPartRow,
  parseDraftPositiveCm,
  woodTypeKey,
} from '../../lib/draftRows'
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

/** רשימת חלקים דסקטופ — ארבע עמודות שוות + פעולות */
const PARTS_DESK_GRID =
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_48px] items-stretch divide-x divide-x-reverse divide-stone-600'

/** ריפוד אופקי אחיד לעמודות 1–4 (כותרת + גוף) */
const PARTS_DESK_CELL_PAD = 'px-2 sm:px-2.5'

const PARTS_DESK_HEADER_BASE =
  'flex min-h-8 min-w-0 max-w-full items-center overflow-hidden py-1 text-xs font-semibold leading-tight text-stone-800 break-words hyphens-auto sm:min-h-9 sm:py-1.5 sm:text-sm'
/** כותרות מספריות — כמו שדות ממוספרים (מירכוז) */
const PARTS_DESK_HEADER_NUM = `${PARTS_DESK_HEADER_BASE} ${PARTS_DESK_CELL_PAD} justify-center text-center`
/** שם / מטרה — כמו שדה הטקסט */
const PARTS_DESK_HEADER_NAME = `${PARTS_DESK_HEADER_BASE} ${PARTS_DESK_CELL_PAD} justify-end text-right`
/** עמודת פעולות — רוחב רשת 48px */
const PARTS_DESK_HEADER_LAST = `${PARTS_DESK_HEADER_BASE} w-full min-w-0 justify-center px-0 text-center`

const PARTS_DESK_BODY_CELL = `flex min-w-0 max-w-full items-center overflow-hidden ${PARTS_DESK_CELL_PAD} py-0.5 sm:py-1`
const PARTS_DESK_BODY_CELL_LAST =
  'flex min-w-0 w-full max-w-full items-center justify-center overflow-hidden px-0 py-0.5 sm:py-1'

/** תא כמות — flex + justify-center; הכותרת משתמשת ב־PARTS_DESK_HEADER_NUM (מירכוז זהה) */
const PARTS_DESK_BODY_QTY = `flex min-w-0 max-w-full items-center justify-center overflow-hidden ${PARTS_DESK_CELL_PAD} py-0.5 sm:py-1`

/** בסיס שדה מספרי בטבלה (בלי min-width — נקבע לפי שימוש) */
const DESK_INPUT_TABLE_NUM_BASE =
  'box-border h-8 w-full rounded border border-stone-600 bg-white px-2 py-0 text-center text-sm tabular-nums leading-tight shadow-sm outline-none focus:border-blue-500 focus:outline-none sm:h-9 sm:px-2.5'

/** מספרים בטבלת דסקטופ — אורך, כמות וכו׳ */
const DESK_INPUT_TABLE_NUM = `${DESK_INPUT_TABLE_NUM_BASE} min-w-0`

/** שם / מטרה — אותו גובה כמו שדות המספרים לשורה נמוכה */
const DESK_INPUT_TABLE_TXT =
  'box-border h-8 w-full min-w-0 rounded border border-stone-600 bg-white px-2 py-0 text-right text-sm leading-tight text-stone-800 shadow-sm outline-none focus:border-blue-500 focus:outline-none sm:h-9 sm:px-2.5'

/** עובי × רוחב — רוחב מינימלי נוח לשתי ספרות; עדיין flex-1 שווה ביניהם */
const DESK_DIM_FLEX = `${DESK_INPUT_TABLE_NUM_BASE} min-w-[2.85rem] flex-1 basis-0 sm:min-w-[3.35rem]`

const DESK_INPUT_LENGTH = DESK_INPUT_TABLE_NUM
const DESK_INPUT_QTY = DESK_INPUT_TABLE_NUM
const DESK_INPUT_NAME = DESK_INPUT_TABLE_TXT

/** כפתור/מקום פיצול אורך — כגובה שדה המספר */
const DESK_SPLIT_BTN_TABLE =
  'box-border inline-flex h-8 w-7 shrink-0 items-center justify-center self-stretch rounded border text-sm font-semibold leading-none shadow-sm outline-none transition-colors focus-visible:border-blue-500 focus-visible:outline-none sm:h-9 sm:w-8'

/** כפתור סרגל מידות */
const DESK_RULER_BTN_TABLE =
  'inline-flex size-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-white text-stone-600 shadow-sm outline-none hover:bg-stone-50 focus-visible:border-blue-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 sm:size-9'

function rowNeedsOversizeSplitControl(
  row: DraftRow,
  storeStockLengthsByMaterial: Record<string, number[]>,
  storeStockLengthsCm: number[],
): boolean {
  const h = parseDraftPositiveCm(row.heightCm)
  const w = parseDraftPositiveCm(row.widthCm)
  const L = parseDraftPositiveCm(row.lengthCm)
  if (h == null || w == null || L == null) return false
  const maxCm = maxStoreCatalogCmForPartRow(w, h, storeStockLengthsByMaterial, storeStockLengthsCm)
  return L > maxCm + 1e-9
}

function LengthFieldWithSplit({
  row,
  rowIndex,
  variant,
  storeStockLengthsByMaterial,
  storeStockLengthsCm,
  onUpdateRow,
  onPartFieldFocusSelect,
  onPartFieldEnter,
  onPartFieldKeyDown,
  inputClassName,
}: {
  row: DraftRow
  rowIndex: number
  variant: 'card' | 'table'
  storeStockLengthsByMaterial: Record<string, number[]>
  storeStockLengthsCm: number[]
  onUpdateRow: EditorPanelProps['onUpdateRow']
  onPartFieldFocusSelect: EditorPanelProps['onPartFieldFocusSelect']
  onPartFieldEnter: EditorPanelProps['onPartFieldEnter']
  onPartFieldKeyDown: EditorPanelProps['onPartFieldKeyDown']
  inputClassName: string
}) {
  const showSplitToggle = rowNeedsOversizeSplitControl(
    row,
    storeStockLengthsByMaterial,
    storeStockLengthsCm,
  )
  const isSymmetric = row.splitStrategy === 'symmetric'

  const inputCls =
    variant === 'table'
      ? `${inputClassName} box-border min-h-0 min-w-0 w-full flex-1 basis-0`
      : showSplitToggle
        ? `${inputClassName} min-w-0 flex-1`
        : inputClassName

  const tableSplitSlot =
    variant === 'table' ? (
      showSplitToggle ? (
        <button
          type="button"
          onClick={() =>
            onUpdateRow(row.id, {
              splitStrategy: isSymmetric ? undefined : 'symmetric',
            })
          }
          aria-pressed={isSymmetric}
          title={
            isSymmetric
              ? 'חלוקה שווית — לחץ למצב מקס׳ קטלוג + שארית'
              : 'מקס׳ קטלוג + שארית — לחץ לחלוקה שווית'
          }
          aria-label={
            isSymmetric
              ? 'מצב פיצול: חלוקה שווית. לחץ למעבר למקס׳ קטלוג ושארית'
              : 'מצב פיצול: מקס׳ קטלוג ושארית. לחץ למעבר לחלוקה שווית'
          }
          className={`${DESK_SPLIT_BTN_TABLE} ${
            isSymmetric
              ? 'border-stone-700 bg-stone-800 text-white hover:bg-stone-900'
              : 'border-stone-400 bg-white text-stone-800 hover:bg-stone-50'
          }`}
        >
          =
        </button>
      ) : (
        <span
          className="box-border inline-block h-8 w-7 shrink-0 self-stretch rounded border border-transparent sm:h-9 sm:w-8"
          aria-hidden
        />
      )
    ) : showSplitToggle ? (
      <button
        type="button"
        onClick={() =>
          onUpdateRow(row.id, {
            splitStrategy: isSymmetric ? undefined : 'symmetric',
          })
        }
        aria-pressed={isSymmetric}
        title={
          isSymmetric
            ? 'חלוקה שווית — לחץ למצב מקס׳ קטלוג + שארית'
            : 'מקס׳ קטלוג + שארית — לחץ לחלוקה שווית'
        }
        aria-label={
          isSymmetric
            ? 'מצב פיצול: חלוקה שווית. לחץ למעבר למקס׳ קטלוג ושארית'
            : 'מצב פיצול: מקס׳ קטלוג ושארית. לחץ למעבר לחלוקה שווית'
        }
        className={`box-border inline-flex h-10 w-6 shrink-0 items-center justify-center rounded border text-[13px] font-semibold leading-none shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/60 ${
          isSymmetric
            ? 'border-stone-700 bg-stone-800 text-white hover:bg-stone-900'
            : 'border-stone-400 bg-white text-stone-800 hover:bg-stone-50'
        }`}
      >
        =
      </button>
    ) : null

  const tableWrapCls =
    'flex w-full min-w-0 max-w-full min-h-0 items-stretch gap-1.5 overflow-hidden sm:gap-2'

  return (
    <div
      className={variant === 'table' ? tableWrapCls : 'flex w-full min-w-0 max-w-full items-stretch gap-2'}
      dir="ltr"
    >
      {tableSplitSlot}
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
        className={inputCls}
      />
    </div>
  )
}

export const EditorPanel = memo(function EditorPanel({
  rows,
  storeStockLengthsCm,
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
        <div className="flex min-h-0 min-w-0 flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm ring-1 ring-stone-100/80">
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
                    const key = h != null && w != null ? woodTypeKey(w, h) : null
                    const leg = key != null ? legacyKeyFromWoodTypeKey(key) : null
                    const hasOverride = key
                      ? storeStockLengthsByMaterial[key] != null ||
                        (leg != null && storeStockLengthsByMaterial[leg] != null)
                      : false
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
                    <LengthFieldWithSplit
                      row={row}
                      rowIndex={rowIndex}
                      variant="card"
                      storeStockLengthsByMaterial={storeStockLengthsByMaterial}
                      storeStockLengthsCm={storeStockLengthsCm}
                      onUpdateRow={onUpdateRow}
                      onPartFieldFocusSelect={onPartFieldFocusSelect}
                      onPartFieldEnter={onPartFieldEnter}
                      onPartFieldKeyDown={onPartFieldKeyDown}
                      inputClassName="min-h-10 w-full rounded-lg border border-stone-400 bg-white px-2 text-center text-base tabular-nums shadow-sm outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-400/60"
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

          <div
            className="hidden min-w-0 w-full max-w-full overflow-x-hidden rounded-lg border-2 border-stone-600 sm:block"
            dir="rtl"
            role="table"
            aria-label="רשימת חלקים"
          >
            <div
              className={`${PARTS_DESK_GRID} border-b border-stone-600 bg-stone-200`}
              role="row"
            >
              <div className={PARTS_DESK_HEADER_NUM} role="columnheader">
                מידת עץ (ס״מ)
              </div>
              <div className={PARTS_DESK_HEADER_NUM} role="columnheader">
                אורך (ס״מ)
              </div>
              <div className={PARTS_DESK_HEADER_NUM} role="columnheader">
                כמות
              </div>
              <div className={PARTS_DESK_HEADER_NAME} role="columnheader">
                שם / מטרה
              </div>
              <div className={PARTS_DESK_HEADER_LAST} role="columnheader" aria-hidden />
            </div>
            {rows.map((row, rowIndex) => (
              <div
                key={row.id}
                className={`${PARTS_DESK_GRID} border-b border-stone-600 bg-stone-50 last:border-b-0`}
                role="row"
              >
                <div className={PARTS_DESK_BODY_CELL} role="cell">
                  <div className="flex min-w-0 w-full max-w-full flex-nowrap items-center gap-1.5 sm:gap-2" dir="ltr">
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
                      className={DESK_DIM_FLEX}
                      title="עובי / גובה (ס״מ)"
                      aria-label="גובה קורה בס״מ"
                    />
                    <span className="shrink-0 select-none text-stone-500" aria-hidden>
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
                      className={DESK_DIM_FLEX}
                      title="רוחב (ס״מ)"
                      aria-label="רוחב קורה בס״מ"
                    />
                    {(() => {
                      const h = parseDraftPositiveCm(row.heightCm)
                      const w = parseDraftPositiveCm(row.widthCm)
                      const key = h != null && w != null ? woodTypeKey(w, h) : null
                      const leg = key != null ? legacyKeyFromWoodTypeKey(key) : null
                      const hasOverride = key
                        ? storeStockLengthsByMaterial[key] != null ||
                          (leg != null && storeStockLengthsByMaterial[leg] != null)
                        : false
                      return (
                        <button
                          type="button"
                          onClick={() => key && onOpenMaterialStockEditor(key)}
                          disabled={!key}
                          className={DESK_RULER_BTN_TABLE}
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
                </div>
                <div className={PARTS_DESK_BODY_CELL} role="cell">
                  <LengthFieldWithSplit
                    row={row}
                    rowIndex={rowIndex}
                    variant="table"
                    storeStockLengthsByMaterial={storeStockLengthsByMaterial}
                    storeStockLengthsCm={storeStockLengthsCm}
                    onUpdateRow={onUpdateRow}
                    onPartFieldFocusSelect={onPartFieldFocusSelect}
                    onPartFieldEnter={onPartFieldEnter}
                    onPartFieldKeyDown={onPartFieldKeyDown}
                    inputClassName={DESK_INPUT_LENGTH}
                  />
                </div>
                <div className={PARTS_DESK_BODY_QTY} role="cell">
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
                    className={DESK_INPUT_QTY}
                  />
                </div>
                <div className={PARTS_DESK_BODY_CELL} role="cell">
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
                    className={DESK_INPUT_NAME}
                    placeholder="אופציונלי"
                    aria-label="שם או מטרה"
                  />
                </div>
                <div className={PARTS_DESK_BODY_CELL_LAST} role="cell">
                  <button
                    type="button"
                    aria-label="מחק שורה"
                    data-part-field={`${row.id}:d`}
                    onClick={() => onRemoveRow(row.id)}
                    disabled={rows.length <= 1}
                    className="rounded p-1 text-stone-400 outline-none hover:text-stone-700 focus-visible:border focus-visible:border-blue-500 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-25"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
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
