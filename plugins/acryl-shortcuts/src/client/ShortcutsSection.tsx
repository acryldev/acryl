import { useCallback, useEffect, useState } from 'react'
import { describeCombo, formatCombo } from './combo.ts'
import type { ShortcutAction, ShortcutsRegistry } from './shortcuts-service.ts'

interface ShortcutsSectionProps {
  /** Standard settings-section owner share (close is unused here - this page has no exit flow of its own). */
  close: () => void
  /** Injected by the registrant's `inject()`. */
  shortcuts: ShortcutsRegistry
}

function Row({ action, combo, onCapture, onReset }: {
  action: ShortcutAction
  combo: string
  onCapture: (combo: string) => void
  onReset: () => void
}) {
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    if (!capturing) return
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') { setCapturing(false); return }
      const next = formatCombo(event)
      if (next === null) return // a bare modifier - keep waiting for a real key
      onCapture(next)
      setCapturing(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => { window.removeEventListener('keydown', onKeyDown, true) }
  }, [capturing, onCapture])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l4, #33333340)' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{action.label}</div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>{action.id}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => { setCapturing(true) }}
          style={{
            font: '12px ui-monospace, monospace',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l4, #33333340)',
            background: capturing ? '#5b7fff' : 'transparent',
            color: capturing ? '#fff' : 'inherit',
            cursor: 'pointer',
            minWidth: 90,
          }}
        >
          {capturing ? 'Press keys…' : describeCombo(combo)}
        </button>
        {combo !== action.defaultCombo && (
          <button type="button" onClick={onReset} title="Reset to default" style={{ border: 'none', background: 'none', cursor: 'pointer', opacity: 0.6, font: '11px sans-serif' }}>
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Settings page listing every registered shortcut with an editable combo per row. Registered via
 * `settings.section`; the shell renders no chrome of its own beyond the modal, so this page owns
 * its heading, list, and (via `Row`) its own key-capture UI.
 */
export function ShortcutsSection({ shortcuts }: ShortcutsSectionProps) {
  const [, forceUpdate] = useState(0)
  useEffect(() => shortcuts.subscribe(() => { forceUpdate(n => n + 1) }), [shortcuts])

  const actions = shortcuts.list()
  const handleCapture = useCallback((id: string, combo: string) => {
    void shortcuts.setCombo(id, combo)
  }, [shortcuts])
  const handleReset = useCallback((id: string) => {
    void shortcuts.resetCombo(id)
  }, [shortcuts])
  const anyCustomized = actions.some(action => shortcuts.getCombo(action.id) !== action.defaultCombo)

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 4px' }}>Shortcuts</h2>
        {anyCustomized && (
          <button
            type="button"
            onClick={() => { void shortcuts.resetAll() }}
            title="Reset every shortcut back to its default - a safety net if a reassignment left things unworkable"
            style={{
              font: '12px ui-sans-serif, system-ui, sans-serif',
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l4, #33333340)',
              background: 'transparent',
              color: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Reset to defaults
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 16px' }}>
        Every tool that registers a shortcut is listed here. Click a combo to reassign it.
      </p>
      {actions.length === 0 && (
        <p style={{ fontSize: 12, opacity: 0.6 }}>No shortcuts registered yet.</p>
      )}
      {actions.map(action => (
        <Row
          key={action.id}
          action={action}
          combo={shortcuts.getCombo(action.id)}
          onCapture={(combo) => { handleCapture(action.id, combo) }}
          onReset={() => { handleReset(action.id) }}
        />
      ))}
    </div>
  )
}
