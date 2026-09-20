# Data model: Extension Context Pack

Contracts the pack, the runtime plugin, the verifier and the eval harness share.
Shapes are TypeScript for precision; each is validated at its boundary with a
runtime schema (Schemastery, matching repo convention), never trusted as a cast.

## Package layout

`plugins/acryl-extension-context` (private, owned, PNPM isolated):

```text
package.json                 name: acryl-extension-context; exports ./package.json, ./manifest, ./host
src/
  index.ts                   Host plugin (apply): provides `extensionContext`, registers router + skills
  definition.ts              ExtensionContextService (abstract service definition)
  provider-package.ts        resolves the pack root from the installed package
  prompt-router.ts           builds the PromptSection text from the manifest
  skill-provider.ts          SkillProvider for skills/ at bundled rank
  verify/                    verifier core (also imported by `acryl plugin verify`)
  publish/                   pack + lint + dry-run (no network, no credentials)
docs/
  docs.json                  the manifest (below)
  README.md                  generated index
  start-here/  extending/  surfaces/  delivery/  lifecycle/  guide/  harness/  reference/
examples/
  README.md                  generated index of examples
  scenarios.json             expected outcomes, one entry per scenario
  packages/<type>-<name>/    each example is a real package (package.json, index, tests)
skills/<name>/SKILL.md       bundled authoring skills
evals/
  tasks/<id>.json            eval task definitions
  README.md
scripts/
  sync-corpus.mjs            handbook, cheatsheet, harness docs -> docs/ (idempotent, provenance)
  build-manifest.mjs         validates and regenerates docs/README.md, examples/README.md, router text
  verify-pack.mjs            the FR-015 gate
```

## Surfaces

```ts
type AcrylSurface = 'tui' | 'web' | 'desktop'   // existing, coding-capabilities.ts
```

## Manifest (`docs/docs.json`)

```ts
interface PackManifest {
  schemaVersion: 1
  packVersion: string                    // semver of the pack; bumps on any content change
  navigation: ManifestGroup[]
  examples: ManifestExample[]
}

interface ManifestGroup {
  title: string
  items: ManifestDoc[]
}

interface ManifestDoc {
  id: string                             // stable kebab-case id, e.g. 'extending.tool-plugin'
  title: string
  path: string                           // relative to docs/, must exist
  when: string                           // one line: read this when ...
  surfaces: AcrylSurface[]               // surfaces the doc applies to; [] is invalid
  applies: 'all' | 'partial' | 'not-for-authors'
  // 'not-for-authors' docs (e.g. loader internals) are indexed but omitted from the router map
  seeAlso?: string[]                     // ids; every id must exist
  examples?: string[]                    // example ids; every id must exist
  source?: Provenance                    // present for synced docs
}

interface ManifestExample {
  id: string                             // e.g. 'tool-plugin.basic'
  type: PluginTypeId                     // one of the coverage-matrix types
  path: string                           // relative to examples/packages/
  surfaces: AcrylSurface[]
  teaches: string
  docs: string[]                         // doc ids, every id must exist
  scenario: string                       // scenario id, must exist
  solutionFor?: string[]                 // eval task ids this example solves (FR-014)
}

interface Provenance {
  sourcePath: string                     // e.g. 'docs/cordis/cordis_system_guide_for_coding_agents.md'
  sourceRepo: 'acryl' | 'deepseek-harness'
  sourceCommit: string                   // git commit (or submodule pin) the copy was made from
  range?: [number, number]               // source line range for split files
  syncedAt: string                       // ISO
}
```

Invariants checked by `verify-pack.mjs` (FR-015): every file under `docs/` and
`examples/` is listed; every listed path exists; every `seeAlso`, `examples`,
`docs`, `scenario` id resolves; ids are unique; no doc has empty `surfaces`.

## Plugin types

```ts
type PluginTypeId =
  | 'lifecycle-function'   | 'service-provider'    | 'service-consumer'
  | 'tool'                 | 'event-hook'          | 'config-schema'
  | 'three-role-capability'| 'prompt-contribution' | 'skill-provider'
  | 'llm-adapter'          | 'agent-preset'        | 'host-route'
  | 'client-slot'          | 'desktop-main'        | 'tui-contribution'
  | 'packaging'            | 'generated-capability'| 'diagnostics'
```

Matches the 18 rows of the spec's coverage matrix (finalized by T003).

## Scenario (`examples/scenarios.json`)

Deterministic, no network, no model.

```ts
interface Scenario {
  id: string
  surfaces: AcrylSurface[]               // run once per listed surface
  fixtures?: FixtureRef[]                // stub services the candidate injects
  env?: Record<string, string>
  steps: ScenarioStep[]
}

type ScenarioStep =
  | { mount: string; config?: unknown; expect: FiberState; expectError?: string }
  | { dispose: string }
  | { remount: string; expect: FiberState }           // dispose then mount again
  | { expectState: Record<string, FiberState> }       // after settle
  | { expectService: string }
  | { expectNoService: string }
  | { expectLog: string }
  | { expectEvent: string; payload?: unknown }
  | { expectNoLeak: true }                            // effects count returns to baseline

type FiberState = 'PENDING' | 'LOADING' | 'ACTIVE' | 'FAILED' | 'UNLOADING' | 'DISPOSED'
```

An example that claims a surface must have a scenario that passes on that
surface. A scenario that names a surface the example does not claim is invalid.

## Example header

Every example entry file starts with a header the manifest is checked against:

```js
// Example: tool-plugin.basic
// Type:     tool
// Surfaces: tui web desktop
// Teaches:  registering a model-callable tool on ctx.tools
// Expect:   ACTIVE once a `tools` service exists; PENDING before
// Docs:     extending.tool-plugin
```

## Verifier report (`acryl plugin verify --json`)

```ts
interface VerifyReport {
  schemaVersion: 1
  target: { path: string; name: string; version: string }
  surfaces: Array<{
    surface: AcrylSurface
    declared: boolean                    // package declares this surface
    booted: boolean
    rows: Array<{ id: string; state: FiberState; error?: string }>
    unmetInject: Array<{ row: string; service: string }>
    provides: string[]
    events: string[]
    leakedEffects: number                // after dispose
    remount: 'stable' | 'duplicated' | 'failed'
  }>
  lint: LintFinding[]
  findings: Finding[]
  ok: boolean                            // false when any finding.severity === 'error'
}

interface Finding {
  severity: 'error' | 'warning'
  code: VerifyCode
  surface?: AcrylSurface
  row?: string
  message: string                        // includes the real underlying error text
  docs?: string[]                        // manifest doc ids that explain the fix
}

type VerifyCode =
  | 'import-failed' | 'invalid-plugin-shape' | 'apply-threw' | 'unmet-inject'
  | 'config-invalid' | 'leaked-effect' | 'remount-duplicates' | 'remount-failed'
  | 'surface-declared-not-mounted' | 'surface-mounted-not-declared'
  | 'manifest-missing' | 'permissions-undeclared' | 'tests-missing' | 'provenance-missing'
```

`docs` on a finding is the routing feedback loop: a failed check points the agent
back at the exact manifest doc that explains the fix. Codes are stable; messages
carry the real error.

## Generated capability package (constitution V)

What an agent-produced package contains, checked by the verifier's lint:

```ts
interface CapabilityPackageFacts {
  manifest: { name: string; version: string; surfaces: AcrylSurface[]; keywords: string[] }
  logic: string[]                        // entry files
  uiProjection?: string[]                // client slot files, only for web/desktop
  permissions: { fs?: string[]; net?: string[]; shell?: boolean; secrets?: string[] }
  tests: string[]                        // at least one scenario or test file
  provenance: { generatedBy: string; sessionId?: string; createdAt: string; basedOn?: string[] }
  mutationClass: 'HOT' | 'WARM' | 'COLD' // constitution V
}
```

`mutationClass` meaning: HOT = plugin remount, WARM = generation restart,
COLD = native or executable swap. Only HOT and WARM are deliverable by the agent
paths in this spec; COLD is reported and left to a human.

## Delivery records

```ts
interface LocalInstallResult {
  ok: boolean
  package: string
  version: string
  bundleRowsAdded: string[]
  activation: 'live' | 'reload-required' | 'restart-required' | 'failed'
  rolledBack: boolean
  error?: string
}

interface PublishPrepResult {
  ok: boolean
  tarball?: string                       // from pack; never uploaded by this step
  lint: LintFinding[]
  installedFromTarball: boolean          // the packed artifact mounted in a throwaway profile
  readyForHumanPublish: boolean          // true only when everything above is green
}
```

`PublishPrepResult` never triggers a publish. The publish command consumes it and
requires a fresh human approval.

## Eval (`evals/`)

```ts
interface EvalTask {
  id: string
  prompt: string                         // what the user asks the agent
  surface: AcrylSurface
  goal: GoalSpec                         // evaluated from VerifyReport, not from agent prose
  excludePaths: string[]                 // example and doc paths the agent must not read (solution keys)
  expectedHeadroom: string               // why a docs-less agent can fail this
}

type EvalVariant = 'full' | 'without_docs' | 'without_examples'

interface EvalRunSummary {
  runId: string
  runFolder: string                      // result-of-run-<DD-MM-YY-HH-MMAM>-<runId>
  runAt: string
  model: { provider: string; id: string }
  variant: EvalVariant
  tasks: Array<{
    id: string
    passed: boolean
    verifyOk: boolean
    contextReads: { docs: string[]; examples: string[] }
    excludedPathRead: boolean            // run invalid when true (FR-014)
    tokens: { input: number; output: number; cacheHit?: number; cacheMiss?: number }
    wallMs: number
  }>
  totals: { passRate: number; input: number; output: number; cacheHitRate?: number }
}
```

Run folders keep the full trajectory and the produced package per task, one folder
per run, never overwritten, comparable across runs and variants.
