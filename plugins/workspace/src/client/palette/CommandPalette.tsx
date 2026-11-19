/**
 * The command palette: a search box over everything ACRYL can do. Type to filter, arrow keys to move, Enter to
 * run, Tab to switch what is searched (all, commands, file names, file contents), Escape to close.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { matchIndexes } from './fuzzy.ts'
import { SCOPE_LABELS, PALETTE_SCOPES, type PaletteState } from './palette-state.ts'

function Highlighted({ text, query }: { readonly text: string; readonly query: string }) {
  const hits = new Set(matchIndexes(query, text))
  if (hits.size === 0) return <>{text}</>
  return <>{[...text].map((char, index) => (hits.has(index) ? <mark key={index} className="dshPaletteMark">{char}</mark> : char))}</>
}

export interface CommandPaletteProps {
  readonly palette: PaletteState
}

export function CommandPalette({ palette }: CommandPaletteProps) {
  const snapshot = useSyncExternalStore(palette.subscribe, palette.getSnapshot)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (snapshot.open) inputRef.current?.focus() }, [snapshot.open])
  useEffect(() => { selectedRef.current?.scrollIntoView?.({ block: 'nearest' }) }, [snapshot.selected, snapshot.open])
  if (!snapshot.open) return null

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown') { event.preventDefault(); palette.move(1) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); palette.move(-1) }
    else if (event.key === 'Enter') { event.preventDefault(); palette.runSelected() }
    else if (event.key === 'Escape') { event.preventDefault(); palette.close() }
    else if (event.key === 'Tab') { event.preventDefault(); palette.cycleScope(event.shiftKey ? -1 : 1) }
  }
  let index = -1
  return (
    <div className="dshPaletteOverlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) palette.close() }}>
      <div className="dshPalette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="dshPaletteScopes" role="tablist" aria-label="What to search">
          {PALETTE_SCOPES.map(scope => (
            <button key={scope} type="button" role="tab" aria-selected={snapshot.scope === scope} className="dshPaletteScope" onClick={() => { palette.setScope(scope); inputRef.current?.focus() }}>
              {SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
        <input
          ref={inputRef}
          className="dshPaletteInput"
          role="combobox"
          aria-expanded="true"
          aria-controls="dsh-palette-list"
          aria-label="Type a command or search"
          placeholder="Type a command or search..."
          value={snapshot.query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => { palette.setQuery(event.target.value) }}
        />
        <div className="dshPaletteList" id="dsh-palette-list" role="listbox">
          {snapshot.flat.length === 0 && <div className="dshPaletteEmpty">{snapshot.searching ? 'Searching...' : 'Nothing matches.'}</div>}
          {snapshot.sections.map(section => (
            <div key={section.group} role="group" aria-label={section.label}>
              <div className="dshPaletteGroup">{section.label}</div>
              {section.items.map((item) => {
                index += 1
                const position = index
                const selected = position === snapshot.selected
                return (
                  <div
                    key={item.id}
                    ref={selected ? selectedRef : undefined}
                    role="option"
                    aria-selected={selected}
                    className="dshPaletteItem"
                    data-selected={selected || undefined}
                    onPointerMove={() => { palette.select(position) }}
                    onClick={() => { palette.runAt(position) }}
                  >
                    <span className="dshPaletteTitle"><Highlighted text={item.title} query={snapshot.query} /></span>
                    {item.subtitle !== undefined && item.subtitle !== '' && <span className="dshPaletteSubtitle">{item.subtitle}</span>}
                    {item.shortcut !== undefined && <kbd className="dshPaletteKey">{item.shortcut}</kbd>}
                  </div>
                )
              })}
            </div>
          ))}
          {snapshot.searching && snapshot.flat.length > 0 && <div className="dshPaletteEmpty">Searching files...</div>}
        </div>
        <div className="dshPaletteFooter">
          <span><kbd className="dshPaletteKey">↑↓</kbd> Navigate</span>
          <span><kbd className="dshPaletteKey">Enter</kbd> Open</span>
          <span><kbd className="dshPaletteKey">Tab</kbd> Next scope</span>
          <span><kbd className="dshPaletteKey">Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  )
}
