# Feature Specification: ACRYL CLI `/login` + `/logout` provider authentication

**Feature Directory**: `specs/024-acryl-cli-login`
**Created**: 2026-08-31. **Status**: in progress.
**Input**: user direction — make ACRYL a standalone full-featured coding-agent CLI
(like OpenCode) with a `/login` method to authenticate to the LLM provider; learn
from Pi coding agent (https://github.com/earendil-works/pi); ship in two stages —
API-key auth first, OAuth second.

## Objective

Give the ACRYL terminal client an explicit, guided provider-authentication flow so a
user can log into an LLM provider from inside the TUI and start coding without
pre-seeding environment variables by hand.

Delivered in two stages:

- **Stage 1 (API key)** — `/login <provider>` and `/logout <provider>` for
  API-key-based providers, plus auth guidance when no key is configured.
- **Stage 2 (OAuth)** — browser OAuth flows for providers that require them,
  with grant storage, refresh, and revocation.

## Requirements

> **Design evolution (2026-09-08).** The shipped `/login` is a dedicated
> **two-step sign-in overlay**, not the single-list `/login <provider>` flow
> originally described (and the `/model`-embedded `o`-key selector in the
> original tasks L012). Step one chooses a method type; step two is a
> fuzzy-searchable provider list. The credential-storage invariants below are
> unchanged.

### Step one — choose the authentication method

- `/login` opens a chooser: **“Sign in with an account”** (OAuth) vs
  **“Sign in with an API key”**. When every registered flow offers only one of
  the two method types, step one is skipped automatically (nothing to choose).

### Step two — pick a provider for that method

- The provider list is filtered to the chosen method and **fuzzy-searchable**;
  keyboard-only (arrow keys + type-to-filter). Selecting a provider runs its
  flow through `ctx.authorization.begin` and durably stores the grant/key.
- Each row shows live status: `○` unconfigured, `✓` configured, `·` in-flight,
  plus a `[oauth]` / `[api]` badge derived from the stored credential's kind.
- `Enter` on an already-configured row opens the edit surface rather than
  blindly re-authenticating. `ctrl+p` jumps to “add a custom provider”.
- `Esc` from the provider list returns to the method chooser (or closes the
  overlay when the chooser was auto-skipped); `Esc`/`Ctrl+C` during a flow
  prompt cancels it.

### Credential storage invariants (both stages)

- All credentials are stored through the existing DSH `ctx.credentials` service
  (env-var references resolved by the provider-managed store, and a `/login`
  sign-in writes pi-ai's own record keyed by `<scope>/<id>`). No new plaintext
  secret file; the key value is never echoed to the transcript or logs.
- After a successful OAuth/API-key sign-in the route is activated against
  `ctx.settings` so it becomes live in `/model`. OAuth-signed-in routes get a
  stored `-oauth` display-name suffix so a second, API-key-authenticated route
  under the same catalog name stays distinct.
- Auth guidance: when the active model's provider has no configured key, the
  TUI surfaces a clear “no API key for `<provider>` — run /login` message.
- `/logout` clears the stored credential (and, where applicable, revokes the
  grant); an expired grant is refreshed transparently.

## Acceptance criteria

### Stage 1

- `/login` opens the two-step sign-in: step one (account vs API key, auto
  skipped when only one method is registered), step two a fuzzy-searchable,
  method-filtered provider list; selecting a provider stores the key through
  `ctx.credentials`.
- Rows show `configured` + `authMethod` (`[oauth]`/`[api]`) status; `Enter` on a
  configured row opens edit; `ctrl+p` jumps to add a custom provider.
- `/logout` clears the stored credential.
- A fresh session with no key configured shows the `/login` guidance message.
- The key value is never written to the transcript, session log, or stdout.
- Tests + typecheck + build green; `acryl tui --json` boot smoke passes.

### Stage 2

- A provider's OAuth flow completes end-to-end against a test/staging grant and
  the CLI authenticates without an API key; the route becomes live in `/model`.
- `/logout` removes the grant; an expired grant is refreshed transparently.

## Non-goals

- Stage 1: no OAuth, no new secret storage outside `ctx.credentials`, no changes
  to the web/desktop auth surface.
- Stage 2: no SSO/SAML/device-code flows beyond what a provider's standard OAuth
  2.0 authorization-code flow needs; no multi-account profile manager (a later
  milestone).

## Out of scope (future)

- Full "parity with the web harness" audit (separate milestone).
- A global credential-manager screen spanning providers beyond login/logout.
