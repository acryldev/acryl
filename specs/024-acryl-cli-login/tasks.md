# Tasks: ACRYL CLI `/login` + `/logout` provider authentication

## Stage 1 — API-key login (build, test, publish)

- [ ] L001 Read the credentials write path: `CredentialProvider` interface
  (`deepseek-harness/packages/credentials/credentials/src/index.ts`) and the
  current `ModelProfileOverlay` persistence; record the exact
  describe/resolve/modifyRecord semantics in `research.md`.
- [ ] L002 Add `/login` and `/logout` to `SLASH_COMMANDS` + `runSlashCommand`
  dispatch in `commands.ts`, with parsing helpers (`parseLoginCommand` /
  `parseLogoutCommand`) and unit tests.
- [ ] L003 Add `openLogin()` and `logout()` to the `TuiActions` interface and its
  implementation; wire them in the session/actions layer.
- [ ] L004 Add `auth-guidance.ts` (guidance strings + "no API key for <provider>"
  formatter, modeled on Pi) with unit tests.
- [ ] L005 Implement `LoginOverlay`: provider list with `describe()`-derived
  status, and per-provider API-key entry that persists through `ctx.credentials`
  (reusing the model-profile credential plumbing); `/logout` clears it.
- [ ] L006 Wire auth guidance into session start and the `/login` no-argument
  list; assert the key value never reaches the transcript/stdout.
- [ ] L007 PTY smoke evidence: `/login` stores a key to a throwaway env and
  `/logout` clears it; `acryl tui --json` boot passes.
- [ ] L008 Focused commit + `DEVELOPMENT-LOG.md` checkpoint; bump + tag + release
  when green (publish stage).

## Stage 2 — OAuth login (after Stage 1 is published)

- [ ] L009 Define provider OAuth metadata shape (authorize/token endpoints,
  client id/secret source) and a provider list.
- [ ] L010 Loopback redirect listener for the authorization-code callback.
- [ ] L011 Grant storage + refresh + revocation via `ctx.credentials`
  (`GrantRecord`).
- [ ] L012 Extend `LoginOverlay` with an OAuth vs API-key selector (Pi
  `oauth-selector` shape).
- [ ] L013 OAuth integration test with a stub provider (fake authorize/token);
  focused commit + log checkpoint.

## Definition of done

Stage 1: `acryl tui` supports `/login`/`/logout` for API-key providers, stores
keys only via `ctx.credentials`, shows guidance when a key is missing, and never
leaks a key to the transcript; tests + typecheck + build green; published to npm.

Stage 2: `/login` completes a browser OAuth flow, persists/refreshes the grant,
and `/logout` revokes it; integration-tested against a stub provider.
