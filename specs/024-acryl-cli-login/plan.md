# Plan: ACRYL CLI `/login` + `/logout` provider authentication

**Feature Directory**: `specs/024-acryl-cli-login`

## Design decision: core-but-capability-shaped

`/login` + `/logout` are **core** — the essence of a coding agent — so they must
NOT be an optional/toggleable plugin that a profile can disable. But they must
still follow "everything is a plugin" as closely as technically possible.

Resolution: the auth *logic* lives entirely in the existing DSH
`ctx.credentials` capability (the `dsh-credentials` + `dsh-credentials-local`
plugins, composed in the base profile), and the TUI `/login`/`/logout` commands
are only a client surface that consumes that capability. No new auth system, no
hardcoded secret storage. Stage 2's OAuth extends the same capability via its
`GrantRecord` space (`modifyRecord`/`readRecord`/`deleteRecord`), rather than
introducing a parallel OAuth service.

## Architecture summary

ACRYL's TUI already boots the DeepSeek Harness in a pi-tui terminal and exposes a
data-driven slash-command surface (`acryl-tui/src/tui/commands.ts`) dispatched to
`TuiActions`. The `/model` command already opens a `ModelProfileOverlay` that edits
provider route/API/baseURL/API-key, and the DSH `ctx.credentials` service
(`CredentialProvider`) is the single source of truth for secrets.

The new work builds on those two seams rather than introducing a parallel auth
system (per the Cordis protocol: do not add a second lifecycle/DI/secret
framework).

### Stage 1 — API-key login

1. **Slash commands**: add `/login` (description "Configure provider authentication")
   and `/logout` ("Remove provider authentication") to `SLASH_COMMANDS`, and dispatch
   both in `runSlashCommand` via new `TuiActions.openLogin()` / `TuiActions.logout()`.
2. **Login overlay**: a new `LoginOverlay` pi-tui component that (a) lists providers
   with `describe()`-derived status, (b) for `/login <provider>` focuses that
   provider's API-key entry. Reuses the `ModelProfileOverlay`'s credential plumbing
   (route → apiKeyRef → `ctx.credentials.describe` / `modifyRecord`) rather than
   duplicating it.
3. **Auth guidance**: an `auth-guidance.ts` helper (modeled on Pi's) that formats
   "no API key for <provider> — run /login" and the "how to get a key" text. Wired
   into session start and the `/login` no-argument list.
4. **Logout**: clear the credential via `ctx.credentials.modifyRecord` (delete/blank
   the stored record for the provider route).

### Stage 2 — OAuth login

1. **Provider OAuth metadata**: a config shape for authorize/token endpoints and
   client-id/secret resolution (env or provider config).
2. **Loopback redirect**: a short-lived local HTTP listener to receive the OAuth
   authorization-code redirect (modeled on Pi's oauth flow).
3. **Grant storage + refresh**: persist the `GrantRecord` via `ctx.credentials`
   (`GrantRecord` already exists in the credentials type surface), refresh before
   expiry, and remove on `/logout`.
4. **Selector**: extend `LoginOverlay` to offer OAuth vs API key where the provider
   supports both (Pi's `oauth-selector` + `login-dialog` shape).

## Key files

- `acryl-tui/src/tui/commands.ts` — slash command table + dispatch.
- `acryl-tui/src/tui/actions.ts` — `TuiActions` interface.
- `acryl-tui/src/tui-app/` — overlay components (`ModelProfileOverlay` sibling).
- `acryl-tui/src/tui/auth-guidance.ts` (new) — guidance strings.
- `acryl-tui/src/tui/LoginOverlay.tsx` (new) — login UI.
- `deepseek-harness/packages/credentials/credentials/src/index.ts` — `CredentialProvider`
  (read-only upstream; interface only).

## Verification

- Stage 1: unit tests for command parsing/dispatch, overlay state, and guidance;
  a PTY smoke that `/login` stores a key (to a throwaway env) and `/logout` clears
  it, asserting the key never reaches stdout. `pnpm run typecheck` + `pnpm run test`
  + `acryl tui --json` boot.
- Stage 2: an integration test with a stub OAuth provider (fake authorize/token)
  completing the loopback flow and persisting/refreshing a grant.

## Risks / decisions

- **Credential write path**: confirm `ctx.credentials` exposes `modifyRecord` for the
  active route (or whether API keys are only writable via env/files). If the CLI
  cannot write through the service, fall back to writing the provider-managed store
  the service resolves — but only that store, never a new plaintext location.
- **Provider list**: which providers ship first (DeepSeek default, then Anthropic /
  OpenAI / Gemini / Pi.ai as config permits). Affects the `/login` list and any OAuth
  metadata.
