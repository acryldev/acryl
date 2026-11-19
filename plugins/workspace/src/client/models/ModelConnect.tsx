/**
 * The first-run card inside the chat surface: paste an API key, stored by DeepSeek Harness itself. Non-modal, in
 * ACRYL's design, and dismissible; the Models settings page stays the place for every other provider.
 */

import { useState, useSyncExternalStore } from 'react'
import type { ModelConnectControl } from './model-connect.ts'

export interface ModelConnectProps {
  readonly control: ModelConnectControl
}

/**
 * @param props.control - the workspace's model-connection controller.
 * @returns the card while no model can serve a request, and nothing otherwise.
 */
export function ModelConnect({ control }: ModelConnectProps) {
  const state = useSyncExternalStore(control.subscribe, control.getSnapshot)
  const [key, setKey] = useState('')
  if (state.status !== 'needs-key') return null
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
