# @webboxes/blends-core

The ACRYL Blends format, `blends.acryl.dev/v1alpha1`: the manifest an app's `blend.yaml` is, and the library that parses, validates, resolves (Blueprint
inheritance and parameters), compiles (to Cordis Loader patches) and locks it. Host-independent: no Cordis, DSH or surface dependencies, so the engine, the
registry's CI and other runtimes can all use it.

Moved into the ACRYL monorepo from `acryldev/blends` (2026-09-27, spec 036 `repositories.md`), with its history-tested source and tests unchanged. The format's
design decisions (D1 to D27) are recorded in that repository's `specs/001` to `004`.

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
