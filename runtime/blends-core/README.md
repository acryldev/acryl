# @webboxes/blends-core

The ACRYL Blends format, `blends.acryl.dev/v1alpha1`: the manifest an app's `blend.yaml` is, and the library that parses, validates, resolves (Blueprint
inheritance and parameters), compiles (to Cordis Loader patches) and locks it. Host-independent: no Cordis, DSH or surface dependencies, so the engine, the
registry's CI and other runtimes can all use it.

Moved into the ACRYL monorepo from `acryldev/blends` (2026-09-27, spec 036 `repositories.md`), with its history-tested source and tests unchanged. The format's
design decisions (D1 to D27) are recorded in that repository's `specs/001` to `004`.

## The lock: `blend.lock.json` formatVersion 3

One lock for every app built from Blends (ACRYL and the acrylblends framework write the same file, next to `blend.yaml`). It records the
manifest's digest, the Blueprint a Blend was resolved over with that file's digest, the parameter values, the resolved rows, and where each
module comes from: `local` (a folder inside the app, by `digestFolder`), `registry` (npm), `pulled` (a plugin in the plugin store, by the
source it was pulled from and the tarball's sha512), `git`, `linked`.

```ts
import { digestFolder, generateBlendLock, manifestDigest } from '@webboxes/blends-core'

const { json } = generateBlendLock({
  resolved,
  origin: { id, kind, version, digest: manifestDigest(manifestText) },
  lineage: { blueprint: 'acryl.gtd', blueprintVersion: '0.1.0', digest: manifestDigest(blueprintText) },
  parameters,
  modules: [
    { name: 'gtd-board', origin: 'local', version: '0.2.0', digest: `sha256:${digestFolder('src/plugins/gtd-board')}`, source: 'src/plugins/gtd-board' },
    { name: 'acryl-quick-notes', origin: 'pulled', version: '0.3.0', spec: 'github:inboxxobni/acryl-quick-notes@0.3.0', digest: 'sha512-...' },
  ],
})
```

File digests (`origin.digest`, `lineage.digest`) are `manifestDigest`, bare sha256 hex. Module digests carry their algorithm: `sha256:` for a
folder, `sha512-` for a tarball. `digestFolder(dir)` is the one folder digest: sha256 over each file's relative path (always `/`) and bytes, in path order, skipping
`node_modules`, `.git`, `acryl-source.json` and `acryl-v-*` folders. `generateLock` still writes v1 and v2 for existing callers.

## Upgrading a Blend

A Blend records the Blueprint and version it was made from in `spec.lineage`. `planUpgrade` answers what moving it to a newer Blueprint
means, as a plan before an action. It resolves the Blend over the old and over the new Blueprint with `resolveDefinition`, so the
conflicts are the diagnostics the format already has (`override-unknown-id`, `insert-id-collision`):

```ts
import { applyUpgrade, planUpgrade } from '@webboxes/blends-core'

const { plan, diagnostics } = planUpgrade({ blend, oldBlueprint, newBlueprint })
// plan.blueprintChanges  what the Blueprint changed (rows added, removed, changed in name, config or disabled)
// plan.shadowed          changes your overrides hide, because an override sets the same key
// plan.appChanges        how the rows the Blend resolves to differ after the upgrade
// plan.conflicts         what the Blend can no longer do on the new Blueprint
// plan.safe              true when there are no conflicts

if (plan?.safe) {
  const { source } = applyUpgrade(blendSource, plan) // moves spec.lineage.blueprintVersion, nothing else
}
```

Applying keeps the file's comments, order and `!!js` expressions as written. A plan that is not safe is not applied
(`upgrade-conflicts`), and a plan made from a version the file no longer has is refused (`upgrade-stale-plan`). Like the rest of the
package, nothing throws for invalid input: a wrong Blueprint, a version that does not match the lineage, or a Blend that is not a Blend
come back as `upgrade-*` diagnostics with no plan. Not decided here: a Blueprint that also ships code, parameters the new Blueprint adds,
and editing overrides inside the plan to make an unsafe upgrade safe.
