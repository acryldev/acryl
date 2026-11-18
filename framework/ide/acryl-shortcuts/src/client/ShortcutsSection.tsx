/**
 * Settings > Shortcuts: every keyboard shortcut, searchable, each recorded, cleared or reset in place. It reads and writes DSH's shortcut
 * service, the same store DSH's "Edit shortcuts" dialog uses.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ShortcutBinding, ShortcutCatalogEntry, ShortcutCommandId, ShortcutFixedCatalogEntry, Shortcuts } from '@acryl/ui/frame'
import { recordKey, saveBinding, shortcutGroups, type ShortcutRow } from './shortcut-rows.ts'

export interface ShortcutsSectionProps {
  readonly shortcuts: Shortcuts
}

export function ShortcutsSection({ shortcuts }: ShortcutsSectionProps) {
  // Upstream declaration: the DSH store types arrive as unknown under NodeNext (see provenance.json); the two snapshots are stated here.
  const catalog = useSyncExternalStore(shortcuts.catalog.subscribe, shortcuts.catalog.getSnapshot) as readonly ShortcutCatalogEntry[]
  const fixed = useSyncExternalStore(shortcuts.fixedCatalog.subscribe, shortcuts.fixedCatalog.getSnapshot) as readonly ShortcutFixedCatalogEntry[]
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<ShortcutCommandId | null>(null)
  const [problem, setProblem] = useState<{ readonly id: string, readonly text: string } | null>(null)
  const groups = shortcutGroups(catalog, fixed, query)
  // Upstream declaration: DSH's published types resolve as any/unknown under NodeNext (see provenance.json), so this row shape is stated here.
  const anyModified = catalog.some((entry: { readonly modified: boolean }) => entry.modified)

  useEffect(() => {
    if (recording === null) return
    let saving = false
    // On Desktop the menu's own accelerators would run the command being recorded; DSH stops them while a recorder is open.
    void shortcuts.recording(true).catch(() => { setProblem({ id: recording, text: 'Could not pause the app\'s menu shortcuts; try again.' }); setRecording(null) })
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat || saving) return
      const pressed = recordKey(event)
      if (pressed.kind === 'wait') return
      if (pressed.kind === 'cancel') { setRecording(null); return }
      saving = true
      void saveBinding(shortcuts, recording, pressed.binding).then((text) => {
        saving = false
        if (text === null) { setProblem(null); setRecording(null) } else setProblem({ id: recording, text })
      })
    }
    // Capture on the document: the shortcut being recorded must not also run, and Escape must not close Settings.
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      void shortcuts.recording(false).catch(() => { /* The window may already be closing. */ })
    }
  }, [recording, shortcuts])

  // Upstream declaration: Shortcuts['edit']'s parameter arrives as unknown (see provenance.json); the shapes the page edits with are stated once.
  type ShortcutEdit =
    | { readonly type: 'reset-all' }
    | { readonly type: 'reset', readonly id: ShortcutCommandId }
    | { readonly type: 'set', readonly id: ShortcutCommandId, readonly binding: ShortcutBinding | null }
  const edit = (operation: ShortcutEdit): void => {
    setRecording(null)
    const id = operation.type === 'reset-all' ? null : operation.id
    void shortcuts.edit(operation as Parameters<Shortcuts['edit']>[0], shortcuts.config.getSnapshot().revision).then((result: { readonly status: string }) => {
      setProblem(result.status === 'saved' || id === null ? null : { id, text: 'Could not save. Try again.' })
    })
  }

  const row = (item: ShortcutRow) => {
    const id = item.id as ShortcutCommandId
    const isRecording = recording === id
    const note = problem?.id === item.id ? problem.text : item.problem
    return (
      <li key={item.id} className="acrylShortcutsRow" data-modified={item.modified ? '' : undefined}>
        <span className="acrylShortcutsName">{item.label}</span>
        <span className="acrylShortcutsControls">
          {item.editable && item.modified && <button type="button" className="acrylShortcutsAction" onClick={() => { edit({ type: 'reset', id }) }}>Reset</button>}
          {item.editable && item.keys.length > 0 && <button type="button" className="acrylShortcutsAction" onClick={() => { edit({ type: 'set', id, binding: null }) }}>Clear</button>}
          {item.editable
            ? (
                <button
                  type="button"
                  className="acrylShortcutsKeys"
                  aria-pressed={isRecording}
                  title={isRecording ? 'Press the new shortcut; Esc cancels' : 'Click, then press a new shortcut'}
                  onClick={() => { setProblem(null); setRecording(isRecording ? null : id) }}
                >
                  {isRecording ? 'Press keys...' : <Keys keys={item.keys} />}
                </button>
              )
            : <span className="acrylShortcutsKeys" data-fixed=""><Keys keys={item.keys} /></span>}
        </span>
        {note !== null && <span className="acrylShortcutsProblem" role="alert">{note}</span>}
      </li>
    )
  }

  return (
    <div className="acrylShortcuts">
      <div className="acrylShortcutsHead">
        <h2 className="acrylShortcutsTitle">Shortcuts</h2>
        {anyModified && <button type="button" className="acrylShortcutsAction" onClick={() => { edit({ type: 'reset-all' }) }}>Restore all defaults</button>}
      </div>
      <p className="acrylShortcutsText">Click a shortcut, then press the keys you want. Esc cancels.</p>
      <input className="acrylShortcutsSearch" type="search" placeholder="Search shortcuts" aria-label="Search shortcuts" value={query} onChange={(event) => { setQuery(event.target.value) }} />
      {groups.length === 0 && <p className="acrylShortcutsText">No shortcut matches "{query}".</p>}
      {groups.map(group => (
        <section key={group.title} className="acrylShortcutsGroup">
          <h3 className="acrylShortcutsGroupTitle">{group.title}</h3>
          <ul className="acrylShortcutsList">{group.rows.map(row)}</ul>
        </section>
      ))}
    </div>
  )
}

function Keys({ keys }: { readonly keys: readonly string[] }) {
  if (keys.length === 0) return <span className="acrylShortcutsNone">Not set</span>
  return <>{keys.map((key, index) => <kbd key={`${String(index)}${key}`}>{key}</kbd>)}</>
}
