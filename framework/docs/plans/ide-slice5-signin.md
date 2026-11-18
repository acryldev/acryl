# Slice 5: account sign-in

Sign in to a model provider with an account from Settings > Models: Claude (Anthropic), ChatGPT/OpenAI Codex, DeepSeek,
and every other provider whose harness flow offers a browser sign-in. The card opens the provider's sign-in page, shows
the flow's notices and questions, and makes the provider usable when the flow succeeds. The security boundary is the
point: the tokens belong to DeepSeek Harness's authorization and credential store, and nothing of them reaches the
page, the app folder or `.acryl`.

## The port

`ide/acryl-sign-in/` is ACRYL's `plugins/acryl-sign-in` at `37f4dd9c`, extracted with `git archive`: every file under
`src/`, `tests/`, `scripts/` and the build configs is byte-identical, the four original spec files run unchanged (30
tests), and `provenance.json` records the three differences:

- `package.json`: repository points here; `acrylblends` is a peer dependency and the dev dependency, not a dependency
  (the app's one framework); the build tools match this repository (tsdown 0.23.0, vitest 5.0.3, `@types/node` ^24);
  `@acryl/ui`, `acryl-control` and `acryl-loopback-http` are this repository's workspace packages.
- `vitest.config.ts`: ACRYL isolated HOME through `scripts/testing/isolate-home.ts`, which this repository does not have;
  the `setupFiles` entry is removed. These tests do not touch a home.
- `README.md`: a port note above the original text.

The package's terminal-only `account-callback` entry is ported with it because it is part of the npm package; the frame
mounts the main sign-in row, not the account-callback row. The new `tests/security.spec.ts` is added beside the four
original files.

## Wiring into the frame

`acryl-sign-in` is a row in `FRAME_PACKAGES` (after `acryl-support`), so the generated overlay mounts it and the
generated profile installs it with the other frame packages. Its client half registers the card in the Models page's
`settings.models.footer` seat; the host half serves the `/api/acryl-sign-in` routes and needs the router, `routerHttp`,
`acrylWeb`, and the harness's `authorization` and `credentials` services, all present in the frame's composition.

The boot gate now asserts both halves: its row check includes `acryl-sign-in` and reports every row activated, and its
browser check opens Settings > Models and requires the `.acrylSignIn` card in the page. The gate stays green.

## The slice 3 fix: a signed-in account never sees the API-key card

The first-run connect card now uses the Models page's own account join (`ProviderRow.accountAvailable`): it asks
`remote.session.modelCatalog()` and treats a live `deepseek-account` group with at least one model as usable, exactly
the fact the Models page reads. A signed-in account therefore keeps the card away; a registered route without a live
model does not, and the card still asks for a key. The two cases are tests on the control
(`ide/acryl-workspace/tests/models/model-connect.spec.ts`), and the key-path checks remain.

## Security

- **Where tokens live.** The harness's authorization flows write their grants through the credentials service's
  serialized record write; the credentials document is under the harness home (`$DSH_HOME/.credentials.yaml`, mode 600),
  never the app. `acryl-sign-in` stores no secret itself: it relays the flow's notices and prompts over its routes and
  hands a typed answer to the flow (the ported route test asserts no response echoes an answer; responses carry no
  secret). Nothing in the package writes a file.
- **The test.** `ide/acryl-sign-in/tests/security.spec.ts` runs a fake browser-style sign-in through the real
  `SignInController`: the flow sends the person to its page, waits for the redirect URL, receives a fake browser code,
  and the harness side records a grant holding a fake access token. The attempt moves `running` to `authorized`; the
  attempt views carry neither the code nor the token; the harness store is the only holder; a scan of a temporary app
  folder and its `.acryl` (including an audit log) finds neither string.
- **The boot gate.** Its real scan still proves no API key lands anywhere under the app (node_modules, `.acryl` and the
  door audit log included); the key's only file is the harness home's credentials document at mode 600.
- **`make-entry` and the production build.** They pack the app folder and the framework's plugins, not the harness home;
  the OAuth grants live only in the harness home, so no token can ride them.

## Comparison

The 26-view comparison (18 existing references + 8 new, captured as slice 4 describes) is **20 of 26 within 2%**, the
same total as before this slice, with the existing 18 at 13 passes and the 8 new views at 7:

- `settings-models@1440x900` improved from 1.45% to 1.21% (the reference's Models page includes the same sign-in card,
  which this app now mounts); `settings-models@1024x768` went from 2.85% to 2.55%, still above 2.
- Every other view is within noise of slice 4; `file-editor@1024x768` remains the one 2.02% miss documented there.

## Findings

- No upstream blocker was found against DSH 0.2.0-rc.2: the port is byte-identical to ACRYL's source that runs on the
  same pin, and the flows are DSH's own authorization catalog (DeepSeek's account is DSH's `deepseekAccount` service).
- Real provider logins were not performed end-to-end here (that needs real provider accounts); the mechanics are
  covered by the ported suite and the security test, and the card's provider list is DSH's live catalog through the
  package's routes.

## Tests

- `ide/acryl-sign-in`: 5 spec files, 31 tests (the 4 original files with 30 tests, plus the security test).
- `ide/acryl-workspace`: 98 spec files, 819 passed, 1 skipped (the account-join cases are part of it).
- The boot gate: green, with the sign-in row active and the card mounted.

## Evidence

- `ide-slice5-signin-evidence/settings-models@1440x900.compare.png` (the Models page, reference | candidate | difference)
- `ide-slice5-signin-evidence/settings-models@1024x768.compare.png`
