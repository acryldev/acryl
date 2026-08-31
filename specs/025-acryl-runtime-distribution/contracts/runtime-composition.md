# Runtime Composition Contract

## Purpose

A surface requests one normal ACRYL runtime composition. The shared composition layer owns profile preparation, common ACRYL rows, ordered patch assembly, root boot, and root disposal. A surface provides only its transport and platform adapters.

## Surface request

```ts
export type AcrylSurface = 'tui' | 'web' | 'desktop'

export interface BootAcrylRuntimeOptions {
  readonly profile: string
  readonly surface: AcrylSurface
  readonly capabilities: readonly string[]
  readonly cmdlineArgs?: readonly string[]
  readonly prepare?: (ctx: Context) => Promise<void> | void
}

export interface AcrylRuntime {
  readonly ctx: Context
  readonly profileDirectory: string
  readonly surface: AcrylSurface
  dispose(): Promise<void>
}
```

## Invariants

- A composition creates one Cordis root and one generation-scoped capability graph.
- Common runtime rows are composed exactly once.
- A surface adapter does not import a concrete provider from another surface.
- `prepare()` is part of the owning activation and must not leave resources outside a Fiber-owned disposer.
- Disposal is idempotent and reaches root quiescence.

## Session client contract

```ts
export interface AcrylSessionClient {
  open(resumeSessionId?: string): Promise<string>
  events(sessionId: string): readonly SessionEvent[]
  subscribeEvents(sessionId: string, listener: (event: SessionEvent) => void): Promise<{ dispose(): Promise<void> }>
  submitPrompt(input: { readonly sessionId: string; readonly text: string }): Promise<void>
  cancel(sessionId: string): Promise<void>
  dispose(): Promise<void>
}
```

Direct TUI and remote clients implement this interface without receiving a raw Cordis `Context`.
