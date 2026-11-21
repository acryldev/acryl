/**
 * The first-run card inside the chat surface: paste an API key, stored by DeepSeek Harness itself. Non-modal, in
 * ACRYL's design, and dismissible; the Models settings page stays the place for every other provider.
 */

import { useState, useSyncExternalStore } from 'react'
import type { ModelConnectControl } from './model-connect.ts'

/** Set on the page by the sign-in plugin's first-run dialog while it is open (plugins/sign-in, ConnectChoice.tsx); that dialog asks for the key itself. */
export const CONNECT_DIALOG_ATTRIBUTE = 'data-acryl-connect-dialog'

function watchConnectDialog(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [CONNECT_DIALOG_ATTRIBUTE] })
  return () => { observer.disconnect() }
}
const connectDialogOpen = (): boolean => document.documentElement.hasAttribute(CONNECT_DIALOG_ATTRIBUTE)

export interface ModelConnectProps {
  readonly control: ModelConnectControl
}

/**
 * @param props.control - the workspace's model-connection controller.
 * @returns the card while no model can serve a request and the first-run dialog is not open, and nothing otherwise.
 */
export function ModelConnect({ control }: ModelConnectProps) {
  const state = useSyncExternalStore(control.subscribe, control.getSnapshot)
  const dialogOpen = useSyncExternalStore(watchConnectDialog, connectDialogOpen, () => false)
  const [key, setKey] = useState('')
  if (state.status !== 'needs-key' || dialogOpen) return null
  return (
    <section className="dshWorkspaceConnect" aria-label="Connect a model">
      <div className="dshWorkspaceConnectHead">
        <span className="dshWorkspaceConnectTitle">Connect a model</span>
      </div>
      <p className="dshWorkspaceConnectText">
        Add a DeepSeek API key to start chatting. DeepSeek Harness stores it; the app folder never does.
      </p>
      <form
        className="dshWorkspaceConnectForm"
        onSubmit={(event) => {
          event.preventDefault()
          if (state.busy) return
          void control.connect(key).then(() => {
            if (control.getSnapshot().status === 'ready') setKey('')
          })
        }}
      >
        <input
          className="dshWorkspaceConnectInput"
          type="password"
          aria-label="API key"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste your API key"
          value={key}
          disabled={state.busy}
          onChange={(event) => { setKey(event.target.value) }}
        />
        <button className="dshWorkspaceConnectAction" type="submit" disabled={state.busy || key.trim() === ''}>
          {state.busy ? 'Connecting...' : 'Connect'}
        </button>
        <button className="dshWorkspaceConnectLink" type="button" onClick={() => { control.openSettings() }}>
          Settings
        </button>
        <button className="dshWorkspaceConnectLink" type="button" onClick={() => { control.dismiss() }}>
          Not now
        </button>
      </form>
      {state.error !== null && <p className="dshWorkspaceConnectError" role="alert">{state.error}</p>}
    </section>
  )
}
