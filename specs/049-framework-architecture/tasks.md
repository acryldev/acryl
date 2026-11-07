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
  runtime (Node or Electron's, git included or not needed), so it starts from the downloaded file alone. Where each app keeps its source, data,
  cache and logs is `app-storage.md` in this folder (one sealed folder per app in the product's per-user app data root, the same layout on every OS,
  decided in the `AppInstance` family, never `homedir()` or Documents); the person names the app on first start.
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
  Owner: "composition of those Cordis plugins comprises blend.yml, that is the essence snapshot of any acrylblend app". So the frame
  composes the app in the canvas from its `blend.yaml` (the rows `npm start` composes), and a row added, disabled or removed there, or
  through Settings > Plugins, is what changes the canvas; `src/frame.ts` carries no feature wiring.
  The same snapshot (`blend.yaml` + `plugins/`) is what a person shares, what a saved version holds, and what a blueprint is made from
  (owner: "and we share as snapshot, version or make blueprint from"); one artifact, no second export format.
  Its verbs, in the frame and as agent tools: capture (running composition to `blend.yaml`), load (start or switch an app from a snapshot),
  save version (a commit), push and pull version (the app's remote), push and pull to a registry (the whole app as a Blend entry, one plugin to
  CordisPlugins) - owner: "capture current snapshot, save version, push version, pull version". ACRYL's blend-capture and blend-apply are ported for it.
  Done when: on a fresh Blank app the prompt "please build a simple Notes widget" ends with `plugins/notes` as a Cordis plugin row (no
  hand edits to `src/frame.ts` or `src/routes.ts`), the agent consulted the index first (Trajectory), no guessed imports and no "Not
  reloaded", the widget shows in the canvas, Settings > Plugins lists it, disabling it removes it from the canvas and enabling brings it
  back, and Share packages it in the registry's format.

`acryl control list` not seeing an app started with an explicit home, found by the same slice, is in spec 048's ticket
[T011](../048-ide-on-framework/tasks.md).

### M12 - share a plugin between people: publish, then pull into your own app (owner, 2026-11-07)

Owner's words: "the idea is that we're gonna build first agentic apps and share created on the fly plugins between us to try collaborative
mode of agentic software development" (the bootcamp of 2026-11-20), then "person publishes a plugin, person B pulls it into own app", and
"we have https://cordisplugins.github.io for cordis plugins, https://acrylblends.github.io for BLENDS". Recorded by Acryl_main_thread_1.

The registry already exists and is not changed: a public GitHub repository with the topic `cordis-plugin` and a release holding one `.tgz`
is listed by `cordisplugins.github.io` (hourly sync, entry built from the package's contract, sha512 recorded), and the ACRYL IDE pulls it with
`plugin pull github:<owner>/<repo>[@version]` (`apps/acryl-cli`). What is missing is the same two moves inside an `acrylblends` app: its door
has `plugin add <folder>` (local folder, live, with check and rollback) and `package_plugin` writes a folder to `plugin-packages/<name>/`,
neither is a release and neither takes a source. Pulling goes straight to the GitHub release, not through the hourly listing, so a plugin is
usable the moment it is released. Portability (`portabilityIssues`, `verifySnapshot` in blends-core, see `portable-plugins.md`) decides
whether a pulled plugin is accepted, so a plugin made on Windows works on macOS.

This was already decided in the steering discussion (`docs-acryl-project-RnD-ideas-discussions-questions/acrylblends_strategic_direction_steering/
Discussion_acrylblends_strategic_direction_steering.md`, "Portability & sharing" and the opening brief): the registry serves both BLENDs and individual
Cordis plugins; "someone on Windows can push a CP; you on macOS pull it by digest, identical bytes"; and anybody can build a "Frankenstein app" from
other people's plugins. T012 and T018 carry the two parts of that the first draft of this milestone lacked: verification by digest, and the app
remembering where each pulled plugin came from.

- [ ] T011 [M12] Compatibility, proven first: one plugin the agent builds in an `acrylblends` app is packed, released on the test org
  (`inboxxobni`) and read by `cordisplugins.github.io`'s sync, and its entry shows the right provides, consumes and compatibility. If the contract
  an `acrylblends` plugin declares is not what the sync reads, the gap and the fix are written here before T012.
  Done when: the entry is listed with the expected compatibility, and the finding (or "no gap") is recorded under this ticket.
  Finding, offline half (Fork3, 2026-11-07; real code, nothing published: a sample plugin injecting `router` and `routerHttp`, `packageManifest`,
  `packFolder` from `@webboxes/plugin-hub`, then the registry's `packageJsonFromTarball` and `pluginFromRelease`). Today the registry would list it as
  `compatibility: "DSH stock"`, `provides: []`, `consumes: []`, with a `dsh plugin ... add` install line, which is wrong for an acrylblends app.
  - G1: `package_plugin` writes no contract (`acryl.requires/provides/slots`). Fix in T013: call the hub's `syncServiceContract` when packaging.
  - G2: `files: ['*.ts', '**/*.ts', 'README.md']` silently drops `plugin.json`, other `*.json` data and `.js` files. Fix in T013: drop the list, let the standard skips apply.
  - G3: `SOURCE_EXTENSIONS` in the hub's `contract.ts` is `.js .mjs .cjs`, so `provides` and `slots` of `.ts` plugins are never seen. Fix: add `.ts .mts .tsx`; needs `@webboxes/plugin-hub` 0.2.0.
  - G4: with a contract, `compatibilityOf` still says "Both" for `router`/`routerHttp` (false) and the install line stays wrong. Fix in `cordisplugins.github.io` (`scripts/lib/discover.mjs` and the badge): the keyword `acrylblends` gives compatibility "ACRYL Blends" and the line `npm run acryl -- plugin pull github:<owner>/<repo>@<version>` (wording final when T012 lands). Not a new registry kind.
  - G5 (seen in code, not run): the hub's `sharePlugin` and `bundleProblem` require a DSH Loader patch (`dsh.bundle.patch`) that acrylblends plugins do not have. T014 handles this without weakening it for DSH bundles.
  - Good: installed `@webboxes/plugin-hub` 0.1.0 has `contract`, `pack`, `pull`, `tarball`, `share` identical to source and its tarball is already deterministic, so it is a dependency, not a copy. Pull reuses `pullPlugin`, `parsePluginSource`, `readTarball`; the `@sha256:` content digest is `digestFiles` over the unpacked package. A new acrylblends plugin `plugins/plugin-share/` owns pull and publish.
- [ ] T012 [M12] `plugin pull <source>` in the door and the CLI of an `acrylblends` app. Sources: `github:<owner>/<repo>[@version]` and a
  `.tgz` path or address first (`store:` and `npm:` follow the ACRYL IDE and are not needed for the bootcamp). It fetches without running anything
  (never a clone, no install scripts), checks the sha512 against the release and, when the source names one (`@sha256:<digest>`), the plugin's
  content digest, so the same bytes arrive on every OS; runs the portability check on the unpacked files, then hands the
  folder to the existing live `plugin add`. Every refusal names what is wrong and what to do; a failed install leaves the app as it was.
  Done when: a test pulls a plugin from a local release fixture into a running app and its route answers without a restart; a tampered archive,
  a CRLF or reserved-name plugin and a plugin needing a missing service are each refused with their reason and change nothing.
- [ ] T013 [M12] `package_plugin` produces a release-ready package: deterministic `.tgz` (sorted entries, LF, no timestamps), a `package.json`
  with the topic `cordis-plugin` and `@deepseek-ai/cordis` as a peer, and the digest recorded.
  Done when: packing the same plugin twice, on macOS and Windows, gives the same sha512.
- [ ] T014 [M12] `plugin publish <name>`: creates the repository (or reuses the person's), the topic and the release with the `.tgz`. An outward
  action: the verb shows the exact account, repository and version and waits for the person's yes in the chat or the frame; the agent never
  confirms for them and no one-click handler publishes (read the handler first). Rehearsed on `inboxxobni` before any personal account.
  Done when: a rehearsal publish on `inboxxobni` shows up as a release and, within the hour, in the registry; declining publishes nothing.
- [ ] T015 [M12] The frame offers both: a Share action on a plugin and a Pull field in Settings > Plugins, calling the T012 and T014 verbs and
  showing their refusals in plain words. No logic lives in the frame.
  Done when: on screen, a plugin is shared from one app and pulled into another by pressing buttons only, shown side by side with the mockup.
- [ ] T016 [M12] The acceptance walk: on mbpi9win (Windows) the agent builds a plugin and it is published; on this Mac and on z370n (Ubuntu) it
  is pulled into a different app and works live with an identical digest on all three.
  Done when: the three digests match and the screenshots are in the workshop handout.
- [ ] T017 [M12] Workshop guide step and a dry run: step 7 of the guide gains "share a plugin, pull a neighbour's", and two people run it
  together at least a week before 2026-11-20.
  Done when: the guide's step passes for two people on different OSes with no help.
- [ ] T018 [M12] A pulled plugin is remembered: the app's `blend.yaml` and lock record its source (`github:<owner>/<repo>@<version>`), release
  sha512 and content digest, so the app (its snapshot, an export, a copy on another machine) can fetch exactly the same plugin again, and an
  app assembled from several people's plugins is reproducible. Removing the plugin removes the record.
  Done when: pull a plugin, snapshot the app, create a new app from the snapshot on another OS, and the same plugin is fetched, verified and
  running; a source whose bytes changed since the record is refused, not silently replaced.
