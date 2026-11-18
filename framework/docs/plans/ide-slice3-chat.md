# Slice 3: chat, model connection and sessions

The chat is the first tab of the main surface, beside the terminal tabs, and shows DSH's conversation (slice 2's
canvas already mounts it). Slice 3 adds the first-run way to connect a model in the frame, proves where the key goes
and that the chat uses it, and makes a session survive a restart in the left pane.

## What changed

- **The first-run card** (`ide/acryl-workspace/src/client/models/`): a non-modal card at the top of the active chat
  tile. It reads DSH's own provider and credential faces (retrying for a few seconds while the page's Remote services
  come up), asks for one API key, and writes it with `remote.credentials.set('DEEPSEEK_API_KEY', key)`, the reference
  the official DeepSeek route resolves through by default. The key is never held after the write: the field is
  cleared and no state keeps it. The card leaves once a credential is configured and is dismissible ("Not now",
  remembered in browser storage). "Settings" opens Settings > Models for any other provider. 14 unit tests cover
  readiness, the write, dismissal, errors and the retry.
- **The app is the first project**: the workspace host adds the app's own folder when the project list is empty, so
  the left pane has a place for the first chats and the agent works where the app lives. The generated overlay points
  DSH's workspace controller `documentsDirectory` at the app's `ACRYLBLENDS_HOME` (`<app>/.acrylblends` when unset),
  so the first chat's workspace is inside the app folder and a test run never writes into the user's Documents.
- **A restored session is placed by its tab**: after a restart DSH's session summary can arrive without a `cwd`; the
  left pane now lists such a chat under the worktree whose tab set holds its open tab, instead of leaving it out.
- **The gate** (`scripts/verify-ide-profile.mjs`): a local Anthropic-Messages mock records every request. The gate
  generates and boots a fresh app, enters the key in the frame's card, sends a message, asserts the model request
  carried that exact key, the Host stored it in `$DSH_HOME/.credentials.yaml` mode 600, no file under the app
  (node_modules, `.acryl` and the door audit log included) contains it, the session is in the left pane, and after a
  restart it is still there. `scripts/frame-views.json` dismisses the card ("Not now") in each view so the frame
  comparison sees the same empty frame as the reference.

## Gate output, 2026-10-30

```
verify-ide-profile: the frame takes an API key in its first-run card, and the card leaves once it is stored
verify-ide-profile: the chat sent a message with the key, and the local model answered
verify-ide-profile: the session is in the left pane's list as "Gate session"
verify-ide-profile: the Host stored the key in its own credentials file, mode 600
verify-ide-profile: no file under the app (the app folder, .acryl or the door audit log included) contains the key
verify-ide-profile: the session "Gate session" is in the left pane after a restart
verify-ide-profile: every row activated, no pending or failed entry in the log
verify-ide-profile: OK
```

The mock saw `POST /v1/messages` with `x-api-key` equal to the key the gate typed
(`sk-acryl-gate-1234567890`), for the chat turn and for the session-title request. The workspace package check ran 98
spec files: 817 passed, 1 skipped (803 passed + 1 skipped in slice 2, plus 14 new).

## Frame comparison

The same command as slice 2 against the recaptured opaque reference, with the card-dismissal step in every view:
13 of 18 views within 2%, the same count as the slice 2 baseline. No chat-visible view regressed.

| View | 1440x900 | 1024x768 |
| --- | --- | --- |
| frame | 0.62% pass | 1.00% pass |
| frame-dark | 0.62% pass | 1.00% pass |
| frame-light | 0.59% pass | 0.94% pass |
| left-panel-collapsed | 0.34% pass | 0.50% pass |
| right-panel-open | 1.94% pass | 2.52% |
| terminal-tab | 0.46% pass | 0.79% pass |
| settings-general | 3.12% | 4.12% |
| settings-models | 1.45% pass | 2.85% |
| settings-shortcuts | 1.85% pass | 2.35% |

`right-panel-open@1024` misses by the same desktop-only Browser row documented in
[slice 2](ide-slice2-frame-comparison.md): DSH's web bundle enables `ui-sidebar-browser` only for a desktop profile.
The settings views are DSH's own dialog and are not slice 3 targets. The frame views now also carry the seeded app
project row in the left pane (the reference was captured before the app folder was a project); they still pass.

## Notes

- OAuth/account sign-in is slice 5. Until then a person already signed in with an account may still see the card,
  because its availability is the Models page's own join (`ProviderRow.accountAvailable`), which the narrow step does
  not rebuild; Settings > Models is one click away, and slice 5 extends the check.
- The key's only home is DSH's credentials file under its own home. The gate scans the app folder including
  node_modules and `.acryl`, and the page after the write.

## Evidence

- `ide-slice3-chat-evidence/frame@1440x900.compare.png`
- `ide-slice3-chat-evidence/left-panel-collapsed@1440x900.compare.png`
- `ide-slice3-chat-evidence/right-panel-open@1440x900.compare.png`
- `ide-slice3-chat-evidence/right-panel-open@1024x768.compare.png` (the Browser-row miss, as in slice 2)
- `ide-slice3-chat-evidence/terminal-tab@1440x900.compare.png`

Each image is reference | candidate | difference (red where a pixel differs).
