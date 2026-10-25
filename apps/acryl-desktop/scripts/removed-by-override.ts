/** Packages the root workspace removes from every install with a `'-'` override, so a manifest that still declares one is not missing it. */

import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const WORKSPACE = new URL('../../../pnpm-workspace.yaml', import.meta.url)

/** The names `pnpm-workspace.yaml` overrides to `'-'` (for example `node-addon-require-builtin`, which ACRYL's profile resolution replaced). */
export function packagesRemovedByOverride(workspace: string = readFileSync(WORKSPACE, 'utf8')): ReadonlySet<string> {
  const overrides = (parse(workspace) as { overrides?: Record<string, unknown> } | null)?.overrides ?? {}
  return new Set(Object.entries(overrides).filter(([, version]) => version === '-').map(([name]) => name))
}
