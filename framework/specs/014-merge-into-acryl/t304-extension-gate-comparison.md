# T304 - extension check and approval gate: aimbrace against ACRYL

Decision: nothing is ported as code now. ACRYL already has each part of the gate; the two differences are small and one belongs to the hosting layer (WebBoxes).

| Part | aimbrace `extensions` | ACRYL | Verdict |
| --- | --- | --- | --- |
| Check before change | `check` returns a structured result (`ok`, `stage`, `errors`, `next`) | `acryl_verify_plugin` (lint, import, Cordis plugin shape, docs pointers per finding) and the install lint | ACRYL has it, richer |
| Declared permissions | none | `acryl.permissions` vocabulary (`fs.read`, `fs.write`, `net`, `shell`, `secrets`, `ui`), `checkManifest`, `describePermissions` | ACRYL only |
| Rollback on a failed update | `restoredPrevious` | `restoredPrevious` (extracted from there) | same |
| Human gate for new code | `ask` trust: an install waits for `approve` or `deny`, recorded in the ledger | `/reload new` typed by the human (a cloned repo cannot run code on its own); per-call approval through the Harness `tools/pre-execute` pipeline when the session policy is `ask` | ACRYL covers an attended session |
| Gate when nobody is at a terminal | the queue of pending installs | Harness policy `never` rejects every ask deterministically, with no one asked | the real gap, and it is a hosting concern |
| Ledger of changes | `ledger.ts` | blend ledger and the DEVELOPMENT-LOG habit for the profile | similar |

## What stays open

1. Install-aware prompt text. The generic approval prompt for `acryl_install_plugin` / `acryl_install_tool` could carry `describePermissions` of the package being installed, so the human decides on "requests: shell, net" and not on a path. Small, ACRYL-side, a `tools/pre-execute` policy in `acryl-extension-context`. Do it when the owner wants it; it needs a look at how the approval prompt takes its text.
2. A pending-install queue for hosted use. In WebBoxes the user is in a browser and the agent runs in a container, so "ask" must become a stored request the web UI shows and answers. That is the `ask` trust of aimbrace, but it needs the WebBoxes UI and its tenant model, so it is specified there. The aimbrace `ask` implementation is the reference for the states (`pending`, `approved`, `denied`) and the ledger lines.

Not a reason to port: a second extension manager. ACRYL's installer is the one that is verified on macOS, Windows and Linux in the packaged app.
