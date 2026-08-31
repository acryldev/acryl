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

### Stage 1 — API-key login

- `/login` (no argument) lists providers and their current auth status
  (configured / unconfigured), and shows how to get a key for each.
- `/login <provider>` opens an API-key entry surface for that provider and
  durably stores the key.
- `/logout <provider>` clears the stored credential for that provider.
- All credentials are stored through the existing DSH `ctx.credentials` service
  (env-var references resolved by the provider-managed store). No new plaintext
  secret file, and the key value is never echoed to the transcript or logs.
- Auth guidance: when the active model's provider has no configured key, the TUI
  surfaces a clear "no API key for <provider> — run /login" message (modeled on
  Pi's `auth-guidance.ts`).

### Stage 2 — OAuth login

- `/login <provider>` offers OAuth where the provider supports it: open a browser
  to the provider authorize URL, complete the loopback redirect, and persist the
  resulting grant.
- Grants are stored via the DSH credentials service (`GrantRecord`), refreshed
  before expiry, and removed by `/logout`.
- Provider OAuth metadata (authorize/token endpoints, client id/secret source)
  lives in provider config, not hardcoded in the TUI.

## Acceptance criteria

### Stage 1

- `/login` lists providers with auth status; `/login <provider>` stores a key
  through `ctx.credentials`; `/logout <provider>` clears it.
- A fresh session with no key configured shows the `/login` guidance message.
- The key value is never written to the transcript, session log, or stdout.
- Tests + typecheck + build green; `acryl tui --json` boot smoke passes.

### Stage 2

- A provider's OAuth flow completes end-to-end against a test/staging grant and
  the CLI authenticates without an API key.
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
