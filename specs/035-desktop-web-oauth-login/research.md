# Research: OAuth provider login on Desktop and Web

Facts gathered before `plan.md`, each with the exact evidence, per this repo's
own "read the owning subsystem before writing the mini-design" discipline.

## Q1 - Which providers already have a working OAuth flow, and where?

**Answer**: six, all in the vendored `@earendil-works/pi-ai` package, resolved
here via `node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_.../dist/auth/oauth/`:

| File | Provider | `CLIENT_ID` |
| --- | --- | --- |
| `anthropic.js` | Anthropic | `decode("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl")` → `9d1c250a-e61b-44d9-88ed-5944d1962f5e` - the public Claude Code CLI client id (the well-known unofficial reuse trick) |
| `openai-codex.js` | OpenAI Codex | `app_EMoamEEZ73f0CkXaXp7hrann` - the ChatGPT/Codex CLI client id |
| `kimi-coding.js` | Kimi For Coding | `17e5f671-d194-4dfb-9706-5516cb48c098` |
| `github-copilot.js` | GitHub Copilot | device-flow client id |
| `xai.js` | xAI | own client id |
| `radius.js` | Radius | own client id |

OpenRouter has no file under `auth/oauth/` - api-key only, confirmed out of
scope (spec.md).

## Q2 - Is the backend `authorization` service already composed on Desktop and Web?

**Answer**: yes. `runtime/acryl-harness-runtime/src/coding-capabilities.ts`:

```ts
{
  id: 'authorization',
  surfaces: ['tui', 'web', 'desktop'],
  loaderPatches: [
    { insert: [{ id: 'authorization', name: '@deepseek-ai/dsh-authorization' }] },
  ],
},
```

with its own doc comment: "The authorization service is ... needed [by every
surface] so `dsh-llm-pi-ai` has a seam to register OAuth sign-in flows into;
without it the pi-ai adapter stays PENDING and `/login` has no providers to
offer." This was a deliberate, already-shipped decision - not something this
milestone needs to add.

## Q3 - Does any Desktop/Web client code already call the authorization service?

**Answer**: no. `grep -rln "beginAuthorization\|authorization\.begin"
deepseek-harness/packages/client` returns nothing. The only call site in the
whole repo is `apps/acryl-cli/src/tui/login/LoginOverlay.ts`'s own doc
comment: "Selecting a provider and pressing enter runs its flow through
`ctx.authorization.begin`."

This is the actual gap this milestone closes: a UI-only gap, not a missing
capability.

## Q4 - Do Desktop and Web share one client renderer, or two?

**Answer**: one. Both compose on `dsh-web-app`; Desktop's Electron `BrowserWindow`
loads the same web frontend Web serves directly. The provider/model settings
screen is the vendored `@deepseek-ai/dsh-client-ui-settings-models` package
under `deepseek-harness/packages/client/ui-settings-models/`, already patched
once by this repo (`patches/@deepseek-ai__dsh-client-ui-settings-models@0.1.5-alpha.1.patch`,
a small unrelated field-visibility fix to its compiled `lib/client.js`).
This confirms R2 (one shared component, not two).

## Q5 - How does that settings client already talk to the backend?

**Answer**: through a `ModelsOperations` interface
(`deepseek-harness/packages/client/ui-settings-models/src/client/operations.ts`)
- Host-built callbacks passed into client "cards" (`describeCredential`,
`storeCredential`, `removeCredential`, `applySettings` path-ops,
`discoverModels`), each returning a typed outcome union (`written` /
`conflict` / `refused` / `found`). This is the seam an OAuth control extends:
add `beginAuthorization`/`authorizationStatus` (or similar) alongside the
existing credential operations, wired server-side to the same
`ctx.authorization` service `LoginOverlay.ts` already drives, carried across
the Web/Electron boundary the same way `SettingsNamespaceView` already is
(`@deepseek-ai/dsh-api-remotes`).

## Q6 - Patch the vendored package, or ship a new ACRYL-owned plugin?

**Resolved: (b), a new ACRYL-owned client plugin. No patch needed.**

`deepseek-harness/packages/client/ui-settings-models/src/client/slot-contract.ts`
declares exactly this extension point already, unrelated to this milestone -
it predates it:

```ts
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.models.provider-card': { kind: 'keyed'; scope: 'root'; owner: ProviderCardExtrasOwnerProps }
    'settings.models.footer': { kind: 'list'; scope: 'root'; owner: ModelsFooterOwnerProps }
  }
}
```

Its own doc comment: "the two seats through which a plugin distributed
outside this repository adds UI to the Models settings section without
editing it." `settings.models.provider-card` is keyed by
`ProviderDirectoryEntry.settingsNs` - "an adapter family's companion plugin
registers one entry under the family's namespace and receives every card of
that family." `ProviderCardExtrasOwnerProps` already carries the row's
directory entry, `configured`, and `keyConfigured` - everything a "Sign in
with your account" control needs to decide what to render.

This means: no patch to `@deepseek-ai/dsh-client-ui-settings-models`'s
compiled output at all. A new ACRYL-owned package (same pattern as
`dsh-client-ui-brand-acryl`) registers one `settings.models.provider-card`
entry for the `pi-ai` settings namespace, calling the same
`ModelsOperations`-style Host bridge (Q5) into `ctx.authorization`. This is
real TypeScript source under normal review/build/test, not compiled-JS
patching - exactly the plugin-architecture pattern this repo's own recent
work (spec 034) already established for every other cross-surface capability.

## Q7 - Manual-code fallback: does Desktop/Web need one?

The TUI's `LoginOverlay` supports a `text` prompt variant for a manual-code
paste (the fallback some OAuth providers use when a redirect can't reach a
local server, e.g. a headless SSH session). Desktop always has a system
browser and Web always has the browser it's running in, so the redirect-based
flow should always be reachable on both - the manual-code path is TUI-specific
and explicitly out of scope (spec.md) unless real testing (T-series, see
`tasks.md`) finds a surface/network combination where the redirect genuinely
cannot land back in the app.
