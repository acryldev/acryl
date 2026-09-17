# Feature Specification: OAuth provider login on Desktop and Web

**Tracking:** https://github.com/acryldev/acryl/issues/52

**Feature Directory**: `specs/035-desktop-web-oauth-login`
**Created**: 2026-09-14. **Status**: scoped, not started.
**Input**: user direction — CLI's `/login` OAuth flow (spec 024) already works
for Anthropic, OpenAI Codex, GitHub Copilot, Kimi For Coding, xAI, and Radius
(all `@earendil-works/pi-ai` catalog entries; OpenRouter is api-key-only and
out of scope). Desktop and Web need the same capability. Reuse the CLI's
implementation as the reference, do not re-derive the OAuth/authorization
design from scratch.

## Objective

Give ACRYL Desktop and ACRYL Web a real "sign in with an account" control in
their existing provider/model settings screen, backed by the same
`ctx.authorization` service the TUI's `/login` overlay already drives. A user
on Desktop or Web should be able to pick a provider, complete the browser
OAuth handshake, and see the resulting credential go live in `/model`/the
provider list - with no separate implementation of the OAuth protocol itself.

## Why this is smaller than it sounds

Confirmed by direct inspection before this spec was written (see
`research.md` for the exact evidence):

- The OAuth flows themselves (`anthropic.js`, `openai-codex.js`,
  `kimi-coding.js`, `github-copilot.js`, `xai.js`, `radius.js`) already ship in
  the vendored `@earendil-works/pi-ai` package. Nothing about the protocol,
  client ids, token exchange, or refresh needs to be written.
- `runtime/acryl-harness-runtime/src/coding-capabilities.ts` already composes
  the `authorization` capability (`@deepseek-ai/dsh-authorization`) on
  `['tui', 'web', 'desktop']`. The backend service is already present and
  reachable on every surface today; this is not new composition work.
- The gap is entirely a client-UI one: no call site anywhere under
  `deepseek-harness/packages/client/**` invokes
  `ctx.authorization.begin`/its Remote equivalent. `apps/acryl-cli/src/tui/
  login/LoginOverlay.ts` is the only caller in the whole codebase.

So this milestone is "add one client-side login control that calls an
existing backend service the same way the TUI already does," not "add OAuth
support."

## Requirements

### R1 - Provider list parity with the TUI

- The set of offerable OAuth providers must come from the same source
  `LoginOverlay.ts` reads (whatever `ctx.authorization`/`dsh-llm-pi-ai`
  registers), not a hand-maintained list in a Desktop/Web component. A new
  provider becoming available in `/login` must not require a matching Desktop/
  Web code change.
- Each provider row shows the same three states the TUI shows: unconfigured,
  configured (`✓ stored`), in-flight. No `-oauth` display-name suffix or other
  state encoded into a user-visible name (this repo's own rule, `CLAUDE.md` §
  "Models and language" - already the subject of a fixed anti-pattern, see
  `architecture-guardrails.mjs` gate G2).

### R2 - One shared client control, not two

- Desktop and Web share one renderer (`dsh-web-app` + the settings-models
  client package) - see `research.md` for the confirmed shared-package fact.
  Ship **one** client component; do not build a Desktop-specific and a
  Web-specific login control.

### R3 - Real browser handshake, not a stub

- Selecting an OAuth provider opens the actual authorization URL (system
  browser on Desktop; a new tab/window on Web - both already need to work,
  since neither surface owns a PTY the way the TUI's manual-code fallback
  does). The flow must reach a real "waiting for you to complete sign-in"
  state and durably store the resulting grant through the existing
  `ctx.credentials` service - no new plaintext secret file.

### R4 - Failure and cancellation are visible

- A refused/cancelled/expired OAuth attempt shows the Host's own diagnostic
  message in the settings UI (mirrors `ModelsOperations`' existing
  `refused`/`conflict` outcome shapes) rather than failing silently or
  leaving the row stuck "in-flight."

### R5 - No parallel lifecycle or protocol

- Per the Cordis development protocol (`CLAUDE.md`): this must build on the
  existing `authorization` service, `ctx.credentials`, and whatever Remote/
  RPC bridge already carries `ModelsOperations` calls across the Web/Electron
  boundary (`@deepseek-ai/dsh-api-remotes`). No parallel OAuth client, no
  second credential store, no Desktop-only or Web-only backend path.

## Out of scope

- OpenRouter (api-key only, no OAuth flow exists to wire up).
- Any change to the CLI's own `/login` overlay - it is the reference
  implementation, not a target of this milestone.
- Token refresh/rotation policy changes - inherited as-is from `pi-ai`/
  `ctx.authorization`.
- A device-code fallback for headless Desktop/Web sessions (not a currently
  supported mode for either surface; revisit only if a real need appears).

## Acceptance criteria

- A user on Desktop can open Settings → Models (or wherever the provider list
  already lives), pick an OAuth-capable provider, complete sign-in in the
  system browser, and see it go live - verified with a real account, not a
  mock, matching this repo's `CLAUDE.md` bug-fixing discipline ("reproduce the
  issue in an environment as closely aligned as possible with how a real user
  would experience it" applies equally to verifying a new feature actually
  works for a real user).
- The identical flow works on Web in a real browser tab.
- `pnpm run check` stays green; the CLI's own login suite is untouched and
  still green.
