import { flushSync } from 'react-dom'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import {
  cloneEditorPayload,
  deleteProjectPartRow,
  loadProjectEditorState,
  persistProjectEditorIfChanged,
  type Project,
  type ProjectEditorPayload,
} from '../services/projects'
import type { UserWorkspaceBootstrap } from '../services/preloadUserData'
import {
  DEFAULT_STORE_STOCK_LENGTHS_CM,
  normalizeStoreStockLengthsCm,
} from '../lib/cuttingOptimizer'
import {
  emptyDraftRow,
  legacyKeyFromWoodTypeKey,
  normalizePartRows,
  type DraftRow,
} from '../lib/draftRows'
import {
  PART_DATA_FIELD_ORDER,
  PART_NEXT_ROW_START_FIELD,
  focusById,
  focusPartField,
  type PartField,
} from '../partTableFocus'

const TOOL_FOCUS_IDS = ['focus-tool-kerf', 'focus-tool-export-pdf'] as const

function loadInitialEditorState() {
  return {
    kerfMm: 0,
    rows: normalizePartRows([emptyDraftRow()]),
    storeStockLengthsCm: [...DEFAULT_STORE_STOCK_LENGTHS_CM],
    storeStockLengthsByMaterial: {} as Record<string, number[]>,
  }
}

export function useProjectEditor(
  activeProject: Project | null,
  workspaceBootstrap: UserWorkspaceBootstrap,
  clearOptimizationResult: () => void,
) {
  const editorPrefetchRef = useRef(workspaceBootstrap.editorByProjectId)
  const consumedEditorPrefetchRef = useRef<Set<string>>(new Set())
  const activeProjectIdRef = useRef<string | null>(activeProject?.id ?? null)

  const initial = useMemo(() => loadInitialEditorState(), [])
  const [kerfMm, setKerfMm] = useState(initial.kerfMm)
  const [rows, setRows] = useState<DraftRow[]>(initial.rows)
  const [storeStockLengthsCm, setStoreStockLengthsCm] = useState<number[]>(
    normalizeStoreStockLengthsCm(initial.storeStockLengthsCm),
  )
  const [storeStockLengthsByMaterial, setStoreStockLengthsByMaterial] = useState<
    Record<string, number[]>
  >(initial.storeStockLengthsByMaterial ?? {})

  const [editingMaterialKey, setEditingMaterialKey] = useState<string | null>(null)
  const [materialStockDraft, setMaterialStockDraft] = useState<number[]>([])
  const materialStockInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const editorHydratedProjectIdRef = useRef<string | null>(null)
  const lastPersistedRef = useRef<ProjectEditorPayload | null>(null)
  const editorSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** מונה ריצות useEffect לטעינת עורך — רק הריצה האחרונה רשאית לעדכן state. */
  const editorLoadEffectRunRef = useRef(0)
  const editorLoadAbortRef = useRef<AbortController | null>(null)

  const currentProjectData = useCallback(() => {
    return { kerfMm, rows, storeStockLengthsCm, storeStockLengthsByMaterial }
  }, [kerfMm, rows, storeStockLengthsCm, storeStockLengthsByMaterial])

  useEffect(() => {
    activeProjectIdRef.current = activeProject?.id ?? null
  }, [activeProject?.id])

  useEffect(() => {
    const id = activeProject?.id
    const effectRun = ++editorLoadEffectRunRef.current

    if (!id) {
      editorLoadAbortRef.current?.abort()
      editorLoadAbortRef.current = null
      editorHydratedProjectIdRef.current = null
      lastPersistedRef.current = null
      return
    }

    const prefetched = editorPrefetchRef.current[id]
    const usePrefetch = prefetched && !consumedEditorPrefetchRef.current.has(id)
    if (usePrefetch) {
      consumedEditorPrefetchRef.current.add(id)
      setKerfMm(prefetched.kerfMm)
      setRows(normalizePartRows(prefetched.rows as DraftRow[]))
      setStoreStockLengthsCm(normalizeStoreStockLengthsCm(prefetched.storeStockLengthsCm))
      setStoreStockLengthsByMaterial(prefetched.storeStockLengthsByMaterial)
      clearOptimizationResult()
      editorHydratedProjectIdRef.current = id
      lastPersistedRef.current = cloneEditorPayload(prefetched)
      return
    }

    editorLoadAbortRef.current?.abort()
    const ac = new AbortController()
    editorLoadAbortRef.current = ac

    editorHydratedProjectIdRef.current = null
    lastPersistedRef.current = null
    setKerfMm(0)
    setRows(normalizePartRows([emptyDraftRow()]))
    setStoreStockLengthsCm(normalizeStoreStockLengthsCm([...DEFAULT_STORE_STOCK_LENGTHS_CM]))
    setStoreStockLengthsByMaterial({})
    clearOptimizationResult()

    const applyLoaded = (state: ProjectEditorPayload) => {
      if (editorLoadEffectRunRef.current !== effectRun) return
      if (activeProjectIdRef.current !== id) return
      if (ac.signal.aborted) return
      setKerfMm(state.kerfMm)
      setRows(normalizePartRows(state.rows as DraftRow[]))
      setStoreStockLengthsCm(normalizeStoreStockLengthsCm(state.storeStockLengthsCm))
      setStoreStockLengthsByMaterial(state.storeStockLengthsByMaterial)
      editorHydratedProjectIdRef.current = id
      lastPersistedRef.current = cloneEditorPayload(state)
    }

    void loadProjectEditorState(id, applyLoaded, ac.signal)
      .then((state) => {
        applyLoaded(state)
      })
      .catch(() => {
        if (editorLoadEffectRunRef.current !== effectRun) return
        if (activeProjectIdRef.current !== id) return
        if (ac.signal.aborted) return
        editorHydratedProjectIdRef.current = id
      })

    return () => {
      ac.abort()
      if (editorLoadAbortRef.current === ac) editorLoadAbortRef.current = null
    }
  }, [activeProject?.id, clearOptimizationResult])

  useEffect(() => {
    const id = activeProject?.id
    if (!id) return
    if (editorHydratedProjectIdRef.current !== id) return
    if (editorSaveDebounceRef.current) clearTimeout(editorSaveDebounceRef.current)
    editorSaveDebounceRef.current = window.setTimeout(() => {
      editorSaveDebounceRef.current = null
      if (editorHydratedProjectIdRef.current !== id) return
      const next = cloneEditorPayload(currentProjectData())
      void persistProjectEditorIfChanged(id, lastPersistedRef.current, next).then((r) => {
        if (r !== 'saved') return
        if (editorHydratedProjectIdRef.current !== id) return
        lastPersistedRef.current = cloneEditorPayload(next)
      })
    }, 650)
    return () => {
      if (editorSaveDebounceRef.current) {
        clearTimeout(editorSaveDebounceRef.current)
        editorSaveDebounceRef.current = null
      }
    }
  }, [activeProject?.id, currentProjectData])

  const flushPendingEditorSave = useCallback(async () => {
    const id = activeProject?.id
    if (!id) return
    if (editorSaveDebounceRef.current) {
      clearTimeout(editorSaveDebounceRef.current)
      editorSaveDebounceRef.current = null
    }
    if (editorHydratedProjectIdRef.current !== id) return
    const next = cloneEditorPayload(currentProjectData())
    const r = await persistProjectEditorIfChanged(id, lastPersistedRef.current, next)
    if (r === 'saved' && editorHydratedProjectIdRef.current === id) {
      lastPersistedRef.current = cloneEditorPayload(next)
    }
  }, [activeProject?.id, currentProjectData])

  const openMaterialStockEditor = useCallback(
    (materialKey: string) => {
      const legacy = legacyKeyFromWoodTypeKey(materialKey)
      const current =
        storeStockLengthsByMaterial[materialKey] ??
        (legacy != null ? storeStockLengthsByMaterial[legacy] : undefined) ??
        storeStockLengthsCm
      setEditingMaterialKey(materialKey)
      setMaterialStockDraft(normalizeStoreStockLengthsCm(current))
      materialStockInputRefs.current = []
    },
    [storeStockLengthsByMaterial, storeStockLengthsCm],
  )

  const saveMaterialStockEditor = useCallback(() => {
    const key = editingMaterialKey
    if (!key) return
    const normalized = normalizeStoreStockLengthsCm(materialStockDraft)
    setStoreStockLengthsByMaterial((prev) => ({ ...prev, [key]: normalized }))
    setEditingMaterialKey(null)
  }, [editingMaterialKey, materialStockDraft])

  const resetMaterialToDefault = useCallback(() => {
    const key = editingMaterialKey
    if (!key) return
    const legacy = legacyKeyFromWoodTypeKey(key)
    setStoreStockLengthsByMaterial((prev) => {
      const next = { ...prev }
      delete next[key]
      if (legacy) delete next[legacy]
      return next
    })
    setEditingMaterialKey(null)
  }, [editingMaterialKey])

  const updateMaterialDraftAt = useCallback((index: number, nextCmRaw: string) => {
    const n = Number(String(nextCmRaw).trim().replace(',', '.'))
    if (!Number.isFinite(n)) return
    setMaterialStockDraft((prev) => {
      const out = [...prev]
      out[index] = n <= 0 ? 0 : Math.round(n)
      return out
    })
  }, [])

  const removeMaterialDraftAt = useCallback((index: number) => {
    setMaterialStockDraft((prev) => {
      const out = prev.filter((_, i) => i !== index)
      return out.length ? out : [300]
    })
  }, [])

  const addMaterialDraft = useCallback(() => {
    setMaterialStockDraft((prev) => [...prev, 300])
  }, [])

  const focusMaterialDraftAt = (i: number) => {
    const el = materialStockInputRefs.current[i]
    if (!el) return
    el.focus()
    try {
      el.select()
    } catch {
      /* ignore */
    }
  }

  const handleMaterialDraftKeyDown = (e: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      focusMaterialDraftAt(Math.min(materialStockDraft.length - 1, index + 1))
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      focusMaterialDraftAt(Math.min(materialStockDraft.length - 1, index + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      focusMaterialDraftAt(Math.max(0, index - 1))
      return
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusMaterialDraftAt(Math.min(materialStockDraft.length - 1, index + 1))
      return
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusMaterialDraftAt(Math.max(0, index - 1))
      return
    }
  }

  const handlePartFieldFocusSelect = useCallback((e: FocusEvent<HTMLInputElement>) => {
    try {
      e.currentTarget.select()
    } catch {
      /* ignore */
    }
  }, [])

  const appendEmptyPartRow = useCallback((): DraftRow => {
    const newRow = emptyDraftRow()
    setRows((prev) => [...normalizePartRows(prev), newRow])
    return newRow
  }, [])

  const handlePartFieldEnter = useCallback(
    (e: KeyboardEvent<HTMLInputElement>, rowIndex: number, field: PartField) => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      const order = PART_DATA_FIELD_ORDER
      const fi = order.indexOf(field as Exclude<PartField, 'd'>)
      if (fi < 0) return
      const rowId = rows[rowIndex]?.id
      if (!rowId) return
      if (fi < order.length - 1) {
        focusPartField(rowId, order[fi + 1]!)
        return
      }
      const nextRowId = rows[rowIndex + 1]?.id
      if (nextRowId) {
        focusPartField(nextRowId, PART_NEXT_ROW_START_FIELD)
        return
      }
      const newRow = flushSync(() => appendEmptyPartRow())
      focusPartField(newRow.id, PART_NEXT_ROW_START_FIELD)
    },
    [rows, appendEmptyPartRow],
  )

  const handlePartFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>, rowId: string, field: PartField) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      if (field === 'd') return

      const order = PART_DATA_FIELD_ORDER
      const fi = order.indexOf(field as Exclude<PartField, 'd'>)
      if (fi < 0) return

      const rowIds = rows.map((r) => r.id)
      const rowIndex = rowIds.indexOf(rowId)
      if (rowIndex < 0) return

      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'ArrowRight') {
        if (fi < order.length - 1) {
          focusPartField(rowId, order[fi + 1]!)
        } else if (rowIndex < rowIds.length - 1) {
          focusPartField(rowIds[rowIndex + 1]!, PART_NEXT_ROW_START_FIELD)
        } else {
          const newRow = flushSync(() => appendEmptyPartRow())
          focusPartField(newRow.id, PART_NEXT_ROW_START_FIELD)
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        if (fi > 0) {
          focusPartField(rowId, order[fi - 1]!)
        } else if (rowIndex > 0) {
          focusPartField(rowIds[rowIndex - 1]!, order[order.length - 1]!)
        }
        return
      }

      if (e.key === 'ArrowDown') {
        if (rowIndex < rowIds.length - 1) {
          focusPartField(rowIds[rowIndex + 1]!, field)
        } else {
          const newRow = flushSync(() => appendEmptyPartRow())
          focusPartField(newRow.id, field)
        }
        return
      }

      if (e.key === 'ArrowUp') {
        if (rowIndex > 0) {
          focusPartField(rowIds[rowIndex - 1]!, field)
        }
        return
      }
    },
    [rows, appendEmptyPartRow],
  )

  const handleToolSidebarKeyDown = useCallback((e: KeyboardEvent<HTMLElement>, toolIndex: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = toolIndex + 1
      if (next < TOOL_FOCUS_IDS.length) focusById(TOOL_FOCUS_IDS[next]!)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (toolIndex > 0) focusById(TOOL_FOCUS_IDS[toolIndex - 1]!)
      else focusById('focus-part-calculate')
    }
  }, [])

  const addRow = useCallback(() => {
    appendEmptyPartRow()
  }, [appendEmptyPartRow])

  const removeRow = useCallback(
    (rowId: string) => {
      clearOptimizationResult()
      setRows((prev) =>
        normalizePartRows(prev.length <= 1 ? prev : prev.filter((r) => r.id !== rowId)),
      )
      const pid = activeProject?.id
      if (pid && editorHydratedProjectIdRef.current === pid) {
        void deleteProjectPartRow(pid, rowId).catch(() => {})
      }
    },
    [activeProject?.id, clearOptimizationResult],
  )

  const updateRow = useCallback(
    (rowId: string, patch: Partial<Omit<DraftRow, 'id'>>) => {
      clearOptimizationResult()
      setRows((prev) =>
        normalizePartRows(prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r))),
      )
    },
    [clearOptimizationResult],
  )

  return {
    kerfMm,
    setKerfMm,
    rows,
    storeStockLengthsCm,
    storeStockLengthsByMaterial,
    editingMaterialKey,
    setEditingMaterialKey,
    materialStockDraft,
    materialStockInputRefs,
    currentProjectData,
    flushPendingEditorSave,
    openMaterialStockEditor,
    saveMaterialStockEditor,
    resetMaterialToDefault,
    updateMaterialDraftAt,
    removeMaterialDraftAt,
    addMaterialDraft,
    focusMaterialDraftAt,
    handleMaterialDraftKeyDown,
    handlePartFieldFocusSelect,
    handlePartFieldEnter,
    handlePartFieldKeyDown,
    handleToolSidebarKeyDown,
    addRow,
    removeRow,
    updateRow,
    appendEmptyPartRow,
  }
}
