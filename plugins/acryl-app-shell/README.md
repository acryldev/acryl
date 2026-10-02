# acryl-app-shell

The generic three-column desktop/web app frame — sidebar column, main surface, resizable details column,
platform title-bar spacing, theme presentation — extracted from `plugins/acryl-workspace`'s own `shell/`
so it can be shared: any Blend's domain plugin claims it for its own main UI, through the same
`desktop.main` / `desktop.sidebar` slot contract `acryl-workspace` already uses for the IDE.

## Why this package exists

A Project Blend grown from a Blueprint is meant to become one cohesive, standalone product — not a chat
with a side feature reached by a link to a server-routed page. `plugins/acryl-workspace` already proves
the right shape: it's a plugin that claims the main UI surface (`desktop.main`, the tree in
`desktop.sidebar`) and replaces Blank's plain chat with the whole IDE — tree, tabs, terminals, canvases.
That's one differentiated product grown from the same stem cell. A different domain (GTD, accounting,
whatever a team needs) wants the exact same mechanism with completely different content in the main slot
— not PTYs and a file tree, but its own board, its own forms, its own views.

Before this package existed, that wiring (claiming `root`, `desktop.main`, `desktop.sidebar`, the layout
service, the theme presenter, the resizable three-column chrome) lived only inside `acryl-workspace`,
coupled to nothing IDE-specific in its own code but physically impossible to reuse without copying it.
This package is exactly that code, moved out, with its one IDE-specific dependency (the terminal dock)
replaced by two generic optional wrapper hooks (`wrapMain`, `wrapRightbar`) a caller supplies if it wants
extra chrome around a column — this package has no idea what a terminal dock is, only that a caller may
want to wrap a column.

See `specs/036-cordis-ecosystem-and-acryl-blends/blend-instance-design.md` section 0 for the full design
reasoning, including the mistake this exists to stop repeating: a domain plugin's own UI as a Host-served
page reached by a chat-card link, instead of a real main-surface plugin.

## Using it

```ts
import { applyAdvancedShell, resolveShellEnvironment } from 'acryl-app-shell/client'

export function apply(ctx: ClientContext): void {
  const environment = resolveShellEnvironment(window.location.hash)
  if (environment.mode !== 'advanced') return // compatibility mode keeps the stock upstream frame
  applyAdvancedShell(ctx, environment)

  // Claim the main surface with your own UI - the same pattern acryl-workspace uses for the IDE.
  ctx.slots.inject('desktop.main', () => ctx.slots.register({
    name: 'desktop.main',
    priority: 200, // higher than the shell's own fallback (100)
  }, MyDomainMainSurface))
}
```

No Host-side module does anything (`src/index.ts` exists only so the Loader row has a real module to
activate/dispose) — this is pure client-side layout.
