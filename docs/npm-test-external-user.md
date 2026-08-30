# External-user test: `npm i -g acryl` (as a fresh user)

**Reproduced 2026-08-30 on z370n (Linux, isolated prefix — clean external-user view).**
**Result: ❌ BROKEN — the published npm package silently does nothing.**

## What I did (exactly what a user runs)

```sh
npm install -g acryl        # → installed acryl@0.1.8, 460 packages, exit 0
acryl --version             # → prints NOTHING, exits 0
acryl --help                # → prints NOTHING, exits 0
command -v acryl            # → /.../prefix/bin/acryl (symlink → ../lib/node_modules/acryl/lib/bin.js)
```

## Evidence

| Check | Expected (0.1.10 fix) | Actual (npm 0.1.8) |
|---|---|---|
| `npm install -g acryl` | installs | ✅ installs (0.1.8, 460 pk) |
| `acryl --version` | prints `0.1.10` | ❌ **0 bytes stdout, 0 bytes stderr, exit 0** |
| `acryl --help` | shows help | ❌ 0 bytes, exit 0 |
| `node .../lib/bin.js --version` | prints package version | prints stale `0.1.0-dev.0` (hardcoded) |

## Root cause (already documented in repo)

npm `acryl@0.1.8` shipped the **pre-entrypoint-fix** build. The bug: when the CLI is reached through npm's global-bin **symlink**, `isEntrypoint()` compares a non-realpath'd argv against `import.meta.url`, so the launcher silently never executes. `--version` exits 0 printing nothing. This is exactly what `scripts/verify-npm-entrypoint.mjs` was written to catch.

The **fix is committed in source** (v0.1.10) and CI-verified, but **0.1.10 was never republished to npm** — npm still serves 0.1.8 (published 2026-08-29 22:55 UTC).

## Publish blocker

The repo has **no automated npm publish workflow** (npm auth is a documented human-controlled release boundary). No working npm credential exists on any reachable machine:
- aion (`~/.npmrc`) — token present but **401 Unauthorized** (expired/stale)
- z370n — no npm auth
- wbx24 — no npm auth
- m1max — unreachable

To publish `acryl@0.1.10` I need a **fresh npm access token** for one of the package maintainers (musichen / webboxescom / acryldev). Publish path: build `acryl-tui`, then publish it as the `acryl` npm name.

## Next action

Provide a valid npm token (or run `npm login`), then I will: build `acryl-tui` → run `verify-npm-entrypoint.mjs` → `npm publish` as 0.1.10 → re-test `npm i -g acryl` as external user to confirm `--version` prints 0.1.10.

---

## Status update (supersedes the "BROKEN" conclusion above)

Published and re-tested on macOS 2026-08-30. The fix shipped as `0.1.10` → `0.1.12`
(`npm dist-tags.latest = 0.1.12`), and `acryl --version` now prints the package
version. **However**, an external-user simulation of the *full* boot found the
package still did not run `tui`/`web` — the Cordis plugin tree failed to apply
the `cordis:include` loader entries because the published dependency map omitted
the DSH profile-bundle plugin packages (`@deepseek-ai/cordis-plugin-timer`,
`-hmr`, `@deepseek-ai/dsh-typert-loader`) and the `@koromix/koffi-*` natives.

That gap is addressed in commit `3d12e82` (see
`docs/DEVELOPMENT-LOG.md` → "external npm CLI: full-boot verified and
closure-completeness gated"): the publish script now derives the dependency map
from the real production closure and gates on loader-entry completeness. The
`--version`-only check in this file was insufficient — the definitive check is a
full `npm i -g` + `acryl tui --json` boot.
