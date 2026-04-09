import { useState } from 'react'
import type { Project } from '../services/projects'
import { pickInitialActiveProject } from '../lib/projectSelection'

export function useActiveProject(initialProjects: Project[]) {
  const [activeProject, setActiveProject] = useState<Project | null>(() =>
    pickInitialActiveProject(initialProjects),
  )
  return { activeProject, setActiveProject }
}
