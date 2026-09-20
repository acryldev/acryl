// Example: tui-overlay.themed
// Type:     tui-contribution (pi-tui components and a palette)
// Surfaces: tui (a no-op elsewhere)
// Teaches:  build terminal UI from pi-tui components with your OWN semantic palette. A pi-tui Component is an object with
//           `render(width): string[]` (one string per line, NEVER wider than `width`: pad or `truncateToWidth`),
//           optional `handleInput(keyData)`, and `invalidate()`. Compose the built-ins (`Container`, `Text`, `SelectList`,
//           `Box`, `Markdown`, `Input`, `Editor`, `ScrollView`...). Colors are ANSI functions (`fg(hex)` below); keep them in
//           one PALETTE object so the look changes in one place. The terminal owns its background: color foregrounds only.
//           The CLI's own palette is compiled into the app and NOT readable by a plugin, so a plugin carries its own.
// Expect:   `/themed` opens a small centered popup with a colored title and a list; Enter or Esc closes it.
// Docs:     extending.tui-components
// Pattern:  apps/acryl-cli/src/tui/piTheme.ts and tui/theme.ts (the same shape), tui-commands-service.ts (open/close)
import { Container, SelectList, Text, truncateToWidth } from '@earendil-works/pi-tui'

export const name = 'acryl-example-tui-themed'

/** Semantic palette: change the look here, nowhere else. */
export const PALETTE = { primary: '#ff922b', muted: '#94a3b8', success: '#34d399' }

export const fg = hex => {
  const n = Number.parseInt(hex.slice(1), 16)
  return text => `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}\x1b[0m`
}
const bold = text => `\x1b[1m${text}\x1b[0m`

const selectTheme = {
  selectedPrefix: fg(PALETTE.primary),
  selectedText: text => bold(fg(PALETTE.primary)(text)),
  description: fg(PALETTE.muted),
  scrollInfo: fg(PALETTE.muted),
  noMatch: fg(PALETTE.muted),
}

/** Build the popup component. Exported so it can be rendered and width-checked without a terminal. */
export function buildOverlay(close) {
  const list = new SelectList([
    { value: 'a', label: 'First item', description: 'the first thing' },
    { value: 'b', label: 'Second item', description: 'the second thing' },
    { value: 'c', label: 'A third item with a rather long label that must never overflow', description: 'long' },
  ], 5, selectTheme)
  list.onSelect = () => close()
  list.onCancel = () => close()
  const root = new Container()
  root.addChild(new Text(bold(fg(PALETTE.primary)('Themed overlay')), 1, 0))
  root.addChild(list)
  root.addChild(new Text(fg(PALETTE.muted)('up/down choose, enter select, esc close'), 1, 0))
  return {
    // Defensive: no line may exceed the terminal width, whatever a child does.
    render: width => root.render(width).map(line => truncateToWidth(line, width)),
    handleInput: data => list.handleInput(data),
    invalidate: () => root.invalidate(),
  }
}

export function apply(ctx) {
  const commands = ctx.get('tuiCommands') // undefined outside the CLI: fine
  if (!commands) return
  ctx.effect(() => commands.register({
    command: '/themed',
    description: 'Themed pi-tui overlay (example plugin)',
    packageName: 'acryl-example-tui-themed',
    overlay: { width: '60%', anchor: 'center', margin: 2 },
    open: ({ close }) => buildOverlay(close),
  }), 'acryl-example-tui-themed: /themed')
}
