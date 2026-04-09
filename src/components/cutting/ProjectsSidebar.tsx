import { memo } from 'react'
import { ProjectsTabs } from '../../pages/ProjectsTabs'
import { LAST_OPENED_PROJECT_STORAGE_KEY } from '../../services/preloadUserData'
import type { Project } from '../../services/projects'

export const ProjectsSidebar = memo(function ProjectsSidebar({
  activeProjectId,
  onSelectProject,
  flushPendingEditorSave,
  prefetchedProjects,
}: {
  activeProjectId: string | null
  onSelectProject: (p: Project) => void
  flushPendingEditorSave: () => Promise<void>
  prefetchedProjects: Project[]
}) {
  return (
    <div className="no-print mb-6 w-full min-w-0">
      <ProjectsTabs
        activeProjectId={activeProjectId}
        onSelect={(p) => {
          try {
            localStorage.setItem(LAST_OPENED_PROJECT_STORAGE_KEY, p.id)
          } catch {
            /* ignore */
          }
          onSelectProject(p)
        }}
        flushPendingEditorSave={flushPendingEditorSave}
        prefetchedProjects={prefetchedProjects}
      />
    </div>
  )
})
