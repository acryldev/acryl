# Stage 2 OAuth — Cordis mini-design

## Capability and plugin boundary

OAuth login is **not** a new Cordis plugin. The credential seam
(`dsh-credentials`) already owns grant storage through the `GrantRecord`
union and the `modifyRecord` / `readRecord` / `deleteRecord` methods on the
`<scope>/<id>` record space (disjoint from the API-key `CredentialRef` space,
because the `/` keeps the two grammars apart). The OAuth browser dance is a
TUI-surface operation that rides that existing capability — the same
relationship Stage 1 established for API-key `/login` (surface) versus
`credentials.set`/`unset` (capability).

No new Loader row, no new service, no new lifecycle-owned capability. Auth stays
core-but-capability-shaped: storage is a Cordis service already in the base
profile; the OAuth flow is surface logic that consumes it.

## Provides and consumes

Consumes (Cordis):
- `ctx.credentials` (inject): `modifyRecord(key, mutate)` to store/refresh a
  `GrantRecord`, `readRecord(key)` to read, `deleteRecord(key)` to revoke.
- `ctx.llm` (`ctx.get`, optional): enumerate provider routes for the selector.

Provides (surface operations, not a service):
- `loginWithOAuth(meta)` → run the flow, resolve `{ ok } | { error }`.
- `refreshOAuthGrant(meta)` → use `refresh_token`, re-store the grant.
- `revokeOAuthGrant(meta)` → `deleteRecord`.

## Effects and disposal

The flow owns exactly one transient resource: an ephemeral `http.Server` bound
to `127.0.0.1:0` (loopback, OS-assigned port) that receives the authorization
code callback once. It is opened inside `try/finally` and `close()`d before the
flow settles; a timeout (default 5 min) aborts and closes it. The PKCE code
verifier and `state` are in-memory only — never durable, never logged, never
surfaced to the transcript.

## Configuration and composition

Provider OAuth metadata is a static config table (no runtime schema, no Loader
row), keyed by provider route:

- `authorizeUrl`, `tokenUrl`, `clientId`, `scopes`, optional `audience`,
  `pkce: boolean`
- `grantKey`: `<owner-scope>/<provider-route>` (a `CredentialKey`)

The grant payload is owner-defined and opaque to the seam; the OAuth owner
writes `{ access_token, refresh_token, token_type, expires_at }`.

## Events and durability

The grant is durable (written via `modifyRecord`), and every write emits
`credentials/record-updated` (already handled by the seam). The TUI re-reads the
record on boot to render OAuth status. No additional event wiring.

## Verification

- L013: integration test against a stub provider — in-memory authorize/token
  endpoints plus a loopback redirect to `127.0.0.1:<port>/callback` — asserting
  code→token exchange and grant persistence through a real `modifyRecord`.
- PTY smoke: `/login <oauth-provider>` opens the loopback listener and reaches
  the provider authorize URL (captured, not navigated).
- Typecheck + unit tests green.

## Open risk to close during implementation

Verify the active credentials provider in the base profile actually implements
`modifyRecord` / `readRecord` / `deleteRecord` (not just the API-key `set` /
`unset`). Stage 1 found the TUI persistence stubbed; confirm the record half of
the seam is live before building on it.
