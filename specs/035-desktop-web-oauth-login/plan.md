# Plan: OAuth provider login on Desktop and Web

**Spec**: `specs/035-desktop-web-oauth-login/spec.md`
**Status**: scoped, not started
**Created**: 2026-09-14

## Cordis mini-design (per `docs/cordis/cordis_system_guide_for_coding_agents.md`)

1. **Capability and plugin boundary** - a new, independently-versioned client
   plugin (working name `dsh-client-ui-oauth-login`, mirrors
   `dsh-client-ui-brand-acryl`'s own package shape) owns "render a sign-in
   control for pi-ai-backed providers." It needs its own lifecycle because it
   ships independently of both the settings-models package it extends and the
   surfaces (Desktop/Web) that load it.
2. **Provides and consumes**:
   - *Provides*: one registrant into the `settings.models.provider-card`
     client slot (keyed by the pi-ai adapter family's `settingsNs` - exact
     value confirmed in T001), rendering a "Sign in with your account"
     control per `ProviderCardExtrasOwnerProps`.
   - *Consumes*: a Host-side operation (new addition to the `ModelsOperations`
     bridge or a sibling bridge alongside it - T002 decides) that calls
     `ctx.authorization.begin`/status/cancel, the same service
     `LoginOverlay.ts` already drives. Hard `inject` on the client slot
     contract package (`@deepseek-ai/dsh-client-ui-slots`); the Host-side
     operation is consumed through whatever prop-injection `ModelsOperations`
     already uses (not a Cordis `ctx.get` from inside a React component).
3. **Effects and disposal**: an in-flight OAuth attempt (open browser tab/
   window, pending poll) is owned by the Host side (mirrors
   `ctx.authorization`'s own existing lifecycle, already proven safe by the
   TUI) - the client plugin only renders state and dispatches a "start"/
   "cancel" call; it holds no long-lived resource of its own to leak.
4. **Configuration and composition**: Loader row id must equal the package
   name (this repo's own rule, `AGENTS.md`) -
   `dsh-client-ui-oauth-login` gets row id `dsh-client-ui-oauth-login`.
   Composed on `web` and `desktop` only (`coding-capabilities.ts`'s
   `surfaces` field) - the TUI keeps its own `LoginOverlay.ts` untouched.
5. **Events and durability**: no new durable state. The credential grant
   itself already durably persists through `ctx.credentials`
   (spec 024's own invariant, unchanged). The client-side "in-flight" status
   is ephemeral UI state, not replay-critical.
6. **Verification**: real Loader activation on both `web` and `desktop`
   engine compositions; a real OAuth completion against at least one live
   provider account on each surface (spec.md's acceptance criteria - this is
   explicitly not satisfied by a mock); disposal/reload does not leave a
   stuck "in-flight" row.

## Shape of the change

Two slices, each independently shippable and verifiable:

1. **Slice 1 - Host bridge.** Add the server-side operation(s)
   (`beginAuthorization`, `authorizationStatus`, `cancelAuthorization` -
   exact shape decided in T002) alongside the existing `ModelsOperations`
   Host callbacks, backed by `ctx.authorization` - the same service, same
   `begin()` call `LoginOverlay.ts` already uses. No client UI yet; verified
   by a route/bridge-level test calling it directly.
2. **Slice 2 - Client control.** The new `dsh-client-ui-oauth-login` package
   registers into `settings.models.provider-card`, renders the three states
   (unconfigured / configured / in-flight) per R1, and calls Slice 1's
   bridge. Composed into `web` and `desktop` engine definitions in
   `runtime/acryl-harness-runtime/src/engine-dsh.ts` /
   `coding-capabilities.ts`.

## Seam inventory (what exists today, confirmed in `research.md`)

| Concern | Today | This milestone |
| --- | --- | --- |
| OAuth protocol per provider | `@earendil-works/pi-ai`'s `dist/auth/oauth/*.js`, all 6 providers | unchanged, reused as-is |
| Authorization service composition | `coding-capabilities.ts`, already on `tui`/`web`/`desktop` | unchanged |
| Authorization trigger (UI) | Only `apps/acryl-cli/src/tui/login/LoginOverlay.ts` | new client plugin adds the Web/Desktop trigger |
| Settings-page extension point | `settings.models.provider-card` / `settings.models.footer` slots, already declared, unused by ACRYL today | first ACRYL consumer of this slot |
| Host↔client bridge | `ModelsOperations` (`describeCredential`/`storeCredential`/`removeCredential`/`applySettings`/`discoverModels`) | gains an authorization-flow sibling |
| Credential storage | `ctx.credentials`, keyed `<scope>/<id>` (spec 024) | unchanged |

## Open questions T001 must close before Slice 1 starts

- Exact `settingsNs` value(s) the pi-ai adapter family's provider rows carry
  in the Models directory (research.md Q6 flags this as the one unconfirmed
  wiring fact).
- Whether the Host bridge extension belongs as new fields on
  `ModelsOperations` itself, or a sibling interface passed alongside it -
  whichever keeps `ModelsOperations`' own single-responsibility (credential/
  settings CRUD) from absorbing an unrelated concern (this repo's own
  "Functions and state" discipline, `CLAUDE.md`).
- How `@deepseek-ai/dsh-api-remotes` already carries `ModelsOperations` calls
  across the Electron IPC boundary vs. a same-process Web call, so the new
  operation's transport matches without inventing a second bridge mechanism.

## Risks

- **Compiled-dependency drift**: `@deepseek-ai/dsh-client-ui-settings-models`
  is a pinned upstream package. If a future upstream bump changes
  `slot-contract.ts`'s shape, this plugin's registration breaks at typecheck
  time (a good failure mode - loud, not silent) rather than at runtime.
- **Browser-window OAuth on Electron**: Desktop must open the system browser
  (not an in-app `BrowserWindow`) for the OAuth redirect, matching how a
  real user's Anthropic/OpenAI login already expects a trusted browser
  context; confirm which existing Desktop capability already does this
  (likely already used for something - check before adding a new one).
