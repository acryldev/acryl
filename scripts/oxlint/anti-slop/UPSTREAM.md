# anti-slop, vendored

- Source: [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop), `skills/install-anti-slop/assets/anti-slop/`, commit
  `d2a9aea3b896ffcb291a85f2c1301aa2543ad8c8` (2026-09-13). Verified: the installed copy is byte-identical to that commit's
  `skills/install-anti-slop/` tree (the owner's local install of the skill), and it is the newest upstream commit touching that tree
  (upstream HEAD on 2026-11-19 was `13909c9e`, with no change to it).
- Installed 2026-11-19 with the skill's own `scripts/install.mjs`, to `scripts/oxlint/anti-slop/` (ACRYL keeps its tooling in `scripts/`;
  the skill's default is `tools/oxlint/anti-slop/`). The nested `vendor/eslint-stylistic/` keeps its LICENSE and UPSTREAM.md.
- Registered in `/.oxlintrc.json` as `jsPlugins` `anti-slop` with every generic rule at `error`, plus `oxc/no-accumulating-spread`. The
  Effect plugin (`effect/`) is copied but not registered: no ACRYL package declares `effect`.

## Intentional deviations

- Oxlint's own `correctness` category is off: ACRYL adopted the anti-slop rules, not the whole default Oxlint set.
- `--disable-nested-config`: the pinned upstream submodule `deepseek-harness/` carries its own `.oxlintrc.json` (code ACRYL does not own).
- Ignored as not owned or generated: `deepseek-harness/`, build output (`lib/`, `dist/`), the framework's frozen release fixtures
  (`framework/packages/cli/legacy/`), and generator outputs (`*.generated.ts`, `contracts/generated/`, `acryl-logo-data.ts`, the favicon,
  font and TUI palette data).
- The repository had findings when the rules came in, so `pnpm run check` gates on a ratchet (`scripts/anti-slop-ratchet.mjs`, ceilings in
  `scripts/anti-slop-ceiling.json`): no rule may rise above today's count; `pnpm run lint` shows every finding.
