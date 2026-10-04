/** The project registry: an ordered list of folders in one `acryl-settings` section, changed one write at a time. */

import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { SettingsScope } from 'acryl-settings'
import z from '@deepseek-ai/schemastery'
import type { ProjectRegistryView } from './contract.ts'

export const PROJECTS_NAMESPACE = 'workspace'

export interface ProjectsSection {
  projects: string[]
  adopted: boolean
}

/** The section's schema: the folders, and whether the pre-existing ones were taken over. */
export const ProjectsSchema: z<ProjectsSection> = z.object({
  projects: z.array(z.string()).default([]).description('Folders the user added as projects, in order.'),
  adopted: z.boolean().default(false).description('Projects registered before ACRYL owned the list were taken over once.'),
})

export class ProjectFolderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectFolderError'
  }
}

/** The canonical form of a project folder: absolute, no trailing separator. @throws ProjectFolderError for anything that is not an existing folder. */
export function normalizeProjectFolder(path: string): string {
  if (!isAbsolute(path)) throw new ProjectFolderError(`${path} is not an absolute path`)
  const folder = resolve(path)
  let stat
  try {
    stat = statSync(folder)
  } catch {
    throw new ProjectFolderError(`${folder} does not exist`)
  }
  if (!stat.isDirectory()) throw new ProjectFolderError(`${folder} is not a folder`)
  return folder
}

export class ProjectRegistry {
  constructor(private readonly scope: SettingsScope<ProjectsSection>) {}

  view(): ProjectRegistryView {
    const section = this.scope.get()
    return { paths: [...section.projects], adopted: section.adopted }
  }

  async add(path: string): Promise<ProjectRegistryView> {
    const folder = normalizeProjectFolder(path)
    const current = this.scope.get()
    if (!current.projects.includes(folder)) await this.scope.update({ projects: [...current.projects, folder] })
    return this.view()
  }

  /** Removing a folder that is not listed is not an error: the list is what the caller wanted. */
  async remove(path: string): Promise<ProjectRegistryView> {
    const folder = resolve(path)
    const current = this.scope.get()
    if (current.projects.includes(folder)) await this.scope.update({ projects: current.projects.filter(candidate => candidate !== folder) })
    return this.view()
  }

  /** Take over folders registered elsewhere, once. Folders that no longer exist are skipped, not fatal. */
  async adopt(paths: readonly string[]): Promise<ProjectRegistryView> {
    const current = this.scope.get()
    if (current.adopted) return this.view()
    const merged = [...current.projects]
    for (const path of paths) {
      try {
        const folder = normalizeProjectFolder(path)
        if (!merged.includes(folder)) merged.push(folder)
      } catch {
        // A project that has since been deleted is not carried over.
      }
    }
    await this.scope.update({ projects: merged, adopted: true })
    return this.view()
  }
}
