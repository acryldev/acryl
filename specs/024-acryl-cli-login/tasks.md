# Tasks: ACRYL CLI `/login` + `/logout` provider authentication

## Stage 1 — API-key login (build, test, publish)

- [x] L001 Read the credentials write path: `CredentialProvider` interface + the
  stubbed `ModelProfileOverlay` persistence; recorded in `research.md`.
- [x] L002 Add `/login` and `/logout` to `SLASH_COMMANDS` + `runSlashCommand`
  dispatch, with unit tests.
- [x] L003 Add `login()` and `logout()` to the `TuiActions` interface and wire
  them in the session/actions layer.
- [x] L004 Add `auth-guidance.ts` (guidance strings, modeled on Pi).
- [x] L005 Reuse `ModelProfileOverlay` as the auth surface (no separate
  `LoginOverlay` needed for the API-key stage); implement the previously-stubbed
  `editProvider`/`saveProvider`/`deleteProvider` to persist via `ctx.credentials`
  and `ctx.settings`.
- [ ] L006 Wire auth guidance into session start (helper exists; boot-time
  "no key → run /login" notice is a follow-up).
- [ ] L007 PTY smoke evidence: `/login` stores a key and `/logout` clears it
  (unit + boot smoke pass; interactive PTY smoke is a follow-up).
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
