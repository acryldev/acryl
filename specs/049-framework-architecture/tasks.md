# Tasks: the framework's own architecture (spec 049)

**Feature**: `specs/049-framework-architecture/` | **Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Conventions**
- Tickets found while building a slice, recorded where the slice's decisions live. Each names who found it, when, and the owner's or
  the coordinator's decision on it.
- The acceptance criterion of a ticket is the test or check it names; it is done when that passes on `main`.

## Open

- [x] T001 [found 2026-10-27, slice 17 commit A, AcrylImplementer; coordinator: yes, low priority, after M6] Live activation of an
  `acrylblends` module. An app plugin installed into a running app that declares an `acrylblends/cordis/...` module in
  `dsh.requiresAcrylPackages` gets it linked into the profile, and it is used when its row is already mounted. When it is not, the live
  install path of `acryl-plugin-context` (`materializeRequiredAcrylPackages` in `plugins/acryl-plugin-context/lib/install.js`) refuses
  with what to do, and the module mounts at the next start: an `acrylblends` module is not a DSH bundle, so `ensureProfileBundle` and
  `live.activate` do not apply to it. The refusal and the restart are fine until this ticket.
  Wanted: the running app inserts and activates the module's row (id and name the module, package `acrylblends`) through the Loader,
  with the same reload and rollback the bundle path has.
  Done when: a test installs, into a running app, a plugin that requires `acrylblends/cordis/state` while no row for it is mounted, and
  the plugin's `ctx.state` works without a restart; a second install of a plugin requiring it adds no second row; uninstalling both
  leaves the row as it was before.
  Mini-design: [plan.md, T001](./plan.md#t001---live-activation-of-an-acrylblends-module-2026-10-28-acrylimplementer-mini-design).
  Done 2026-10-28 (a103a36a): `AcrPluginLifecycleController.requireModules` inserts, shares and removes the module rows, called by the
  install and remove paths; the real-Loader tests in `runtime/acryl-control/tests/plugin-lifecycle.spec.ts` and the real-engine tests in
  `runtime/acryl-harness-runtime/tests/plugin-context.spec.ts` (two plugins share one `include:acrylblends/cordis/state` row, none after
  both leave, the row composed again after a restart). Live check: `scripts/live-run.mjs web` with a Blueprint without the framework-kit
  row, a plugin injecting `state` placed in the app's plugins folder, `/reload new`, then `/probe-state` answered
  `probe-state: clicks=4, keys=probe-clicks` on its fourth run, without a restart.
  Limits: a row composed at boot has no owner in memory, so it stays until the next start after its last plugin leaves; the TUI does not
  compose these rows at boot (as for app plugins before).

- [x] T002 [found 2026-10-28, T001's live check, AcrylImplementer; coordinator: a UI defect, fix it, in the place and style the start page
  already uses for errors, no new component, Desktop the same] A host command's reply is not shown on the Web page of a new session.
  `/probe-state` typed on the start page (no session started, no provider key) is answered by `api/commands/execute` with
  `{ kind: 'success', text: ... }`, the composer clears, and no text appears anywhere on the page. Cause: DSH draws a command's reply as a
  conversation node, and the conversation is not drawn while the session is blank (`DefaultConversationViews` returns nothing in the
  `blank` phase); a command does not end that phase. Not ACRYL's code, and the pinned DSH is not edited.
  Done when: a test on the Web page shows a command's success text where the user typed it.
  Done 2026-10-28: the new plugin `acryl-command-reply` (Blueprint row `command-reply`, in `acryl.blank` and so in every built-in Blueprint,
  Web and Desktop) listens to `command/executed` and, while DSH's own `conversationPhase` is `blank`, shows the reply as the composer notice
  (`conversation.input.notify`, the line the composer uses for a command it refused; an error reply as an error). Once the conversation is
  drawn it shows nothing, so a reply never appears twice. Tests: `plugins/acryl-command-reply/tests/reply.spec.ts` on real Cordis (blank,
  four drawn phases, no text, another session, unloaded), the Blueprint rows in `runtime/acryl-harness-runtime/tests/blueprint.spec.ts`,
  and Desktop's profile in `apps/acryl-desktop/tests/profile/profile-blueprint.spec.ts`. Live: `scripts/live-run.mjs web`, `/reload new`
  then `/probe-state` on the start page showed `acryl-probe-state [global]: installed (new) ...` and `probe-state: clicks=1, ...` above
  the composer (screenshots). Finding: the plugin's sole capability is the DSH chat, so its two DSH import lines raise the import ceiling
  (`scripts/verify-layout.mjs`, total 137, outside the seam 106) instead of joining the seam.

`acryl control list` not seeing an app started with an explicit home, found by the same slice, is in spec 048's ticket
[T011](../048-ide-on-framework/tasks.md).
