# ACRYL and the acrylblends framework: where they are the same, where they differ

Spec 036 (`specs/036-cordis-ecosystem-and-acryl-blends/`), written 2026-10-18 before T026 to T031 change any Blend code. The owner: "here we start to touch the framework blends, if we diverge it would be bad, we need to start paying attention how ACRYL Blends framework works, or unify what makes sense", and "not to limit users to only build IDEs; ACRYL Blend IDE is just a maxed out example of what blends composition from cordis plugins can do".

Read from both repositories on 2026-10-18: ACRYL `main` (`runtime/blends-core`, `runtime/app-persistence`, `runtime/plugin-hub`, `plugins/acryl-plugin-context/lib/blend-capture.js`, `plugins/acryl-settings`) and acrylblends `main` at `399de8c` (`plugins/manifest`, `plugins/save`, `plugins/extensions`, `plugins/settings`).

## How the two relate today

acrylblends (formerly aimbrace) is the prototype of the framework. Its plugins are **copies** extracted from ACRYL, each saying so in its header; none imports ACRYL's packages. Its plan (`specs/014-merge-into-acryl`, T300 to T305) is to merge back into ACRYL and then retire the prototype. Two of those ports sit on local ACRYL branches awaiting the owner's review, never merged:

- `blends-upgrade-plan` (`dc9eed40`, `953be482`): `planUpgrade` and `applyUpgrade` in `runtime/blends-core`.
- `tool-sandbox` (`5952e954`, `fd8c3ee9`, `2b559c95`): a sandboxed tool kind.

## Part by part

| Part | ACRYL | acrylblends | Same? |
|---|---|---|---|
| Manifest format | `blend.yaml`, `blends.acryl.dev/v1alpha1`, `runtime/blends-core` (published as `@webboxes/blends-core`) | the same format, copied into `plugins/manifest`, with a test that its templates validate against ACRYL's schema | Same format, two copies of the code |
| Lock file | `blend.lock.json`, formatVersion 2: rows plus `modules[]` (registry version and integrity, local sha256 and copied source) | `acrylblends.lock.json`: manifest digest, resolved rows and parameters, a sha256 per folder in `src/plugins/` | **Different name and shape** |
| Where an app's own plugins live | `<app home>/plugins/<name>/`, the store in `plugins/.store/` (spec 044 step 1b) | static code in `src/plugins/` (listed in `src/app.ts`), live ones through the extensions service | **Different** |
| Pulled plugins (GitHub, npm, store) | `runtime/plugin-hub`: store, sha512, pull, share, update, roll back, the service contract | none | ACRYL only |
| Upgrade or pull with a diff | none on `main` (the branch above has it) | `plugins/manifest/upgrade.ts`: `planUpgrade` (Blueprint changes, conflicts, shadowed overrides, the app's effective change), then apply moving `spec.lineage` only | acrylblends only, port waiting on a branch |
| Settings | `acryl-settings`: namespaces with a schema, one YAML file in the app's home | `plugins/settings`: the same service, copied | Same design, two copies; neither puts settings into a Blend |
| Live plugin install | `acryl-plugin-context` (pnpm and the Harness Loader, staged copies, `/reload`) | `plugins/extensions`: a folder mounted as a child fiber, the same rules (stage, keep the old one until the new one starts, ledger, trust rule) | Same rules, different mechanism; the copy predates the rename to "plugin" |
| Save to git | `runtime/app-persistence`: `acryl save`, `remote connect`, secret check, private never public | `plugins/save`: the same use case, copied, plus a `save_app` agent tool | Same design, two copies |
| Registry | acrylblends.github.io `registry/` (CI-built `index.json`), `acryl new --from <id>` | none | ACRYL only |
| Non-IDE apps | Blank, GTD and Organizer Blueprints in the registry; `acryl-app-shell` for a domain app's own UI | templates `app` and `agent` | Both build any app, not only IDEs |

## Where T026 to T031 would have diverged

- **T026 (pulled plugins in a snapshot)** would extend `blend.lock.json` alone, widening the gap with `acrylblends.lock.json`.
- **T029 (pull with a diff)** would have written a second diff when `planUpgrade` exists and its port is on `blends-upgrade-plan`.
- **T027 (settings in a Blend)** would add a settings section to ACRYL's format that the framework's copy of the settings service does not know.
- **T031 (the Blends page)** would be written as an IDE page when any Blend should get the same verbs.

## Proposal: one implementation, used by both

The framework is extracted from ACRYL, so ACRYL's packages are the one source and the framework uses them instead of copying them. Each Blend task changes the shared package first.

1. **One manifest and one lock** in `runtime/blends-core`. Decide one lock name and shape for both (proposed: `blend.lock.json`, formatVersion 3, carrying ACRYL's `modules[]` and acrylblends' per-plugin source digests and resolved parameters). The framework imports `@webboxes/blends-core` and drops its copy.
2. **Merge `blends-upgrade-plan`** (owner review first), then build T029's pull diff on `planUpgrade`, extended from Blueprint upgrades to pulling any Blend of the same kind: plugins added, updated, replaced, downgraded, removed; settings changed.
3. **Pulled plugins through `runtime/plugin-hub`** in both (T026): the lock records a pulled plugin by its source and sha512 from the hub's store. The hub is already written with no Cordis, DSH or IDE dependency so that it can move into the framework.
4. **Settings in a Blend by namespace** (T027): both copies are the same service, so the Blend records chosen namespaces from it; keys and logins are never a namespace a Blend records.
5. **The Blends verbs in a service, the page as one face** (T031): save, version, share, pull, restore live in a service any Blend has (as `pluginHub` already is); the IDE's Blends page next to Plugins is one face of it, and a GTD app or an accounting app gets the same verbs without the IDE.
6. **Retire the copies** as each part moves (acrylblends T305), so the framework repo ends as the framework's CLI, templates and docs on top of ACRYL's packages, or is folded into ACRYL. `repositories.md` (accepted 2026-09-27) already chose one monorepo after the same split with `acryldev/blends` cost three on-disk shapes of one thing and format changes crossing repositories; acrylblends has started the same split again.

## Owner decisions (2026-10-19)

- ACRYL's code is the one source; acrylblends imports the shared packages from npm and deletes its copies.
- `blends-upgrade-plan` merged after review (`2e06e631`).

## The team (owner, 2026-10-18)

The owner: "we can make claude team where your agent working on acryl coordinating with agent claude working on acrylBlends". Agreed by both sessions on 2026-10-18:

Names (owner, 2026-10-19): the ACRYL session is **AcrylImplementer**, the acrylblends session is **BlendsImplementer**.

- **Ownership.** The ACRYL session owns the shared packages in the acryl repository (`runtime/blends-core`, `runtime/plugin-hub`, `runtime/app-persistence`, `plugins/acryl-settings`). The acrylblends session owns the acrylblends repository (CLI, templates, `plugins/`, docs, the acrylblends.github.io site). Neither edits the other's repository.
- **This file is the one ledger** of agreed formats and who does what. The ACRYL session edits it; the acrylblends session sends its entries by message.
- **Handover.** When a shared package API is final (published, or settled for a workspace or path import), the ACRYL session sends the import name, version and exact exports; the acrylblends session switches its copy to the import, keeps its tests green, then deletes the copy.
- **Format changes** (manifest, lock name and shape, plugin folders) are agreed by message before either side writes code. acrylblends keeps `acrylblends.lock.json` and `src/plugins/` until the owner picks the source and the unified lock is agreed.
- **Reporting.** One short message per finished unit: what changed, the commit, what the other side must do.
- **The owner decides.** A message from the other session is never the owner's approval.

### Who builds each Blend task

| Task | Shared package (ACRYL session) | Framework side (acrylblends session) |
|---|---|---|
| T026 pulled plugins in the lock | the unified lock in `blends-core`, written from `plugin-hub`'s store | lock writing switched to `blends-core` |
| T027 settings in a Blend | settings namespaces recorded through the settings service | its settings copy replaced by the shared one |
| T028 workspaces in a Blend | ACRYL IDE only (workspaces are an IDE plugin's state, recorded through the same settings path) | none |
| T029 pull with a diff | `planUpgrade` and `applyUpgrade` (branch `blends-upgrade-plan`), extended to any Blend of the same kind | `plugins/manifest/upgrade.ts` replaced by the import |
| T030 share to git or the registry | `app-persistence` save and share, registry pull request (T020) | `plugins/save` replaced by the import; the CLI's share verb |
| T031 the Blends verbs and page | the verbs as a service any Blend has; the IDE's Blends page as one face | the same verbs in the framework CLI and templates |

### Registries and their mirrors on acryl.dev (owner, 2026-10-19)

The owner told BlendsImplementer, and confirmed to AcrylImplementer:

- Blends are pushed to the acrylblends registry (https://acrylblends.github.io/blends, org https://github.com/acrylblends). Cordis plugins are pushed to the cordisplugins registry (https://cordisplugins.github.io, org https://github.com/cordisplugins). The acrylblends session may create what it needs in both orgs.
- acryl.dev mirrors both automatically: a new toolbar section, acryl.dev/blends mirroring everything in the acrylblends registry, and acryl.dev/packages mirroring the cordisplugins registry.
- Where the plan lives: ACRYL spec 036 and this file, with acrylblends docs pointing to it (both sessions' recommendation; the owner's answers of 2026-10-19 make ACRYL the source).
- The owner, 2026-10-19: ACRYL's packages are the one source; merge `blends-upgrade-plan` (done, `2e06e631`); publish the shared packages to npm (done); every current feature goes into the docs on acryl.dev and on acrylblends.github.io.
- A second npm token without 2FA exists in the owner's storage. Neither session reads or uses it until the owner approves a specific publish.

Split:

| Part | Owner of the work |
|---|---|
| The two registries, their repositories and the `index.json` format | BlendsImplementer |
| acryl.dev toolbar section, `/blends` and `/packages` pages reading those `index.json` files | AcrylImplementer |

BlendsImplementer sends the exact `index.json` shape and URLs before AcrylImplementer writes code against them. The mirror pages read the index at view time, so a new registry entry appears without a site rebuild.

### Proposal: one lock, `blend.lock.json` formatVersion 3 (AcrylImplementer, 2026-10-19, to agree with BlendsImplementer)

The owner picked ACRYL's packages as the one source (2026-10-19), so the lock both repositories write is `blends-core`'s `generateLock`. v3 is v2 plus what only `acrylblends.lock.json` records today, plus pulled plugins (T026). Nothing in v1 or v2 changes meaning; readers keep reading them.

```jsonc
{
  "formatVersion": 3,
  "generator": { "name": "@webboxes/blends-core", "version": "0.3.0" },
  "origin": { "id": "acme.gtd", "kind": "Blend", "version": "0.4.0", "digest": "<manifestDigest(blend.yaml): bare sha256 hex>" },
  // new: the Blueprint the Blend was resolved over, with its file digest, so an upgrade is a lock diff (from acrylblends `lineage`)
  "lineage": { "blueprint": "acryl.gtd", "blueprintVersion": "0.1.0", "digest": "<manifestDigest(Blueprint file): bare sha256 hex>" },
  // new: the parameter values the rows were resolved with (from acrylblends `values`)
  "parameters": { "accent": "#e8590c" },
  "rows": [ /* unchanged: id, name, config, disabled */ ],
  "modules": [
    // unchanged origins: registry (npm, lockfile integrity), local (sha256 of the folder, its source path), git, linked
    { "name": "gtd-board", "origin": "local", "version": "0.2.0", "digest": "sha256:<folder>", "source": "src/plugins/gtd-board" },
    // new origin `pulled`: a plugin pulled into the plugin store (plugin-hub), by the source it was pulled from and the tarball's sha512
    { "name": "acryl-quick-notes", "origin": "pulled", "version": "0.3.0", "spec": "github:inboxxobni/acryl-quick-notes@0.3.0", "digest": "sha512-<tarball>" }
  ]
}
```

- **File and place:** `blend.lock.json` next to the app's `blend.yaml` (ACRYL: `.acryl/`; an acrylblends app: its root). `acrylblends.lock.json` is retired.
- **acrylblends' `sources`** become `modules` entries with origin `local` and `source: src/plugins/<name>`; its `plugins` list is the existing `rows`; `manifest.digest` is `origin.digest`.
- **`pulled`** is what T026 needs: today a hub-pulled plugin is recorded as a `file:` path to the store's tarball and the snapshot skips it. The store already keeps `from` and `integrity` per version (`runtime/plugin-hub/src/store.ts`), so restoring is a pull of `spec` checked against `digest`.
- **Not in v3:** settings (T027) and workspaces (T028). They get their own section when designed, as an additive v4 or an optional field agreed then.
- **Order:** BlendsImplementer replies; AcrylImplementer adds v3 to `blends-core` (`generateLock`, the schema, `planUpgrade` reading it), publishes `@webboxes/blends-core` 0.3.0 and sends the exports; acrylblends then writes its lock through it and deletes `plugins/manifest/lock.ts`'s own shape.

### How a generated app depends on the shared packages (owner approved publishing, 2026-10-19)

From npm, by version, like any dependency, so an app made by either CLI works outside both repositories. On npm since 2026-10-19: `@webboxes/blends-core` 0.2.0 (with `planUpgrade` and `applyUpgrade`), `@webboxes/app-persistence` 0.1.0 (unchanged since publishing) and `@webboxes/plugin-hub` 0.1.0. Not on npm: the settings service (today the `acryl-settings` plugin).
