/** The notice stack in the workspace's corner. */

import { useEffect, useSyncExternalStore } from 'react'
import { TOAST_LIFETIME_MS, type Toast, type ToastState } from './toast-state.ts'

export function Toasts({ state, onOpen }: { readonly state: ToastState; onOpen(target: Toast['target']): void }) {
  const toasts = useSyncExternalStore(state.subscribe, state.getSnapshot)
  useEffect(() => {
    const timers = toasts.map(toast => setTimeout(() => { state.dismiss(toast.id) }, TOAST_LIFETIME_MS))
    return () => { for (const timer of timers) clearTimeout(timer) }
  }, [state, toasts])
  if (toasts.length === 0) return null
  return (
    <div className="dshWorkspaceToasts" role="region" aria-label="Notifications">
      {toasts.map(toast => (
        <div key={toast.id} className="dshWorkspaceToast" role="status">
          <span className="dshWorkspaceToastText">{toast.text}</span>
          <button type="button" className="dshWorkspaceToastOpen" onClick={() => { onOpen(toast.target); state.dismiss(toast.id) }}>Open</button>
          <button type="button" className="dshWorkspaceToastClose" aria-label="Dismiss" onClick={() => { state.dismiss(toast.id) }}>×</button>
        </div>
      ))}
    </div>
  )
}
