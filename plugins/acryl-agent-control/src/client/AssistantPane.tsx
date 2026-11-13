/**
 * The assistant docked at the window's right edge (spec 050 D11, T013): the Claude worker tab (a Claude Code agent the Host runs, with ACRYL's tool
 * gateway, so it reaches the launcher's tools) in a column of its own, opened and closed by a window event so any screen can ask for it without importing
 * this plugin. `acryl:assistant` with `{ open?, cwd? }`: `open` false closes it, anything else opens it; `cwd` is the folder the agent starts in when none is
 * saved yet (the launcher gives its apps folder). What was said and which worker it is are kept in this browser, as the worker tab keeps them in a workspace.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { WorkerTab } from './worker-tab/WorkerTab.tsx'
import type { WorkersApi } from './worker-tab/workers-api.ts'
import { EMPTY_WORKER_STATE, parseWorkerState, serializeWorkerState } from './worker-tab/worker-state.ts'

export const ASSISTANT_EVENT = 'acryl:assistant'
export const ASSISTANT_STATE_KEY = 'acryl-assistant-worker'

export interface AssistantRequest {
  readonly open?: boolean
  readonly cwd?: string
}

function load(): string | undefined {
  try { return globalThis.localStorage.getItem(ASSISTANT_STATE_KEY) ?? undefined } catch { return undefined }
}

function save(state: string): void {
  try { globalThis.localStorage.setItem(ASSISTANT_STATE_KEY, state) } catch { /* not kept: the pane still works */ }
}

export function AssistantPane({ api }: { readonly api: WorkersApi }): ReactNode {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<string | undefined>(load)

  useEffect(() => {
    const onRequest = (event: Event): void => {
      const request = (event as CustomEvent<AssistantRequest | undefined>).detail ?? {}
      setOpen(request.open !== false)
      if (request.open === false || request.cwd === undefined) return
      const folder = request.cwd
      // A saved worker keeps its own folder; a fresh pane starts in the one the screen named.
      setState((saved) => {
        const current = parseWorkerState(saved)
        return current.cwd === '' && current.workerId === undefined ? serializeWorkerState({ ...EMPTY_WORKER_STATE, cwd: folder }) : saved
      })
    }
    window.addEventListener(ASSISTANT_EVENT, onRequest)
    return () => { window.removeEventListener(ASSISTANT_EVENT, onRequest) }
  }, [])

  const keep = useCallback((next: string): void => { setState(next); save(next) }, [])
  if (!open) return null
  return (
    <aside className="acrylAssistant" data-acryl-assistant="open" aria-label="Assistant">
      <header className="acrylAssistantHead">
        <strong>Assistant</strong>
        <span>Claude, with the launcher's tools</span>
        <button type="button" onClick={() => { setOpen(false) }} aria-label="Close the assistant">Close</button>
      </header>
      <div className="acrylAssistantBody"><WorkerTab state={state} api={api} setState={keep} setTitle={() => {}} /></div>
    </aside>
  )
}
