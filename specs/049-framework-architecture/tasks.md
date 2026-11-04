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
  Web and Desktop) listens to `command/executed` and, while the chat's phase is `blank`, shows the reply as the composer notice (the line
  the composer uses for a command it refused; an error reply as an error). Once the conversation is drawn it shows nothing, so a reply never
  appears twice. It reads the chat through `@acryl/ui`'s new `acrylChat` service (`phase(sessionId)`, DSH's own `conversationPhase`, and
  `notice(sessionId, level, text)`, DSH's `conversation.input.notify`), so the plugin names no DSH package. Tests:
  `plugins/acryl-command-reply/tests/reply.spec.ts` on real Cordis (blank, drawn phases, no text, another session, unloaded),
  `plugins/acryl-ui/tests/chat.spec.ts` (the phase on the start page and in every drawn state, the notice, withdrawn on unload) and the
  built bundle providing `acrylChat` in `plugins/acryl-ui/tests/built-bundle.spec.ts`, the Blueprint rows in `runtime/acryl-harness-runtime/tests/blueprint.spec.ts`,
  and Desktop's profile in `apps/acryl-desktop/tests/profile/profile-blueprint.spec.ts`. Live: `scripts/live-run.mjs web`, `/reload new`
  then `/probe-state` on the start page showed `acryl-probe-state [global]: installed (new) ...` and `probe-state: clicks=1, ...` above
  the composer (screenshots). Import ratchet (`scripts/verify-layout.mjs`): outside the seam unchanged at 104; the seam grows by two lines
  (`frame.ts`'s command event type and `client/chat.ts`'s phase rule), total 135 to 137. A first version raised the outside count to 106
  instead; the coordinator rejected the raise: the direction is fewer DSH imports outside the seam, never more.

### M11 - the Blank app, prebuilt for every desktop (owner, 2026-11-03)

Owner's words: "we should have acryl pre-built Blank version of empty desktop App for macOS arm/intel, windows intel, linux ubuntu
arm/intel for acrylblends Blank app so that we download it and it's easiest for user to start building. no flags, no nothing, no installs
of weird packages. for non-tech it'd be ideal start point." Recorded by AcrylImplementer.

- [ ] T003 [M11] The Blank app as a desktop product: the Blends frame around an empty `acrylblends` Blank app, packaged with its own
  runtime (Node or Electron's, git included or not needed), so it starts from the downloaded file alone. The app folder it builds in is
  created on first start in the person's documents (through the `AppInstance` family, never `homedir()`), named by the person.
  Done when: on a clean user account with no Node, git or npm, opening the app shows the frame with the Blank app running in it.
- [ ] T004 [M11] First start asks nothing technical: no flag, environment variable or terminal command. A model is chosen in the app's own
  Settings (sign in, or paste a key), and until one is set the chat says how in one sentence.
  Done when: the T003 walk reaches a working chat by pressing only the app's buttons.
- [ ] T005 [M11] Builds in CI for macOS arm64 and x64 (signed and notarized DMG), Windows x64 (signed NSIS installer) and Ubuntu arm64
  and x64 (`.deb` and AppImage), attached to one release page with a plain download table.
  Done when: one tag produces all five downloads and each one's size is on the page.
- [ ] T006 [M11] A first change from the chat lands in the app: asked in the chat, the agent builds it through the door, the canvas shows
  it, and a Save point records it, all without a restart.
  Done when: the same walk on each OS ends with the change visible and saved.
- [ ] T007 [M11] Updates without reinstalling: the app checks its release page and offers the new version; the person's app folder is
  kept across the update.
  Done when: installing version N, building a change, then updating to N+1 keeps the change and the chat history.
- [ ] T008 [M11] Hand walk per OS: this Mac (arm64, and x64 through Rosetta or an Intel build), mbpi9win (Windows), z370n (Ubuntu x64)
  and an Ubuntu arm64 machine, each from the downloaded file on a fresh account; screenshots of each step for the workshop handout.
  Done when: the five walks pass and their screenshots are in the handout.

### Frame UX (owner, 2026-11-04)

- [ ] T009 [frame UX, owner 2026-11-04] The left and right panels are resizable. Owner's words: "lets make LEft pane and right pane to be
  resizable ... when we need more space to read or comfortable navigate we do it ... so we can click and hold and drag the left and right pane to resize, just like in Super.engineering".
  Owner, on how: "when we click on edge border the cursor changes to left-click and drag to resize, no drag buttons, just intuitive UX".
  No handle or button is drawn: hovering a panel's inner border shows the resize cursor, and pressing and dragging there sets its width (the
  centre, the app, keeps at least 360px; a panel stays between 180px and 60% of the window); double-click on the edge puts the default
  width back; the widths are remembered per app across restarts, and collapsing and reopening a panel returns it at its own width.
  The mockup shows it: [blends-frame-mockup.html](./design/blends-frame-mockup.html), each panel's inner border.
  Done when: in the Blends frame on web and desktop, both panels resize by dragging and reset on double-click, the width survives a
  restart and a collapse, and side-by-side captures with the mockup match.

- [ ] T010 [frame UX, owner 2026-11-04] The app's agent extends the app the way ACRYL IDE's agent extends itself (spec 037, guardrailed
  self-extension): ACRYL's Extension Context Pack (`plugins/acryl-plugin-context`: routed docs index, verified examples, authoring
  skills, verify/stage/install, `acryl-system-prompt`) is ported to the Blends app, not rewritten. Owner's rule: the agent "doesn't just
  build random voluntary plugin however he can, but always strictly abides to build cordis plugin that we display in settings and can
  easily enable / disable and share to the CordisPlugins registry" (https://cordisplugins.github.io/plugins,
  https://github.com/orgs/cordisplugins).
  Done when: on a fresh Blank app the prompt "please build a simple Notes widget" ends with `plugins/notes` as a Cordis plugin row (no
  hand edits to `src/frame.ts` or `src/routes.ts`), the agent consulted the index first (Trajectory), no guessed imports and no "Not
  reloaded", the widget shows in the canvas, Settings > Plugins lists it, disabling it removes it from the canvas and enabling brings it
  back, and Share packages it in the registry's format.

`acryl control list` not seeing an app started with an explicit home, found by the same slice, is in spec 048's ticket
[T011](../048-ide-on-framework/tasks.md).
