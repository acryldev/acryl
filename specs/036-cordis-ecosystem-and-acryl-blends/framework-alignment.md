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

## For the owner to decide

- Is ACRYL's code the one source, with acrylblends importing it (proposed above), or should the shared packages move to the acrylblends repository and ACRYL import them?
- May I merge `blends-upgrade-plan` after you look at it (two commits, `runtime/blends-core` only)?
