/** Adapts this package's own terminal dock to `acryl-app-shell`'s generic column-wrapper hooks - the shell
 * has no concept of a dock, only that a caller may want to wrap a column (see `AdvancedShellHooks`). */

import type { AdvancedShellHooks } from 'acryl-app-shell/client'
import { CenterColumn, RightColumn } from './DockColumns.tsx'
import type { DockHost } from './dock-host.ts'

/** @param dock - undefined when this surface has no terminal panel (TUI, or Desktop before the first PTY). */
export function dockShellHooks(dock: DockHost | undefined): AdvancedShellHooks {
  if (dock === undefined) return {}
  return {
    wrapMain: content => <CenterColumn host={dock}>{content}</CenterColumn>,
    wrapRightbar: content => <RightColumn host={dock} rightbar={content} />,
  }
}
