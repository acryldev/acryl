# Research: ACRYL CLI `/login` + `/logout` provider authentication

Facts the plan depends on, recorded as they are confirmed.

## Pi's `/login` reference (cloned 2026-08-31 to `/tmp/pi-inspect`)

- `BUILTIN_SLASH_COMMANDS` includes `login` ("Configure provider authentication",
  arg `<provider>`) and `logout` ("Remove provider authentication").
- `core/auth-guidance.ts`: `formatNoApiKeyFoundMessage(provider)`,
  `formatNoModelSelectedMessage()`, `formatNoModelsAvailableMessage()` — each
  points to `/login`.
- `core/auth-storage.ts`: `CredentialStore` backed by `~/.pi/auth.json` (mode
  0600), keyed by provider, values `{type:"api_key", key, env}` or
  `{type:"oauth", access, refresh, expires}`. Read/modify/delete with file
  locking (`proper-lockfile`).
- `modes/interactive/components/login-dialog.tsx` + `oauth-selector.tsx` are the
  interactive login/oauth UI.

## DSH credentials seam (ACRYL's actual store)

`deepseek-harness/packages/credentials/credentials/src/index.ts` defines
`CredentialProvider extends Service` with `describe(ref)` →
`CredentialInfo { configured, writable, ... }`, `resolve(ref)`, and
`modifyRecord(ref, fn)` (durably store one value; rejects when not writable).
Credentials are addressed by env-var *references*; the provider-managed store
(e.g. `credentials-local`) layers env/file/project-env/user-env.

- **Confirmed (L001)**: `CredentialProvider` has a clean two-space API. API keys
  are stored by env-var *reference* via `set(ref, value)` / `unset(ref)`;
  OAuth grants use the *record* space (`modifyRecord`/`readRecord`/`deleteRecord`
  under a `<scope>/<id>` key). Settings persist via `settings.update(ns, patch,
  expectedRevision)` / `replace`.
- **Confirmed**: the `/model` overlay's `saveProvider`/`deleteProvider`/
  `editProvider` actions were empty stubs in `session.ts` — the overlay rendered
  but never persisted. Stage 1 wired them to `credentials.set/unset` +
  `settings.update`.

## Current ACRYL auth surface

- `/model` → `ModelProfileOverlay` edits provider route, displayName, api,
  baseURL, and API key (apiKeyRef → `ctx.credentials.describe`).
- No `/login` or `/logout`; no OAuth; no auth-guidance helper.
