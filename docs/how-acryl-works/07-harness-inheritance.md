# 07 — How Every Surface Inherits the DeepSeek Harness

This file answers a deceptively simple question: **when the TUI, the web surface, or the
desktop app runs, where does the DeepSeek Harness code actually come from?** The short
answer is *published npm packages* — and the pinned `deepseek-harness/` submodule plays a
different, equally important role. Along the way this also answers: *do we have the
harness two times?* (yes, deliberately), and *does `acryl-desktop` import the submodule?*
(no — nothing does, and a layout gate enforces that).

---

## 1. The two forms of the harness

### Form A — the submodule (source, read-only)

```
deepseek-harness/          # git submodule, gitlink mode 160000
  packages/…               # the source of every @deepseek-ai/dsh-* package
```

- Pinned to one upstream commit, tracked in `upstream.json` at the repo root:

  ```json
  {
    "repository": "https://github.com/deepseek-ai/deepseek-harness.git",
    "commit": "c389f96bf3…",
    "sourceVersion": "0.1.3-alpha.2",
    "runtimePackageVersion": "0.1.1-rc.2"
  }
  ```

- Excluded from the pnpm workspace (`pnpm-workspace.yaml`: `- '!deepseek-harness/**'`)
  and from dependency resolution. It is **not importable as code** — see §4.
- Updated only through `pnpm run upstream:update` (`scripts/update-upstream.mjs`), which
  fast-forwards the checkout and rewrites `upstream.json`; `upstream:sync` /
  `upstream:install` / `upstream:build` operate inside it.

### Form B — the published npm artifacts (runtime)

```
node_modules/.pnpm/@deepseek-ai/dsh-*@0.1.1-rc.2…
```

- Every surface depends on the **published** `@deepseek-ai/dsh-*@0.1.1-rc.2` family from
  the npm registry (plus `@deepseek-ai/cordis*` packages at their own versions).
- Eight of them carry local patches via `pnpm-workspace.yaml` →
  `patchedDependencies` (`patches/dsh-app-boot@0.1.1-rc.2.patch`, `dsh-web-app`,
  `dsh-llm-deepseek`, …). Patches apply to the **tarball**, one more reason the runtime
  must consume published artifacts rather than submodule sources.
- `upstream.json.runtimePackageVersion` records the family pin: the deliberate contract
  is *read source from a newer submodule, run against the published family*. Today
  `sourceVersion` (0.1.3-alpha.2) ≠ `runtimePackageVersion` (0.1.1-rc.2) by design.

So yes — the harness exists **two times**: once as submodule source, once as installed
npm artifacts. That is the architecture, not an accident. (And with pnpm's isolated
linker, npm artifacts are physically deduplicated per *(version, dependency-graph hash)*
— see §3.)

---

## 2. Who inherits what — per surface

| Surface | Direct harness deps (its own manifest) | Via `acryl-harness-runtime` (workspace) | Imports the submodule? |
|---|---|---|---|
| `acryl-cli` | 19 × `dsh-*@0.1.1-rc.2` + 4 × `cordis-*` | 146 × `dsh-*` + 6 × `cordis-*` | **One runtime read only: the shipped-presets dir** (§5) |
| `acryl-harness-runtime` | 146 × `dsh-*@0.1.1-rc.2` + 6 × `cordis-*` | — (is the assembly layer) | No |
| `acryl-web` | 15 × `dsh-*@0.1.1-rc.2` + 6 × `cordis-*` | yes (`workspace:*`) | No |
| `acryl-desktop` | **131 × `dsh-*@0.1.1-rc.2` + 5 × `cordis-*`** — declared directly, not inherited through harness-runtime | no | **No.** Despite "integrating the harness", it composes the same published npm family through its own manifest |

Key corrections to common assumptions:

- **`acryl-desktop` does NOT import the submodule.** Its 197-dependency manifest declares
  the `dsh-*@0.1.1-rc.2` family directly; resolution goes through its own
  `node_modules/@deepseek-ai/dsh-base → node_modules/.pnpm/…` symlink. Desktop and
  harness-runtime happen to share one physical store entry; web resolves a second one.
- **No surface has a `file:` / `link:` / `workspace:` dependency into
  `deepseek-harness/`** — verified across all manifests, and *forbidden by gate* (§4).
- The one place the submodule is genuinely read at **runtime** is the shipped agent
  presets roster (§5).

---

## 3. "Two times" — precisely how many copies exist on disk?

1. **Submodule source tree** — `deepseek-harness/` (one checkout, one commit).
2. **npm artifacts in the pnpm store** — deduplicated per *(version, peer-resolution
   graph hash)*. Currently `@deepseek-ai/dsh-base@0.1.1-rc.2` exists as **two** store
   entries:
   - `_33583eaa…` — used by `acryl-harness-runtime` and `acryl-desktop`
   - `_7ec15968…` — used by `acryl-web`
   Same version, different dependency-graph context (the root `.npmrc` deliberately gives
   the TUI its own React 19 peer graph, and the web surface resolves its own). This is
   normal pnpm behavior under `node-linker=isolated`, not duplication to fix.
3. **`~/.dsh/profiles/node_modules/@deepseek-ai/`** — ~233 entries, all **symlinks** into
   this repo's `.pnpm` store, created by `healProfilesModuleFallback()` so profile
   bundles (e.g. `dsh-base`) can resolve their packages at boot. Zero extra copies.

Net: **one source checkout + (at most) a couple of store variants per package**, plus
symlinks. The "two times" intuition is right; the physical footprint is smaller than it
sounds.

---

## 4. The boundary is enforced, not aspirational — `scripts/verify-layout.mjs`

`pnpm run check:layout` runs `scripts/verify-layout.mjs`, which fails the build unless:

- `deepseek-harness` is tracked as a git submodule at path `deepseek-harness` with origin
  equal to `upstream.json.repository`;
- the checked-out commit, `upstream.json.commit`, and the committed gitlink all agree,
  and the submodule worktree is clean;
- `deepseek-harness/package.json` version equals `upstream.json.sourceVersion`;
- **no manifest** (root, desktop, canvas, control, tui, fabric, market) declares a
  `@deepseek-ai/dsh*` dependency as `workspace:` / `portal:` / `link:` / `file:` into
  `deepseek-harness` — *"bypasses the published DSH package boundary"*;
- every `dsh-*` dependency in `acryl-desktop` equals `upstream.json.runtimePackageVersion`
  (*"must use the recorded DSH runtime package family"*).

This is the real "inheritance" mechanism: **all surfaces inherit the same published
family, pinned by one `upstream.json`, patched by one patch set.**

Two known gaps in the gate (safe today, worth closing):

1. The `file:`/`link:` bypass check loops over root, desktop, canvas, control, tui,
   fabric, market — `acryl-web` and `acryl-harness-runtime` are **not** in the loop.
2. The `runtimePackageVersion` family check covers only `acryl-desktop`; tui / web /
   harness-runtime pin `0.1.1-rc.2` in practice but are not gate-enforced to.

Also note the launcher layout rule the gate encodes: launchers live with their surface
(`acryl-cli/bin/dev-run.mjs`), root `scripts/` holds infrastructure only.

---

## 5. The one runtime read of the submodule: shipped agent presets

`acryl-harness-runtime/src/coding-capabilities.ts`:

```ts
// The ACRYL repo root (this package sits at `<repo>/acryl-harness-runtime`). The
// shipped agent presets live in the pinned DSH submodule rather than the
// published npm bundle, so point the roster at that source dir.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const shippedPresetsDir = join(repoRoot, 'deepseek-harness', 'packages',
                               'preset', 'agent-presets', 'presets')
const agentPresetConfig = {
  default: 'standard',
  roots: existsSync(shippedPresetsDir)
    ? [{ path: shippedPresetsDir, trust: 'system' }]
    : [],
  includeShippedRoot: false,
  includeUserRoot: true,
}
```

Facts that matter:

- The path is resolved from **`import.meta.url`** (the installing package's location),
  not `process.cwd()` — so it works regardless of where the CLI was invoked from, as long
  as the checkout contains the submodule.
- The installed `@deepseek-ai/dsh-agent-presets` npm package **ships no presets**
  (verified: only `lib/` in the tarball). The submodule checkout *is* the preset source.
- The `existsSync` guard makes this a **soft** dependency: without the submodule,
  `roots: []` and `/presets` shows only user presets — boot succeeds, roster shrinks.
- Today this config is composed in the TUI-surface capability patch set only
  (`selectNonTuiCapabilityPatches` passes just `authorization` to non-TUI surfaces), so
  in practice **the TUI is the only surface whose live runtime reads the submodule**.

---

## 6. In-flight drift to be aware of

At the time of writing the working tree contains an upstream update mid-flight:

- committed gitlink: `cd5ef81…`
- `upstream.json.commit`: `c389f96…` (modified, uncommitted)
- actual checkout: `b4c7f9a…` (`dsh-v0.1.3-alpha.2-134`) — one commit **ahead** of
  `upstream.json`

Until the submodule pointer and `upstream.json` are committed in agreement,
`pnpm run check:layout` will fail its submodule-consistency checks. Fix: re-run
`pnpm run upstream:update` (or check out the recorded commit) and commit pointer +
`upstream.json` together.

Related standing drift: `sourceVersion` (0.1.3-alpha.2) > `runtimePackageVersion`
(0.1.1-rc.2). The presets the TUI reads come from the *newer* source than the runtime
code that consumes them. Harmless today, but it means a preset schema change upstream
could appear before the runtime supports it.

---

## 7. The ideal state — recommendation

The goal "all surfaces inherit the submodule" is best served **indirectly**. Making
surfaces import submodule code (`file:` deps into `deepseek-harness/packages/*`) would
require building the submodule first, would defeat the isolated store's deduplication,
would not receive the eight tarball patches, and would couple every boot to checkout
state — which is exactly what the verify-layout gate forbids.

Instead, close the loop on the existing contract:

1. **Fix the two gate gaps** (§4): add `acryl-web` and `acryl-harness-runtime` to the
   bypass-check loop; extend the `runtimePackageVersion` family check from desktop-only
   to every manifest that declares `dsh-*` deps.
2. **Optional consistency upgrade**: at each `upstream:update`, publish/adopt a runtime
   family equal to `sourceVersion` (i.e. `runtimePackageVersion === sourceVersion`) so
   presets and code never drift across the boundary.
3. **Make the presets soft-dependency loud**: add a CI/layout assertion that
   `deepseek-harness/packages/preset/agent-presets/presets` exists when the submodule is
   initialized, so a missing submodule can't silently shrink `/presets`.
4. **Optional symmetry**: move `scripts/web-run.mjs` → `acryl-web/bin/dev-run.mjs`, so
   every surface owns its launcher like the TUI now does.

With those, every surface inherits the harness through exactly one pinned, patched,
gate-checked channel — and the submodule does what it is best at: pinned reference
source, preset assets, and the target for `upstream:*` tooling.

---

## Ground truth

| Claim | Verified in |
|---|---|
| Submodule contract & gates | `upstream.json`, `scripts/update-upstream.mjs`, `scripts/verify-layout.mjs`, `pnpm-workspace.yaml` |
| Per-surface dep counts | `*/package.json` (`dsh-*@0.1.1-rc.2` counted at authoring time) |
| Two dsh-base store variants | `node_modules/.pnpm/@deepseek-ai+dsh-base@0.1.1-rc.2_*` + per-package symlink targets |
| Presets runtime read | `acryl-harness-runtime/src/coding-capabilities.ts` (quoted above) |
| npm tarball ships no presets | `node_modules/.pnpm/@deepseek-ai+dsh-agent-presets@0.1.1-rc.2_*/…` contents |
| Profile symlinks, not copies | `~/.dsh/profiles/node_modules/@deepseek-ai/` (233 symlink entries) |
