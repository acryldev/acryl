# Data model: ACRYL UI library

Shapes are TypeScript for precision; each is validated at its boundary with a Schemastery schema, never trusted as a cast.

## Token source (`tokens.json`)

```ts
interface TokenSource {
  schemaVersion: 1
  themes: Record<'light' | 'dark', Record<SemanticToken, TokenValue>>
  scales: { radius: number[]; spacing: number[]; fontRoles: Record<'ui' | 'mono' | 'heading', string> }
  terminal: Record<TerminalRole, string>          // 24-bit hex per role: primary secondary accent reasoning success warning error info muted
  mapping: { web: Record<SemanticToken, string[]>; } // semantic token -> --dsw-alias-* names it drives
}
type SemanticToken = 'surface' | 'surfaceRaised' | 'text' | 'textMuted' | 'border' | 'accent' | 'accentText' | 'success' | 'warning' | 'error' | 'info'
type TokenValue = string   // CSS color
```

Compiler outputs: a `ThemeDefinition` per mode for `ctx.theme.register`, a `ThemeTokenOverrides` for `overrideTokens`, and a `TerminalPalette`.

## Component contract

```ts
interface ComponentContract {
  id: string                                  // 'board', 'button', 'dialog'
  version: string                             // semver of this contract
  surfaces: Array<'web' | 'desktop' | 'tui'>  // where it is implemented
  props: ObjectSchema                         // Schemastery, JSON-serializable, no functions except declared events
  events: Record<string, ObjectSchema>        // e.g. select, change, confirm
  states: string[]                            // default, focused, disabled, loading, error, empty
  slots?: string[]                            // children regions ('header', 'footer')
  a11y: { role?: string; keyboard: string[]; notes?: string }
  tui?: { minWidth: number; keys: Record<string, string> }
  examples: Array<{ name: string; props: unknown }>
}
```

## Terminal theme service

```ts
interface TuiThemeService {
  get(): TuiThemeSnapshot                     // { preference, active: { id, scheme, palette }, revision }
  register(theme: { id: string; scheme: 'light' | 'dark'; palette: Partial<TerminalPalette> }): () => void
  overrideTokens(sourceId: string, palette: Partial<TerminalPalette>): () => void
  fg(role: TerminalRole): (text: string) => string
  on(event: 'change', listener: (snapshot: TuiThemeSnapshot) => void): () => void
}
```

## Conformance report

```ts
interface ConformanceReport {
  component: string; surface: 'web' | 'desktop' | 'tui'; libraryVersion: string
  contractValid: boolean
  states: Array<{ state: string; rendered: boolean; snapshot: string }>
  widths?: Array<{ columns: number; maxLineWidth: number; ok: boolean }>   // tui
  contrast?: Array<{ pair: [SemanticToken, SemanticToken]; mode: 'light' | 'dark'; ratio: number; ok: boolean }>  // web
  keyboard: Array<{ key: string; expected: string; ok: boolean }>
  ok: boolean
}
```
