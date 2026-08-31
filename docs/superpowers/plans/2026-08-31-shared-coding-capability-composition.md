# Shared Coding Capability Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose ACRYL authorization once across TUI, Web, and Desktop, establish the small shared-capability contract for future coding-agent features, and retain each surface's native presentation.

**Architecture:** `acryl-harness-runtime` exports immutable ACRYL coding-capability declarations and a patch factory. CLI boot, Web boot, and Desktop profile preparation all consume that factory. A dedicated authorization Host/Client Cordis plugin exposes the existing Harness `authorization` service to Web and Desktop settings UI, while the TUI retains its terminal overlay as an adapter. Desktop keeps its owned Web server replacement and all Electron concerns.

**Tech Stack:** TypeScript 6, Node 24, pnpm 11.7.0, Cordis, DeepSeek Harness, Vitest, React, existing DSH Client Connection and Settings Slots.

**Spec:** `docs/superpowers/specs/2026-08-31-shared-coding-capability-composition-design.md`

## Global Constraints

- Do not edit `deepseek-harness/`; its pinned source and types are authoritative.
- Use `corepack pnpm`, never npm or yarn, for workspace dependencies and scripts.
- Keep `acryl-harness-runtime` the shared composition boundary. Do not create a second DI system, command registry, event bus, credential store, or plugin runtime.
- Use stable Cordis Loader IDs, `inject` for mandatory services, and `ctx.effect()` for every adapter-owned registration or route.
- Desktop retains `acryl-desktop/webserver`, Electron lifecycle, tray, file picker, packaging, and native integrations.
- Authorization credentials remain in the existing Harness credentials provider. Never put secret values in settings, events, client state, or logs.
- TUI keeps `/login` and `/logout`; Desktop and Web expose equivalent behavior in their appropriate settings UI.
- Every changed behavior receives a focused test first. Run-once tests only.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `acryl-harness-runtime/src/coding-capabilities.ts` | Static declarations for ACRYL coding capabilities and immutable shared Loader-patch construction. |
| `acryl-harness-runtime/src/authorization-host.ts` | Host-side authorization projection over `ctx.authorization`; exposes only flow metadata, status, notices, prompts, start, answer, cancel, and logout semantics. |
| `acryl-harness-runtime/src/authorization-client.tsx` | Client Cordis plugin that registers the shared authorization settings section and lifecycle-owned UI contributions. |
| `acryl-harness-runtime/src/authorization-contract.ts` | Validated DTOs and pure parsers shared by host and client, with no secret fields. |
| `acryl-harness-runtime/src/index.ts` | Re-exports the capability factory and composes it in CLI and Web boot helpers. |
| `acryl-harness-runtime/tests/coding-capabilities.spec.ts` | Exact shared-patch and capability-declaration tests. |
| `acryl-harness-runtime/tests/authorization-host.spec.ts` | Real Host plugin activation, provider loss/recovery, cancellation, logout, and no-secret projection tests. |
| `acryl-harness-runtime/tests/authorization-client.spec.tsx` | Client settings registration, interaction rendering state, and disposal tests. |
| `acryl-tui/src/tui-app/session.ts` | Keep the existing TUI adapter against the same authorization behavior; replace `any` surface calls with the shared contract types where possible. |
| `acryl-tui/tests/tui/commands.spec.ts` and new focused session test | Preserve `/login` and `/logout` behavior against the shared composition. |
| `acryl-desktop/package.json` | Add the explicit workspace dependency on `acryl-harness-runtime` so packaged Desktop resolves the shared Loader plugins. |
| `acryl-desktop/src/profile.ts` | Apply the shared coding patches before Desktop overlays and preserve `desktop-webserver` substitution. |
| `acryl-desktop/src/client/index.ts` | Compose the shared authorization client plugin in the Desktop Client root. |
| `acryl-desktop/tests/profile.spec.ts` | Prove Desktop uses shared authorization rows and preserves its Web server ownership. |
| `acryl-desktop/tests/client-authorization.spec.tsx` | Prove Desktop exposes the shared authorization settings adapter and removes it on unload. |
| `acryl-tui/src/cli/run.ts` and `acryl-harness-runtime/tests/profile.spec.ts` | Prove `acryl web` composes the shared authorization Host/Client path. |
| `docs/superpowers/specs/2026-08-31-shared-coding-capability-composition-design.md` | Update only if implementation discovers a material constraint that changes the approved design. |
| `docs/DEVELOPMENT-LOG.md` | Record each coherent implementation checkpoint after its implementation commit. |

## Shared Interfaces

```ts
export type AcrylSurface = 'tui' | 'web' | 'desktop'

export interface AcrylCodingCapability {
  readonly id: 'authorization'
  readonly surfaces: readonly AcrylSurface[]
  readonly loaderPatches: readonly PatchOptions[]
}

export function createAcrylCodingCapabilityPatches(
  surfaces: ReadonlySet<AcrylSurface>,
): readonly PatchOptions[]
```

```ts
export interface AuthorizationFlowView {
  readonly key: string
  readonly label: string
  readonly methods: readonly { readonly id: string; readonly label: string }[]
  readonly inFlight: boolean
}

export type AuthorizationViewEvent =
  | { readonly kind: 'notice'; readonly message: string; readonly url?: string; readonly code?: string }
  | { readonly kind: 'prompt'; readonly requestId: string; readonly prompt: AuthorizationPromptView }
  | { readonly kind: 'settled'; readonly key: string; readonly status: 'authorized' | 'cancelled' | 'failed' }

export interface AcrylAuthorizationApi {
  list(): Promise<readonly AuthorizationFlowView[]>
  begin(input: { key: string; method?: string }): Promise<{ requestId: string }>
  answer(input: { requestId: string; value: string }): Promise<void>
  cancel(input: { requestId: string }): Promise<void>
  logout(input: { key: string }): Promise<{ removed: boolean }>
}
```

The implementation must derive exact remote registration syntax from the pinned
`@deepseek-ai/dsh-client-connection` source before coding. The DTO boundary is
fixed: no credential value, OAuth token, browser cookie, or raw provider object
may cross it.

### Task 1: Establish the shared capability declaration and patch factory

**Files:**
- Create: `acryl-harness-runtime/src/coding-capabilities.ts`
- Create: `acryl-harness-runtime/tests/coding-capabilities.spec.ts`
- Modify: `acryl-harness-runtime/src/index.ts:45-125`
- Modify: `acryl-harness-runtime/tests/profile.spec.ts`

**Consumes:** Existing `PatchOptions`, `agentPresetConfig`, `DEFAULT_PROFILE_BUNDLES`, and the existing coding rows in `acryl-harness-runtime/src/index.ts`.

**Produces:** `AcrylSurface`, `AcrylCodingCapability`, and `createAcrylCodingCapabilityPatches()` for later CLI, Web, and Desktop composition.

- [ ] **Step 1: Write the failing declaration and patch tests**

```ts
import { createAcrylCodingCapabilityPatches, ACRYL_CODING_CAPABILITIES } from '../src/coding-capabilities.ts'

it('declares authorization for every applicable surface', () => {
  expect(ACRYL_CODING_CAPABILITIES).toContainEqual(expect.objectContaining({
    id: 'authorization',
    surfaces: ['tui', 'web', 'desktop'],
  }))
})

it('returns fresh immutable shared coding patches without desktop rows', () => {
  const patches = createAcrylCodingCapabilityPatches(new Set(['tui']))
  expect(patches).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'system-prompt' }),
    expect.objectContaining({ insert: expect.arrayContaining([
      expect.objectContaining({ id: 'authorization', name: '@deepseek-ai/dsh-authorization' }),
    ]) }),
  ]))
  expect(JSON.stringify(patches)).not.toContain('desktop-webserver')
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `corepack pnpm --filter acryl-harness-runtime exec vitest run tests/coding-capabilities.spec.ts`

Expected: FAIL because `coding-capabilities.ts` does not exist.

- [ ] **Step 3: Extract the current ACRYL rows into the factory**

Create `coding-capabilities.ts`. Move the current system prompt, agent presets, session stats, and authorization patches from `ACRYL_RUNTIME_ROWS` into one immutable declaration. Return a `structuredClone()` of selected declarations so a surface cannot mutate another surface's desired Loader composition.

```ts
export const ACRYL_CODING_CAPABILITIES = [
  {
    id: 'authorization',
    surfaces: ['tui', 'web', 'desktop'],
    loaderPatches: [/* existing coding rows, including authorization */],
  },
] as const satisfies readonly AcrylCodingCapability[]
```

Change `bootAcrylHarnessProfile()` to compose:

```ts
...profile.layers.flatMap(layer => layer.patches),
...createAcrylCodingCapabilityPatches(new Set(['tui'])),
...profile.patches,
```

Do not change the HMR guard, profile directory handling, credential provider, or TUI behavior.

- [ ] **Step 4: Run focused runtime tests**

Run: `corepack pnpm --filter acryl-harness-runtime exec vitest run tests/coding-capabilities.spec.ts tests/profile.spec.ts`

Expected: PASS, including the existing one-root profile boot test.

- [ ] **Step 5: Commit the shared composition extraction**

```bash
git add acryl-harness-runtime/src/coding-capabilities.ts acryl-harness-runtime/src/index.ts acryl-harness-runtime/tests/coding-capabilities.spec.ts acryl-harness-runtime/tests/profile.spec.ts
git commit -m "refactor(runtime): centralize coding capability patches"
```

### Task 2: Compose the same coding capabilities in Desktop and Web without changing native ownership

**Files:**
- Modify: `acryl-desktop/package.json`
- Modify: `acryl-desktop/src/profile.ts:580-855`
- Modify: `acryl-desktop/tests/profile.spec.ts`
- Modify: `acryl-harness-runtime/src/index.ts:145-176`
- Modify: `acryl-harness-runtime/tests/profile.spec.ts`

**Consumes:** `createAcrylCodingCapabilityPatches(new Set(['desktop']))` and `createAcrylCodingCapabilityPatches(new Set(['web']))` from Task 1.

**Produces:** Desktop and `acryl web` roots that receive the exact shared authorization composition before their surface-specific overlays.

- [ ] **Step 1: Write failing composition-order tests**

```ts
it('adds the shared authorization row before replacing the Desktop webserver', async () => {
  const prepared = await prepareDesktopProfile(/* existing fixture inputs */)
  expect(prepared.patches).toEqual(expect.arrayContaining([
    expect.objectContaining({ insert: expect.arrayContaining([
      expect.objectContaining({ id: 'authorization', name: '@deepseek-ai/dsh-authorization' }),
    ]) }),
    expect.objectContaining({ id: 'desktop-webserver', name: 'acryl-desktop/webserver' }),
  ]))
})

it('does not replace the Web profile webserver while applying coding capability patches', async () => {
  const runtime = await bootAcrylWebProfile({ cmdlineArgs: [] })
  expect(runtime.ctx.get('authorization')).toBeDefined()
  await runtime.dispose()
})
```

Use the existing isolated-home fixtures. Do not bind a public interface or launch Electron.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `corepack pnpm --filter acryl-desktop exec vitest run tests/profile.spec.ts && corepack pnpm --filter acryl-harness-runtime exec vitest run tests/profile.spec.ts`

Expected: FAIL because Desktop and Web do not yet consume the shared factory.

- [ ] **Step 3: Add the explicit Desktop dependency and compose patches**

Add `"acryl-harness-runtime": "workspace:*"` to Desktop dependencies. In `prepareDesktopProfile()`, append the shared Desktop patches after the upstream bundle patches and before `desktopPatches`, Canvas patches, provider patches, and the Desktop webserver replacement. In `bootAcrylWebProfile()`, append the Web patches after the Web bundle layers and before user profile patches.

Do not import `acryl-tui`, do not alter `DESKTOP_WEB_SERVER_PACKAGE`, and do not move any Desktop-only row into `acryl-harness-runtime`.

- [ ] **Step 4: Update the lockfile and run composition tests**

Run:

```bash
corepack pnpm install --lockfile-only
corepack pnpm --filter acryl-desktop exec vitest run tests/profile.spec.ts
corepack pnpm --filter acryl-harness-runtime exec vitest run tests/profile.spec.ts
```

Expected: PASS. The Desktop test proves both authorization and `desktop-webserver` rows; Web proves `ctx.authorization` is active.

- [ ] **Step 5: Commit Desktop and Web shared composition**

```bash
git add acryl-desktop/package.json acryl-desktop/src/profile.ts acryl-desktop/tests/profile.spec.ts acryl-harness-runtime/src/index.ts acryl-harness-runtime/tests/profile.spec.ts pnpm-lock.yaml
git commit -m "feat: compose coding capabilities across desktop and web"
```

### Task 3: Provide a shared, secret-free authorization Host/Client adapter

**Files:**
- Create: `acryl-harness-runtime/src/authorization-contract.ts`
- Create: `acryl-harness-runtime/src/authorization-host.ts`
- Create: `acryl-harness-runtime/src/authorization-client.tsx`
- Create: `acryl-harness-runtime/tests/authorization-host.spec.ts`
- Create: `acryl-harness-runtime/tests/authorization-client.spec.tsx`
- Modify: `acryl-harness-runtime/package.json`
- Modify: `acryl-harness-runtime/src/index.ts`

**Consumes:** `ctx.authorization`, `ctx.credentials`, pinned `dsh-client-connection` host/client remote conventions, and the shared composition from Tasks 1-2.

**Produces:** The stable `AcrylAuthorizationApi` remote face and a lifecycle-owned `settings.section` UI adapter usable by Web and Desktop.

- [ ] **Step 1: Write failing Host contract tests**

```ts
it('projects flow metadata without a credential value or provider object', async () => {
  const flows = await api.list()
  expect(flows).toEqual([expect.objectContaining({ key: 'openai', label: expect.any(String) })])
  expect(JSON.stringify(flows)).not.toMatch(/token|secret|credentialValue/iu)
})

it('cancels a withdrawn flow and permits a fresh attempt after the provider reloads', async () => {
  const first = await api.begin({ key: 'openai' })
  await api.cancel({ requestId: first.requestId })
  await replaceAuthorizationProvider()
  await expect(api.begin({ key: 'openai' })).resolves.toEqual({ requestId: expect.any(String) })
})

it('removes only the selected provider-owned authorization record on logout', async () => {
  await expect(api.logout({ key: 'openai' })).resolves.toEqual({ removed: true })
  expect(await credentials.describeRecord('other-provider')).toMatchObject({ configured: true })
})
```

Build the fixture from actual pinned Harness authorization and credentials test helpers. Register a fake flow through `ctx.authorization.registerFlow()` and use an abort-aware fake interaction. Never run a real OAuth flow in tests.

- [ ] **Step 2: Run the Host test and verify it fails**

Run: `corepack pnpm --filter acryl-harness-runtime exec vitest run tests/authorization-host.spec.ts`

Expected: FAIL because the shared authorization Host API does not exist.

- [ ] **Step 3: Implement the contract and Host plugin using the pinned remote convention**

Read the exact exported Host route/remote registration APIs in `deepseek-harness/packages/client/connection/src` and mirror its existing typed remote convention. Implement the interface defined above:

- `list()` maps `ctx.authorization.list()` to safe metadata.
- `begin()` starts one attempt and owns an `AbortController` and prompt resolver under a request id.
- notices and prompts become `AuthorizationViewEvent` messages; they never include a secret value.
- `answer()` resolves the matching prompt only.
- `cancel()` aborts the matching controller and rejects any pending prompt.
- `logout()` resolves the selected provider credential key through the existing credential ownership mapping, calls the normal credential removal operation, and reports whether a writable owned record was removed.
- plugin activation declares `inject = ['authorization', 'credentials', ...exact remote service names]`.
- the request map, subscriptions, and remote registration live inside one `ctx.effect()` disposer that aborts attempts, rejects unresolved prompts, unregisters routes, and reaches quiescence.

Export the plugin from `acryl-harness-runtime` as a Loader-addressable subpath. Add one stable Host Loader row in the shared Web/Desktop patches only. TUI continues to call `ctx.authorization` directly; it is already an adapter over identical behavior.

- [ ] **Step 4: Write and run failing Client adapter tests**

```tsx
it('registers a shared authorization settings section and removes it on unload', () => {
  const dispose = mountAuthorizationClient(fakeClientContext)
  expect(fakeSlots.register).toHaveBeenCalledWith(expect.objectContaining({
    name: 'settings.section', id: 'acryl-authorization',
  }), expect.any(Function))
  dispose()
  expect(fakeSlots.unregister).toHaveBeenCalled()
})

it('renders a provider, routes a notice URL, answers a prompt, and never stores prompt text after settlement', async () => {
  // Drive the typed remote mock through list -> begin -> notice -> prompt -> answer -> settled.
})
```

- [ ] **Step 5: Implement the Client plugin and run focused tests**

Implement the section with the established `ctx.slots.inject('settings.section', ...)`, locale registration, and `ctx.effect()` patterns used by Desktop settings. Use the generated/pinned remote face. Render provider choice, notice URL, device code, text/secret/select prompts, cancellation, success, failure, and logout. Store only transient prompt input in React component state; clear it on any settled, cancelled, unmount, or connection-reset event.

Run:

```bash
corepack pnpm --filter acryl-harness-runtime exec vitest run tests/authorization-host.spec.ts tests/authorization-client.spec.tsx
corepack pnpm --filter acryl-harness-runtime typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the shared authorization adapter**

```bash
git add acryl-harness-runtime/package.json acryl-harness-runtime/src/authorization-contract.ts acryl-harness-runtime/src/authorization-host.ts acryl-harness-runtime/src/authorization-client.tsx acryl-harness-runtime/src/index.ts acryl-harness-runtime/tests/authorization-host.spec.ts acryl-harness-runtime/tests/authorization-client.spec.tsx
git commit -m "feat: add shared authorization surface adapter"
```

### Task 4: Mount authorization UI in Web and Desktop, preserve TUI behavior, and add parity gates

**Files:**
- Modify: `acryl-harness-runtime/src/coding-capabilities.ts`
- Modify: `acryl-harness-runtime/src/index.ts`
- Modify: `acryl-desktop/src/client/index.ts`
- Create: `acryl-desktop/tests/client-authorization.spec.tsx`
- Modify: `acryl-tui/src/tui-app/session.ts`
- Modify: `acryl-tui/tests/tui/commands.spec.ts`
- Create: `acryl-tui/tests/tui/authorization-parity.spec.ts`
- Create: `acryl-harness-runtime/tests/capability-parity.spec.ts`

**Consumes:** Shared Host/Client plugin exports from Task 3 and the existing TUI login overlay/actions.

**Produces:** One authorization capability whose declared TUI, Web, and Desktop surface adapters are all mounted and tested.

- [ ] **Step 1: Write failing parity tests**

```ts
it('has a verified adapter test for every authorization surface', () => {
  expect(authorizationCapability.surfaces).toEqual(['tui', 'web', 'desktop'])
  expect(authorizationCapability.adapters).toEqual({
    tui: 'acryl-tui/tests/tui/authorization-parity.spec.ts',
    web: 'acryl-harness-runtime/tests/authorization-client.spec.tsx',
    desktop: 'acryl-desktop/tests/client-authorization.spec.tsx',
  })
})

it('keeps /login and /logout connected to the shared authorization capability', () => {
  runSlashCommand('/login', actions)
  runSlashCommand('/logout', actions)
  expect(actions.login).toHaveBeenCalledOnce()
  expect(actions.logout).toHaveBeenCalledOnce()
})
```

The Desktop client test must mount the plugin with its real `ClientContext` test fixture and prove `settings.section` registration is present after Client composition and removed on Fiber disposal.

- [ ] **Step 2: Run parity tests and verify they fail**

Run:

```bash
corepack pnpm --filter acryl-harness-runtime exec vitest run tests/capability-parity.spec.ts
corepack pnpm --filter acryl-desktop exec vitest run tests/client-authorization.spec.tsx
corepack pnpm --filter acryl-tui exec vitest run tests/tui/authorization-parity.spec.ts
```

Expected: FAIL because the declarations lack adapter proof and Desktop does not mount the Client plugin.

- [ ] **Step 3: Mount the client plugin through shared composition**

Add the authorization Host and Client Loader entries to the `authorization` declaration, only for `web` and `desktop` where the browser remote exists. In `acryl-desktop/src/client/index.ts`, use the same Client plugin function rather than copying its slot registrations or React component. Ensure its hard client dependencies are added to Desktop `inject` only when they are truly required.

Keep `acryl-tui/src/tui-app/session.ts` as the terminal adapter. Replace its `any` authorization/credential casts with the contract types introduced in Task 3 where those types match. Do not route TUI interaction through a browser remote.

- [ ] **Step 4: Run surface parity and typechecks**

Run:

```bash
corepack pnpm --filter acryl-harness-runtime exec vitest run tests/capability-parity.spec.ts tests/authorization-host.spec.ts tests/authorization-client.spec.tsx
corepack pnpm --filter acryl-desktop exec vitest run tests/profile.spec.ts tests/client-authorization.spec.tsx
corepack pnpm --filter acryl-tui exec vitest run tests/tui/commands.spec.ts tests/tui/authorization-parity.spec.ts
corepack pnpm --filter acryl-harness-runtime typecheck
corepack pnpm --filter acryl-desktop typecheck
corepack pnpm --filter acryl-tui typecheck
```

Expected: PASS. The tests prove one shared behavior, three adapters, no secret projection, and retained Desktop Web server ownership.

- [ ] **Step 5: Commit the surface parity integration**

```bash
git add acryl-harness-runtime/src/coding-capabilities.ts acryl-harness-runtime/src/index.ts acryl-harness-runtime/tests/capability-parity.spec.ts acryl-desktop/src/client/index.ts acryl-desktop/tests/client-authorization.spec.tsx acryl-tui/src/tui-app/session.ts acryl-tui/tests/tui/commands.spec.ts acryl-tui/tests/tui/authorization-parity.spec.ts
git commit -m "feat: expose shared authorization across acryl surfaces"
```

### Task 5: Record the enforced product rule and run release-relevant verification

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-shared-coding-capability-composition-design.md`
- Modify: `docs/DEVELOPMENT-LOG.md`
- Modify: `specs/025-acryl-runtime-distribution/evidence/shared-cli-pack-smoke.md` only if the package manifest changes

**Consumes:** Completed parity gates from Task 4.

**Produces:** A durable explanation of the shared-capability rule and verification that the npm CLI still retains `acryl web`.

- [ ] **Step 1: Update the design's implementation status**

Change status to `Implemented for authorization` and add actual module paths, the three adapter tests, and any exact pinned remote convention used. Do not broaden claims to auto-research or other unimplemented capabilities.

- [ ] **Step 2: Write a development-log checkpoint after the implementation commit**

Record the full hash of Task 4's implementation commit, the shared patch source, Desktop Web server preservation, and the exact focused test commands that passed.

- [ ] **Step 3: Run the packed CLI closure and product smoke**

Run:

```bash
node --test scripts/publish-npm-cli.test.mjs
corepack pnpm --filter acryl-tui exec vitest run
corepack pnpm --filter acryl-harness-runtime run check
corepack pnpm --filter acryl-desktop run check
```

Expected: PASS. If Desktop packaging is still blocked at Electron Builder's node-module discovery phase, record it as the existing release blocker rather than weakening this capability gate.

- [ ] **Step 4: Commit the documentation checkpoint**

```bash
git add docs/superpowers/specs/2026-08-31-shared-coding-capability-composition-design.md docs/DEVELOPMENT-LOG.md specs/025-acryl-runtime-distribution/evidence/shared-cli-pack-smoke.md
git commit -m "docs: record shared authorization capability parity"
```

## Self-Review

- **Spec coverage:** Task 1 creates the shared capability declaration; Task 2 applies it to TUI, Web, and Desktop without native-row leakage; Task 3 supplies a real reusable authorization adapter; Task 4 verifies all declared surface adapters and lifecycle behavior; Task 5 records the rule and preserves the npm product gate.
- **Cordis coverage:** The plan declares capability boundary, injections, effect ownership, stable Loader composition, no private event bus, credential durability, provider replacement, and real lifecycle verification.
- **Scope:** This plan implements authorization parity and the smallest enforceable rule for subsequent features. It does not implement auto-research, embed TUI in Electron, or create a generic plugin framework.
- **Placeholder scan:** No `TODO`, `TBD`, or unnamed implementation steps remain. The pinned remote registration syntax is deliberately resolved from its authoritative source in Task 3 before code is written; the DTO and lifecycle requirements are fixed here.
- **Type consistency:** `AcrylCodingCapability`, `createAcrylCodingCapabilityPatches`, `AcrylAuthorizationApi`, and `AuthorizationViewEvent` are defined once above and used unchanged in downstream tasks.
