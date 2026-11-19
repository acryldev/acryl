/**
 * Settings > App, in a desktop product: the app's name, its folder and size, export, import, the other apps on this computer, start over, and the
 * licence of the git the product ships. Laid out as the Plugins page is (docs/design/blends-frame-mockup.html): a title, one line under it, one bordered
 * row per thing. Start over asks inside the page, and Cancel is what a stray Enter or click does.
 */

import { type FormEvent, useEffect, useState, useSyncExternalStore } from 'react'
import { type DesktopApp, type DesktopAppSize, formatSize } from './desktop-app.ts'

export interface AppSectionInjected {
  readonly app: DesktopApp
}

/** What the page is doing: one thing at a time, and what it says about it. */
type Work =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly what: 'rename' | 'export' | 'import' | 'startOver' | 'open' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }

export function AppSection({ app }: AppSectionInjected) {
  const state = useSyncExternalStore(app.subscribe, app.getSnapshot)
  const [name, setName] = useState('')
  const [size, setSize] = useState<DesktopAppSize | 'reading' | 'unknown'>('reading')
  const [withData, setWithData] = useState(false)
  const [asking, setAsking] = useState(false)
  const [work, setWork] = useState<Work>({ kind: 'idle' })

  useEffect(() => { void app.refresh().catch(() => {}) }, [app])
  useEffect(() => { if (state !== undefined) setName(state.name) }, [state?.name])
  useEffect(() => {
    let live = true
    app.size().then(
      (measured) => { if (live) setSize(measured) },
      () => { if (live) setSize('unknown') },
    )
    return () => { live = false }
  }, [app, state?.id])

  const busy = work.kind === 'busy'
  const run = async (what: Extract<Work, { kind: 'busy' }>['what'], action: () => Promise<string | undefined>) => {
    setWork({ kind: 'busy', what })
    try {
      const message = await action()
      setWork(message === undefined ? { kind: 'idle' } : { kind: 'done', message })
    } catch (cause) {
      setWork({ kind: 'failed', message: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  if (state === undefined) {
    return (
      <div className="acrylBlendsApp">
        <h3>App</h3>
        <p className="acrylBlendsNote">Reading the app…</p>
      </div>
    )
  }

  const rename = (event: FormEvent) => {
    event.preventDefault()
    if (busy || name.trim() === state.name) return
    void run('rename', async () => {
      await app.rename(name)
      return undefined
    })
  }

  return (
    <div className="acrylBlendsApp">
      <h3>App</h3>
      <p className="acrylBlendsPluginsSub">This app on this computer: its name, where it is kept, and how its work leaves the computer.</p>
      {work.kind === 'failed' && <p className="acrylBlendsNote" data-error role="alert">{work.message}</p>}
      {work.kind === 'done' && <p className="acrylBlendsNote" role="status">{work.message}</p>}

      <form className="acrylBlendsAppRow" onSubmit={rename}>
        <b>Name</b>
        <span className="acrylBlendsAppControls">
          <input className="acrylBlendsSearch acrylBlendsAppName" aria-label="App name" maxLength={80} value={name} onChange={(event) => { setName(event.target.value) }} />
          <button type="submit" className="acrylBlendsAppButton" disabled={busy || name.trim() === '' || name.trim() === state.name}>Rename</button>
        </span>
        <small>A label only: renaming never moves the app's folder.</small>
      </form>

      <div className="acrylBlendsAppRow">
        <b>Folder</b>
        <span className="acrylBlendsAppControls">
          <button type="button" className="acrylBlendsAppButton" onClick={() => { void run('open', async () => { await app.reveal(); return undefined }) }}>
            Show in {state.fileManager}
          </button>
        </span>
        <small>
          {size === 'reading' ? 'Measuring…' : size === 'unknown' ? 'The size could not be read.' : `${formatSize(size.bytes)} in ${size.files.toLocaleString()} files: the app's code, its chats and settings, and its logs.`}
        </small>
      </div>

      <div className="acrylBlendsAppRow">
        <b>Export</b>
        <span className="acrylBlendsAppControls">
          <button type="button" className="acrylBlendsAppButton" disabled={busy} onClick={() => {
            void run('export', async () => {
              const file = await app.export(withData)
              return file === undefined ? undefined : `Exported to ${file}`
            })
          }}>
            {work.kind === 'busy' && work.what === 'export' ? 'Exporting…' : 'Export…'}
          </button>
        </span>
        <small>
          One .acrylblend file with the app's code and every version, to keep or to open on another computer. Sign-ins and keys stay on this one.
          <label className="acrylBlendsAppCheck">
            <input type="checkbox" checked={withData} onChange={(event) => { setWithData(event.target.checked) }} /> Include its settings (its chats stay with it on this computer for now)
          </label>
        </small>
      </div>

      <div className="acrylBlendsAppRow">
        <b>Import</b>
        <span className="acrylBlendsAppControls">
          <button type="button" className="acrylBlendsAppButton" disabled={busy} onClick={() => { void run('import', async () => { await app.import(); return undefined }) }}>
            {work.kind === 'busy' && work.what === 'import' ? 'Opening…' : 'Import…'}
          </button>
        </span>
        <small>Opens an .acrylblend file as a new app, in this window. This app stays on this computer.</small>
      </div>

      {state.others.length > 0 && (
        <div className="acrylBlendsAppRow">
          <b>Other apps</b>
          <small>
            {state.others.map(other => (
              <span key={other.id} className="acrylBlendsAppOther">
                {other.name}
                <span className="acrylBlendsAppMade">made {new Date(other.created).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <button type="button" className="acrylBlendsShareButton" disabled={busy} onClick={() => { void run('open', async () => { await app.open(other.id); return undefined }) }}>Open</button>
              </span>
            ))}
          </small>
        </div>
      )}

      <div className="acrylBlendsAppRow">
        <b>Start over</b>
        <span className="acrylBlendsAppControls">
          <button type="button" className="acrylBlendsAppButton" data-danger disabled={busy || asking} onClick={() => { setAsking(true) }}>Start over…</button>
        </span>
        <small>
          Moves this app to the trash folder beside it (nothing is deleted) and opens a fresh {state.name}.
          {asking && (
            <span className="acrylBlendsShareAsk" role="group" aria-label="Start over">
              Start over? This app's code, versions and chats move to the trash folder.
              {/* Cancel is the default: Enter or a stray click starts nothing over. */}
              <button type="button" className="acrylBlendsShareCancel" autoFocus onClick={() => { setAsking(false) }}>Cancel</button>
              <button type="button" className="acrylBlendsShareConfirm" data-danger disabled={busy} onClick={() => {
                setAsking(false)
                void run('startOver', async () => { await app.startOver(); return undefined })
              }}>
                {work.kind === 'busy' && work.what === 'startOver' ? 'Starting over…' : 'Start over'}
              </button>
            </span>
          )}
        </small>
      </div>

      {state.git && (
        <div className="acrylBlendsAppRow">
          <b>Git</b>
          <span className="acrylBlendsAppControls">
            <button type="button" className="acrylBlendsShareButton" onClick={() => { void run('open', async () => { await app.gitLicence(); return undefined }) }}>Licence</button>
            <button type="button" className="acrylBlendsShareButton" onClick={() => { void run('open', async () => { await app.gitSource(); return undefined }) }}>Source</button>
          </span>
          <small>This app includes Git, free software under the GNU General Public License, version 2.</small>
        </div>
      )}
    </div>
  )
}
