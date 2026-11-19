/**
 * The first start of a desktop product asks one thing, in the app's own window: "Name your app" (app-storage.md, "What the person sees"). The product's
 * name for its starting app is offered and selected, so Enter keeps it and typing replaces it. Once the person answers, the app is named and this never
 * shows again; Settings > App renames it later. Drawn in the frame's overlay, over the frame, in the look of its Settings dialog.
 */

import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DesktopApp } from './desktop-app.ts'

export interface NameYourAppInjected {
  readonly app: DesktopApp
}

export function NameYourApp({ app }: NameYourAppInjected) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot)
  const [name, setName] = useState<string | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const input = useRef<HTMLInputElement | null>(null)
  const card = useRef<HTMLFormElement | null>(null)

  useEffect(() => { void app.refresh().catch(() => {}) }, [app])
  const asking = state !== undefined && !state.named
  useEffect(() => {
    if (!asking) return
    setName(current => current ?? state.name)
    // The chat's composer takes the focus as the frame starts; the question keeps it until it is answered, so Enter never sends a chat message.
    const keep = (event: FocusEvent) => {
      if (event.target instanceof Node && card.current?.contains(event.target) !== true) input.current?.focus()
    }
    document.addEventListener('focusin', keep)
    const first = window.setTimeout(() => {
      input.current?.focus()
      input.current?.select()
    }, 0)
    return () => {
      document.removeEventListener('focusin', keep)
      window.clearTimeout(first)
    }
  }, [asking])

  if (!asking) return null
  const value = name ?? state.name

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (saving || value.trim() === '') return
    setSaving(true)
    setFailure(undefined)
    app.rename(value).then(
      () => { setSaving(false) },
      (cause: unknown) => {
        setSaving(false)
        setFailure(cause instanceof Error ? cause.message : String(cause))
      },
    )
  }

  return (
    <div className="acrylBlendsNameApp">
      <form ref={card} className="acrylBlendsNameAppCard" role="dialog" aria-modal="true" aria-labelledby="acryl-blends-name-app" onSubmit={submit}>
        <h2 id="acryl-blends-name-app">Name your app</h2>
        <p>You build it here, in the chat. The name is only a label: you can change it any time in Settings, App.</p>
        <input
          ref={input}
          className="acrylBlendsSearch"
          aria-label="App name"
          maxLength={80}
          autoFocus
          value={value}
          onChange={(event) => { setName(event.target.value) }}
        />
        {failure !== undefined && <p className="acrylBlendsNote" data-error role="alert">{failure}</p>}
        <div className="acrylBlendsNameAppActions">
          <button type="submit" className="acrylBlendsAppButton" data-primary disabled={saving || value.trim() === ''}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}
