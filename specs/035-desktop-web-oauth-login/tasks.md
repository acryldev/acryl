# Tasks: OAuth provider login on Desktop and Web

Ordered. Each task lands as its own commit with its evidence; a task that
cannot show its evidence is not done. `T001` gates everything after it by
closing `plan.md`'s open questions.

## T001 - Confirm the exact wiring facts

**Files**: `research.md` (append answers), no code yet.
**Do**: read `deepseek-harness/packages/llm/llm-pi-ai/src/login.ts` and
`provider.ts` end to end to get the exact `settingsNs` the pi-ai adapter
family's rows carry; read how `@deepseek-ai/dsh-api-remotes` actually carries
an existing `ModelsOperations` call across the Electron IPC boundary (find
the real route/preload/IPC-handler triple for e.g. `storeCredential`) so the
new operation's transport matches an established pattern instead of guessing.
**Evidence**: exact file:line citations for both facts, appended to
`research.md`.
**Done when**: plan.md's "Open questions T001 must close" section has real
answers instead of placeholders.

## T002 - Host bridge: `beginAuthorization`/`authorizationStatus`/`cancelAuthorization`

**Files**: wherever `ModelsOperations` (or its sibling, per T001's answer) is
defined and implemented server-side; `runtime/acryl-control/src/authorization/
service.ts` if it needs a new typed method (it may already expose everything
`LoginOverlay.ts` needs - check before adding).
**Do**: add the Host-side operation(s) backed by `ctx.authorization.begin`
(same call `LoginOverlay.ts` uses), returning the same outcome-union shape
style (`written`/`conflict`/`refused`/`found`) `ModelsOperations` already
uses, adapted to authorization's own states (unconfigured/in-flight/
configured/refused).
**Evidence**: a route/bridge-level test that calls the new operation directly
(no client UI involved yet) and asserts a real `ctx.authorization` state
transition.
**Done when**: the operation is callable and tested with no client UI
depending on it yet - Slice 1 from `plan.md`.

## T003 - New client plugin: `dsh-client-ui-oauth-login`

**Files**: new package (path/exact name confirmed against this repo's naming
convention for `dsh-client-ui-*` packages - check
`plugins/dsh-client-ui-brand-acryl`'s own package.json shape as the direct
template).
**Do**: register one entry into the `settings.models.provider-card` slot
keyed by the settingsNs from T001; render the three states (unconfigured /
`✓ configured` / in-flight) per spec.md R1, with no `-oauth` display-name
encoding (R1, `architecture-guardrails.mjs` gate G2 must stay green); call
T002's bridge on selection; render `refused` outcomes inline per R4.
**Evidence**: component-level test asserting all three states render
correctly from a given `ProviderCardExtrasOwnerProps`, and that a `refused`
outcome shows the Host's own message text.
**Done when**: the control renders correctly against a scripted/mocked
bridge - real end-to-end OAuth is T005/T006.

## T004 - Compose the plugin on Web and Desktop

**Files**: `runtime/acryl-harness-runtime/src/coding-capabilities.ts`,
`engine-dsh.ts` (Web/Desktop composition call sites), `apps/acryl-desktop/
src/profile.ts` if Desktop's own profile assembly needs the row too (check
against how `dsh-client-ui-brand-acryl` is already composed as the direct
precedent - same shape, new row).
**Do**: insert the new Loader row (`id` = package name, per `AGENTS.md`) on
`web` and `desktop` only; leave `tui` untouched (`LoginOverlay.ts` stays the
TUI's own path, per spec.md's out-of-scope list).
**Evidence**: `acryl-harness-runtime`'s own composition tests (same
table-driven style spec 034 used) asserting the exact row set per surface.
**Done when**: a real `web` and `desktop` engine boot includes the row with
no other row disturbed.

## T005 - Real end-to-end verification on Web

**Files**: `apps/acryl-web` (no source change expected; this is a real-account
verification task, not an implementation one).
**Do**: boot Web, open the Models settings screen, pick an OAuth provider,
complete a real sign-in in a real browser tab, confirm the credential goes
live and the row shows `✓ configured` without a page reload.
**Evidence**: written into this file's own evidence log (or `evidence/`
alongside this spec) - which provider was used, what the row showed before/
after, confirmation no plaintext secret landed anywhere outside
`ctx.credentials`'s own store.
**Done when**: spec.md's Web acceptance criterion is met with a real account,
not a mock (this repo's own bug/feature verification discipline, `CLAUDE.md`).

## T006 - Real end-to-end verification on Desktop

**Files**: `apps/acryl-desktop` (no source change expected, same as T005).
**Do**: same as T005, but confirm the OAuth redirect opens the **system**
browser (not an in-app `BrowserWindow`) and correctly hands control back to
the running Electron app afterward.
**Evidence**: same shape as T005's, plus explicit confirmation of which
browser-opening mechanism fired (cite the exact Desktop capability/module
used) and that it matches the mechanism the plan's risk note asked about.
**Done when**: spec.md's Desktop acceptance criterion is met with a real
account on a real Electron build (dev or packaged - state which).

## T007 - Full gate

**Files**: none (verification only).
**Do**: `pnpm run check` (layout, debt, every package's own typecheck/test/
build/verify chain) plus the CLI's own login test suite specifically, to
confirm this milestone touched nothing under `apps/acryl-cli`.
**Evidence**: full green run pasted/linked into this task's evidence.
**Done when**: the gate is green and the CLI's `/login` suite is unchanged
(diff-empty) from before this milestone started.
