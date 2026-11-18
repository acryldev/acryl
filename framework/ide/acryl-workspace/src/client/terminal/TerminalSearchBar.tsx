/** The search box over a terminal: type to find, Enter for the next match, Shift+Enter for the previous, Escape to close. */

import { useEffect, useRef, useState } from 'react'
import type { TerminalSession } from './terminal-session.ts'

export interface TerminalSearchBarProps {
  readonly session: TerminalSession
  onClose(): void
}

export function TerminalSearchBar({ session, onClose }: TerminalSearchBarProps) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({ position: 0, total: 0 })
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  useEffect(() => () => { session.clearSearch() }, [session])

  const find = (direction: 1 | -1): void => { setResult(query === '' ? { position: 0, total: 0 } : session.search(query, direction)) }
  return (
    <div className="dshWorkspaceTermSearch" role="search" aria-label="Search the terminal">
      <input
        ref={input}
        aria-label="Find in terminal"
        placeholder="Find in terminal"
        value={query}
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          setResult(next === '' ? { position: 0, total: 0 } : session.search(next, 1))
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); find(event.shiftKey ? -1 : 1) }
          else if (event.key === 'Escape') { event.preventDefault(); onClose() }
        }}
      />
      <span className="dshWorkspaceTermSearchCount" aria-live="polite">{query === '' ? '' : result.total === 0 ? 'No matches' : `${String(result.position)} of ${String(result.total)}`}</span>
      <button type="button" aria-label="Previous match" onClick={() => { find(-1) }}>↑</button>
      <button type="button" aria-label="Next match" onClick={() => { find(1) }}>↓</button>
      <button type="button" aria-label="Close search" onClick={onClose}>×</button>
    </div>
  )
}
