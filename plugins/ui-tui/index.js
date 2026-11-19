// acryl-ui-tui: terminal components with the same names and contracts as @acryl/ui (plugins/acryl-ui/contracts/components.json, spec 038-ui-component-library).
// Every component is a pi-tui Component: `render(width) -> string[]` (no line is ever wider than `width`: the conformance test checks 12, 24, 40, 80 and 200 columns),
// optional `handleInput(data)` for keys, and `invalidate()`. Colors come from a theme object with `color(role) -> (text) => text`; pass the CLI's `tuiTheme` service
// (`ctx.get('tuiTheme')`) so colors follow the terminal's light/dark scheme, or nothing for the built-in dark palette.
import { Input, matchesKey, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'
import { palettes } from './palette.js'

const ESC = '\x1b'
const paint = hex => {
  const n = Number.parseInt(hex.slice(1), 16)
  return text => `${ESC}[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}${ESC}[0m`
}
const bold = text => `${ESC}[1m${text}${ESC}[22m`
const underline = text => `${ESC}[4m${text}${ESC}[24m`

/** The theme used when a plugin passes none: the dark palette, static. */
export const defaultTheme = Object.freeze({ mode: 'dark', color: role => paint(palettes.dark[role] ?? palettes.dark.muted) })

const clip = (line, width) => truncateToWidth(line, Math.max(0, width))
const padEnd = (text, width) => text + ' '.repeat(Math.max(0, width - visibleWidth(text)))
/** `left` at the left edge and `right` at the right edge of `width` columns; the left side yields when they do not both fit. */
function spread(left, right, width) {
  const rightWidth = visibleWidth(right)
  if (rightWidth >= width) return clip(right, width)
  const room = width - rightWidth - 1
  const shown = clip(left, room)
  return `${shown}${' '.repeat(Math.max(1, width - visibleWidth(shown) - rightWidth))}${right}`
}
const asComponent = part => (typeof part === 'string' ? { render: width => (part === '' ? [''] : part.split('\n').map(line => clip(line, width))), invalidate() {} } : part)
const lines = (part, width) => asComponent(part).render(width)

/** Build the component set for a theme. */
export function createTuiUi(theme = defaultTheme) {
  const c = role => theme.color(role)
  const muted = text => c('muted')(text)

  // Children are stacked; keys go to the child at `focus` (an index or a function returning one) when it handles input.
  function Stack({ children = [], gap = 0, focus = 0 } = {}) {
    const parts = () => children.map(asComponent)
    return {
      render(width) {
        const out = []
        parts().forEach((part, index) => {
          if (index > 0) for (let i = 0; i < gap; i += 1) out.push('')
          out.push(...part.render(width))
        })
        return out
      },
      handleInput(data) {
        const index = typeof focus === 'function' ? focus() : focus
        return parts()[index]?.handleInput?.(data)
      },
      invalidate() { for (const part of parts()) part.invalidate?.() },
    }
  }

  // A bordered box with an optional title and footer. Too narrow for a border (under 8 columns) it degrades to plain lines, never overflows.
  function Card({ title, body = [], footer } = {}) {
    const inner = asComponent(Stack({ children: Array.isArray(body) ? body : [body] }))
    return {
      render(width) {
        if (width < 8) return [...(title ? [clip(bold(title), width)] : []), ...inner.render(width)].map(line => clip(line, width))
        const border = c('muted')
        const room = width - 4
        const head = title ? ` ${bold(title)} ` : ''
        const top = `${border('╭─')}${head}${border('─'.repeat(Math.max(0, width - 3 - visibleWidth(head))) + '╮')}`
        const row = text => `${border('│')} ${padEnd(clip(text, room), room)} ${border('│')}`
        const out = [clip(top, width), ...inner.render(room).map(row)]
        if (footer) for (const line of lines(footer, room)) out.push(row(' '.repeat(Math.max(0, room - visibleWidth(line))) + line))
        out.push(border(`╰${'─'.repeat(width - 2)}╯`))
        return out.map(line => clip(line, width))
      },
      handleInput(data) { return inner.handleInput?.(data) },
      invalidate() { inner.invalidate?.() },
    }
  }

  // A labelled text input (pi-tui Input) with a hint, or an error that replaces the hint.
  function Field({ label, value = '', hint, error, onChange, onSubmit } = {}) {
    const input = new Input()
    input.setValue?.(value)
    input.onSubmit = text => onSubmit?.(text)
    return {
      input,
      get value() { return input.getValue?.() ?? '' },
      setValue(next) { input.setValue?.(next) },
      setError(next) { error = next },
      render(width) {
        const out = [clip(c('primary')(label), width), ...input.render(Math.max(1, width))]
        const note = error ? c('error')(error) : hint ? muted(hint) : ''
        if (note) out.push(clip(note, width))
        return out.map(line => clip(line, width))
      },
      handleInput(data) { input.handleInput?.(data); onChange?.(input.getValue?.() ?? '') },
      invalidate() { input.invalidate?.() },
    }
  }

  // Label (and a dim description) on the left, one control on the right: the layout of a Settings screen.
  function SettingsRow({ label, description, control = '', focused = false } = {}) {
    const control_ = asComponent(control)
    return {
      setFocused(next) { focused = next },
      render(width) {
        const right = (control_.render(Math.max(1, Math.floor(width / 2)))[0] ?? '')
        const out = [spread(`${focused ? c('primary')('› ') : '  '}${label}`, right, width)]
        if (description) out.push(clip(muted(description), width))
        return out
      },
      handleInput(data) { return control_.handleInput?.(data) },
      invalidate() { control_.invalidate?.() },
    }
  }

  // Cycle through a few options with left/right (the terminal counterpart of a dropdown for a short list).
  function SelectField({ options = [], value, onChange, label } = {}) {
    const index = () => Math.max(0, options.findIndex(o => o.id === value))
    const move = step => { const next = options[(index() + step + options.length) % options.length]; if (next) { value = next.id; onChange?.(next.id) } }
    return {
      render(width) {
        const current = options[index()]
        return [clip(`${label ? `${label} ` : ''}${c('muted')('‹')} ${bold(current ? current.label : '')} ${c('muted')('›')}`, width)]
      },
      handleInput(data) {
        if (matchesKey(data, 'right')) { move(1); return true }
        if (matchesKey(data, 'left')) { move(-1); return true }
        return false
      },
      invalidate() {},
    }
  }

  // A row of exclusive choices; the selected one is bracketed and bold. Left/right move.
  function Segmented({ options = [], value, onChange, label } = {}) {
    const move = step => {
      const i = options.findIndex(o => o.id === value)
      const next = options[(i + step + options.length) % options.length]
      if (next) { value = next.id; onChange?.(next.id) }
    }
    return {
      render(width) {
        const body = options.map(o => (o.id === value ? c('primary')(bold(`[ ${o.label} ]`)) : muted(`  ${o.label}  `))).join(' ')
        return [clip(`${label ? `${label} ` : ''}${body}`, width)]
      },
      handleInput(data) {
        if (matchesKey(data, 'right')) { move(1); return true }
        if (matchesKey(data, 'left')) { move(-1); return true }
        return false
      },
      invalidate() {},
    }
  }

  // A tab strip with the active panel (`panel(id)` returns a component or string) below it. Left/right change the tab.
  function Tabs({ tabs = [], value, onChange, panel = () => '' } = {}) {
    const move = step => {
      const i = tabs.findIndex(t => t.id === value)
      const next = tabs[(i + step + tabs.length) % tabs.length]
      if (next) { value = next.id; onChange?.(next.id) }
    }
    return {
      render(width) {
        const strip = tabs.map(t => (t.id === value ? c('primary')(underline(bold(t.label))) : muted(t.label))).join('   ')
        return [clip(strip, width), clip(c('muted')('─'.repeat(width)), width), ...lines(panel(value), width)]
      },
      // Tab and Shift+Tab always switch tabs. Arrows go to the active panel first (its controls use them) and switch tabs only when the panel leaves them unhandled.
      handleInput(data) {
        if (matchesKey(data, 'tab')) { move(1); return true }
        if (matchesKey(data, 'shift+tab')) { move(-1); return true }
        if (asComponent(panel(value)).handleInput?.(data)) return true
        if (matchesKey(data, 'right')) { move(1); return true }
        if (matchesKey(data, 'left')) { move(-1); return true }
        return false
      },
      invalidate() {},
    }
  }

  // A checkbox row: space or enter toggles.
  function SwitchField({ label, checked = false, onChange, hint } = {}) {
    return {
      render(width) {
        const out = [clip(`${checked ? c('success')('[x]') : muted('[ ]')} ${label}`, width)]
        if (hint) out.push(clip(muted(`    ${hint}`), width))
        return out
      },
      handleInput(data) {
        if (data === ' ' || matchesKey(data, 'enter')) { checked = !checked; onChange?.(checked); return true }
        return false
      },
      invalidate() {},
    }
  }

  function EmptyState({ title, description } = {}) {
    return { render: width => ['', clip(bold(title), width), ...(description ? [clip(muted(description), width)] : []), ''], invalidate() {} }
  }

  // A confirm dialog: y or enter confirms, n or escape cancels.
  function Dialog({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', onConfirm, onCancel, danger = false } = {}) {
    const card = Card({ title, body: [message], footer: `${c(danger ? 'error' : 'primary')(`[y] ${confirmLabel}`)}   ${muted(`[n] ${cancelLabel}`)}` })
    return {
      render: width => card.render(width),
      handleInput(data) {
        if (data === 'y' || matchesKey(data, 'enter')) { onConfirm?.(); return true }
        if (data === 'n' || matchesKey(data, 'escape')) { onCancel?.(); return true }
        return false
      },
      invalidate() {},
    }
  }

  return { Stack, Card, Field, SettingsRow, SelectField, Segmented, Tabs, SwitchField, EmptyState, Dialog }
}

export const { Stack, Card, Field, SettingsRow, SelectField, Segmented, Tabs, SwitchField, EmptyState, Dialog } = createTuiUi()
