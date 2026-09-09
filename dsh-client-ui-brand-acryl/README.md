# dsh-client-ui-brand-acryl

ACRYL brand occupants for the DSH Web client's sidebar and conversation-hero
slots (`sidebar.brand.mark`, `sidebar.brand.name`,
`conversation.hero.brand.mark`) - the swappable counterpart to
[`@deepseek-ai/dsh-client-ui-brand-official`](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-brand-official).

## Why this package exists

Both packages occupy the identical slot contract declared by
`@deepseek-ai/dsh-client-ui-sidebar` and `@deepseek-ai/dsh-client-ui-conversation`.
Neither patches the other; a host selects brand identity purely through its
own Loader composition - enable exactly one row, disable the other. This is
the first proof-of-concept slice of ACRYL's broader "swappable Cordis
provider" pattern (see `specs/028-harness-engine-swap` for the larger
interchangeable-engine ledger this pattern extends toward).

## Use this package

Compose it as a Loader row alongside (never instead of) the row it swaps
against:

```yaml
- id: ui-brand-official
  name: '@deepseek-ai/dsh-client-ui-brand-official'
  disabled: true

- id: ui-brand-acryl
  name: dsh-client-ui-brand-acryl
```

`acryl-desktop/src/profile.ts` composes exactly this pair, selected by its
own `DESKTOP_BRAND` constant - see `assertUniqueEntryIds`/`composeEntries`
in that package's tests for the verified row shape.

## Source of the logo assets

The two source PNGs (`acryl-logo.png` / `acryl-logo-white.png`, 974x974,
transparent) live at the workspace root and are the same single source of
truth `acryl-desktop` reads for its native app icon and tray artwork.
`pnpm run generate:logo` embeds them as base64 data URLs in
`src/client/acryl-logo-data.ts` (generated - do not edit manually); `pnpm run
build` and `pnpm run typecheck` both run it first.

## Known limitations

This is a first-slice proof of concept, not the final shape:

- The brand selection is a build-time composition constant
  (`acryl-desktop`'s `DESKTOP_BRAND`), not a live Settings-driven toggle.
  HOT-swapping brand identity at runtime (matching the `/reload` pattern
  `specs/028-harness-engine-swap` designs for the engine itself) is a
  follow-up once this composition-level swap is validated.
- Only `acryl-desktop` composes this package today; `acryl-web` still ships
  with `dsh-client-ui-brand-official` unconditionally enabled (the DSH
  default) and has not adopted the swap.
