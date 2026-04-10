import { lazy, Suspense, useCallback, useMemo } from 'react'
import type { UserWorkspaceBootstrap } from '../services/preloadUserData'
import { rowsToParts } from '../lib/draftRows'
import { useActiveProject } from '../hooks/useProjects'
import { useProjectEditor } from '../hooks/useProjectEditor'
import { useOptimizer } from '../hooks/useOptimizer'
import { AppHeader } from '../components/cutting/AppHeader'
import { ProjectsSidebar } from '../components/cutting/ProjectsSidebar'
import { MaterialStockModal } from '../components/cutting/MaterialStockModal'
import { EditorPanel } from '../components/cutting/EditorPanel'
import { EditorToolsPanel } from '../components/cutting/EditorToolsPanel'
import { EditorColumnSkeleton } from '../components/cutting/WorkspaceLoadingSkeleton'
import { CalculatingOverlay } from '../components/cutting/CalculatingOverlay'

const ResultsPanel = lazy(async () => {
  const m = await import('../components/cutting/ResultsPanel')
  return { default: m.ResultsPanel }
})

export function AuthedCalculatorPage({
  welcomeName,
  onSignOut,
  workspaceBootstrap,
  workspaceRemoteHydrated,
}: {
  welcomeName: string
  onSignOut: () => void
  workspaceBootstrap: UserWorkspaceBootstrap
  workspaceRemoteHydrated: boolean
}) {
  const { activeProject, setActiveProject } = useActiveProject(workspaceBootstrap.projects)
  const {
    result,
    calculating,
    pdfExporting,
    resultsRef,
    runShoppingAndCuts: runOptimizerWorker,
    exportPdf,
    clearResult,
  } = useOptimizer()
  const editor = useProjectEditor(activeProject, workspaceBootstrap, clearResult)

  const hasValidPartsForCalc = useMemo(() => rowsToParts(editor.rows).length > 0, [editor.rows])

  const showWorkspaceSkeleton =
    !workspaceRemoteHydrated && workspaceBootstrap.projects.length === 0

  const runShoppingAndCuts = useCallback(() => {
    runOptimizerWorker(
      editor.rows,
      editor.kerfMm,
      editor.storeStockLengthsCm,
      editor.storeStockLengthsByMaterial,
    )
  }, [
    runOptimizerWorker,
    editor.rows,
    editor.kerfMm,
    editor.storeStockLengthsCm,
    editor.storeStockLengthsByMaterial,
  ])

  return (
    <div className="min-h-screen">
      <AppHeader welcomeName={welcomeName} onSignOut={onSignOut} />

      <main className="mx-auto max-w-[1400px] px-4 py-8 pb-28 sm:pb-8">
        <ProjectsSidebar
          activeProjectId={activeProject?.id ?? null}
          onSelectProject={setActiveProject}
          flushPendingEditorSave={editor.flushPendingEditorSave}
          prefetchedProjects={workspaceBootstrap.projects}
          workspaceRemoteHydrated={workspaceRemoteHydrated}
        />

        <MaterialStockModal
          editingMaterialKey={editor.editingMaterialKey}
          materialStockDraft={editor.materialStockDraft}
          materialStockInputRefs={editor.materialStockInputRefs}
          onClose={() => editor.setEditingMaterialKey(null)}
          onSave={editor.saveMaterialStockEditor}
          onResetToDefault={editor.resetMaterialToDefault}
          updateMaterialDraftAt={editor.updateMaterialDraftAt}
          removeMaterialDraftAt={editor.removeMaterialDraftAt}
          addMaterialDraft={editor.addMaterialDraft}
          handleMaterialDraftKeyDown={editor.handleMaterialDraftKeyDown}
        />

        <div className="mb-4 grid gap-8 print:mb-0 print:grid-cols-1 lg:grid-cols-2 lg:items-start">
          {showWorkspaceSkeleton ? (
            <>
              <EditorColumnSkeleton />
              <EditorColumnSkeleton />
            </>
          ) : (
            <>
              <EditorPanel
                rows={editor.rows}
                storeStockLengthsCm={editor.storeStockLengthsCm}
                storeStockLengthsByMaterial={editor.storeStockLengthsByMaterial}
                hasValidPartsForCalc={hasValidPartsForCalc}
                calculating={calculating}
                onUpdateRow={editor.updateRow}
                onRemoveRow={editor.removeRow}
                onAddRow={editor.addRow}
                onRunOptimizer={runShoppingAndCuts}
                onOpenMaterialStockEditor={editor.openMaterialStockEditor}
                onPartFieldFocusSelect={editor.handlePartFieldFocusSelect}
                onPartFieldEnter={editor.handlePartFieldEnter}
                onPartFieldKeyDown={editor.handlePartFieldKeyDown}
              />

              <EditorToolsPanel
                kerfMm={editor.kerfMm}
                onKerfChange={editor.setKerfMm}
                onExportPdf={exportPdf}
                pdfExporting={pdfExporting}
                result={result}
                onToolSidebarKeyDown={editor.handleToolSidebarKeyDown}
              />
            </>
          )}
        </div>

        {result && result.patterns.length > 0 && (
          <Suspense
            fallback={
              <div className="mb-4 h-40 animate-pulse rounded-xl border border-stone-200 bg-stone-50" />
            }
          >
            <ResultsPanel result={result} rows={editor.rows} resultsRef={resultsRef} />
          </Suspense>
        )}

        <CalculatingOverlay open={calculating} />

        {result && result.errors.length === 0 && result.patterns.length === 0 && (
            <p className="no-print text-center text-stone-500">
              הוסיפו חלקים או ודאו שנתונים תקינים.
            </p>
          )}
      </main>
    </div>
  )
}
