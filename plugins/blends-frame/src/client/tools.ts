/**
 * The right panel's tools, from the workspace's reusable client layers (`acryl-workspace/ui`): the live terminal sessions and the PTY, files and
 * git routes its Host half serves (run by this frame's Host, see `../index.ts`). Built once per client activation; the effect that builds it
 * releases the sessions.
 */

import {
  TerminalRegistry,
  XTERM_CSS,
  createWorkspaceFilesApi,
  createWorkspaceGitApi,
  createWorkspacePtyApi,
  type WorkspaceFilesApi,
  type WorkspaceGitApi,
  type WorkspacePtyApi,
} from 'acryl-workspace/ui'

export interface FrameTools {
  readonly terminals: TerminalRegistry
  readonly pty: WorkspacePtyApi
  readonly files: WorkspaceFilesApi
  readonly git: WorkspaceGitApi
}

/** The mockup's terminal: `.term { background: #0a0a0b; color: #cfcfd4; font-size: 12px }`. */
const TERMINAL_APPEARANCE = { background: '#0a0a0b', foreground: '#cfcfd4', fontSize: 12 }

export function createFrameTools(): FrameTools {
  return {
    terminals: new TerminalRegistry({ appearance: TERMINAL_APPEARANCE }),
    pty: createWorkspacePtyApi(),
    files: createWorkspaceFilesApi(),
    git: createWorkspaceGitApi(),
  }
}

const XTERM_STYLE_ID = 'acryl-blends-frame-xterm'

/** xterm's own stylesheet, once per page. @returns disposer, for one owning `ctx.effect`. */
export function installXtermStyles(): () => void {
  if (document.getElementById(XTERM_STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = XTERM_STYLE_ID
  style.textContent = XTERM_CSS
  ;(document.head ?? document.documentElement).appendChild(style)
  return () => { style.remove() }
}
