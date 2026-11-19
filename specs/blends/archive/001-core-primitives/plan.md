# Plan: Core primitives

## Technical Context

TypeScript 6, ESM, `hookable@6.1.2`. Package `packages/core` (`@aimbrace/core`), built with tsdown (`platform: neutral`).

## Constitution Check

I core knows nothing: only generic primitives. VII dependency-poor: `hookable` only. V typed hooks: `Hooks<T>` generic. IV disposers: `Owner` + `DisposerStack`.

## Source layout

```text
packages/core/src/
  index.ts          public exports
  errors.ts         AimbraceError, InvalidNameError, DisposalError, DuplicateRegistryEntryError, DisposedError
  internal/name.ts  assertName
  service.ts        service(), ServiceToken, ValueOf
  disposable.ts     Disposer, Owner, DisposerStack
  hooks.ts          Hooks<T>, ScopedHooks
  registry.ts       registry(), RegistryToken, RegistryStore, Registry view, RegistryEvent
packages/core/test/ one test file per module plus types.test.ts
```

## Design notes

- `Owner` decouples lifetime from Cordis. In M3 the plugin context implements `Owner.own` with `fiber.effect`.
- `Hooks` wraps `Hookable` and keeps its own per-name counters because Hookable's table is private.
- `RegistryStore` takes an optional `onChange` so the App can fan registry events into the typed hook map.
- Repo-wide: tsconfig `paths` and a vitest alias let packages import each other from source during development; builds still produce `dist`.
