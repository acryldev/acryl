# Plugin and app

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from 'acryl-router'          // brings in the `ctx.router` type

export const name = 'notes'                  // equals the package name and the Loader row id
export const inject = ['router']             // PENDING until these services exist

export interface Config { limit: number }
export function apply(ctx: Context, config: Partial<Config> = {}): void {
  ctx.effect(() => { const t = setInterval(tick, 1000); return () => { clearInterval(t) } }, 'notes: ticker')
}
```

- `name`: required, equals the package name.
- `inject`: hard requirements; use an inner `ctx.inject([...], inner => ...)` for optional ones.
- `apply(ctx, config)`: register things; never hold resources outside `ctx.effect`.
- An "app" is a Blend: a `blend.yaml` plus a list of such plugins as Loader rows.
