/**
 * Presentation of `acryl ui …` results (spec 038-ui-component-library, T038).
 * Rendering only, matching `plugin-render.ts`'s own convention.
 */

import type { UiCommandResult } from '../host/ui-command.ts'

export interface RenderedUiCommand {
  readonly lines: readonly string[]
  readonly exitCode: number
}

function jsonLine(result: UiCommandResult): string {
  return JSON.stringify({ mode: 'ui', ...result })
}

/** Human-readable lines, or the one-line JSON projection for `--json`. */
export function renderUiCommand(result: UiCommandResult, json: boolean): RenderedUiCommand {
  if (json) return { lines: [jsonLine(result)], exitCode: 0 }

  if (result.kind === 'list') {
    return {
      lines: [
        ...result.items.map(item => `${item.id}  v${item.version}  [${item.surfaces.join(', ')}]`),
        `${result.items.length} item(s)`,
      ],
      exitCode: 0,
    }
  }

  if (result.kind === 'add') {
    return { lines: [`added ${result.id} (${result.surface}) -> ${result.destDir} (${result.fileCount} file(s))`], exitCode: 0 }
  }

  // diff
  if (result.status === 'not-installed') return { lines: [`${result.id} is not installed`], exitCode: 0 }
  if (result.status === 'unchanged') return { lines: [`${result.id}: unchanged`], exitCode: 0 }
  return { lines: [`${result.id}: locally edited (or missing) - ${result.changedFiles.map(path => path.split('/').pop()).join(', ')}`], exitCode: 0 }
}
