# Tasks: the framework's own architecture (spec 049)

**Feature**: `specs/049-framework-architecture/` | **Input**: [spec.md](./spec.md), [plan.md](./plan.md)

**Conventions**
- Tickets found while building a slice, recorded where the slice's decisions live. Each names who found it, when, and the owner's or
  the coordinator's decision on it.
- The acceptance criterion of a ticket is the test or check it names; it is done when that passes on `main`.

## Open

- [ ] T001 [found 2026-10-27, slice 17 commit A, AcrylImplementer; coordinator: yes, low priority, after M6] Live activation of an
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

### M10 - the Blank app, prebuilt for every desktop (owner, 2026-11-03)

Owner's words: "we should have acryl pre-built Blank version of empty desktop App for macOS arm/intel, windows intel, linux ubuntu
arm/intel for acrylblends Blank app so that we download it and it's easiest for user to start building. no flags, no nothing, no installs
of weird packages. for non-tech it'd be ideal start point." Recorded by AcrylImplementer.

- [ ] T002 [M10] The Blank app as a desktop product: the Blends frame around an empty `acrylblends` Blank app, packaged with its own
  runtime (Node or Electron's, git included or not needed), so it starts from the downloaded file alone. Where each app keeps its source, data,
  cache and logs is `app-storage.md` in this folder (one sealed folder per app in the product's per-user app data root, the same layout on every OS,
  decided in the `AppInstance` family, never `homedir()` or Documents); the person names the app on first start.
  Done when: on a clean user account with no Node, git or npm, opening the app shows the frame with the Blank app running in it.
- [ ] T003 [M10] First start asks nothing technical: no flag, environment variable or terminal command. A model is chosen in the app's own
  Settings (sign in, or paste a key), and until one is set the chat says how in one sentence.
  Done when: the T002 walk reaches a working chat by pressing only the app's buttons.
- [ ] T004 [M10] Builds in CI for macOS arm64 and x64 (signed and notarized DMG), Windows x64 (signed NSIS installer) and Ubuntu arm64
  and x64 (`.deb` and AppImage), attached to one release page with a plain download table.
  Done when: one tag produces all five downloads and each one's size is on the page.
- [ ] T005 [M10] A first change from the chat lands in the app: asked in the chat, the agent builds it through the door, the canvas shows
  it, and a Save point records it, all without a restart.
  Done when: the same walk on each OS ends with the change visible and saved.
- [ ] T006 [M10] Updates without reinstalling: the app checks its release page and offers the new version; the person's app folder is
  kept across the update.
  Done when: installing version N, building a change, then updating to N+1 keeps the change and the chat history.
- [ ] T007 [M10] Hand walk per OS: this Mac (arm64, and x64 through Rosetta or an Intel build), mbpi9win (Windows), z370n (Ubuntu x64)
  and an Ubuntu arm64 machine, each from the downloaded file on a fresh account; screenshots of each step for the workshop handout.
  Done when: the five walks pass and their screenshots are in the handout.

`acryl control list` not seeing an app started with an explicit home, found by the same slice, is in spec 048's ticket
[T011](../048-ide-on-framework/tasks.md).

### M11 - share a plugin between people: publish, then pull into your own app (owner, 2026-11-07)

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
other people's plugins. T009 and T015 carry the two parts of that the first draft of this milestone lacked: verification by digest, and the app
remembering where each pulled plugin came from.

- [ ] T008 [M11] Compatibility, proven first: one plugin the agent builds in an `acrylblends` app is packed, released on the test org
  (`inboxxobni`) and read by `cordisplugins.github.io`'s sync, and its entry shows the right provides, consumes and compatibility. If the contract
  an `acrylblends` plugin declares is not what the sync reads, the gap and the fix are written here before T009.
  Done when: the entry is listed with the expected compatibility, and the finding (or "no gap") is recorded under this ticket.
- [ ] T009 [M11] `plugin pull <source>` in the door and the CLI of an `acrylblends` app. Sources: `github:<owner>/<repo>[@version]` and a
  `.tgz` path or address first (`store:` and `npm:` follow the ACRYL IDE and are not needed for the bootcamp). It fetches without running anything
  (never a clone, no install scripts), checks the sha512 against the release and, when the source names one (`@sha256:<digest>`), the plugin's
  content digest, so the same bytes arrive on every OS; runs the portability check on the unpacked files, then hands the
  folder to the existing live `plugin add`. Every refusal names what is wrong and what to do; a failed install leaves the app as it was.
  Done when: a test pulls a plugin from a local release fixture into a running app and its route answers without a restart; a tampered archive,
  a CRLF or reserved-name plugin and a plugin needing a missing service are each refused with their reason and change nothing.
- [ ] T010 [M11] `package_plugin` produces a release-ready package: deterministic `.tgz` (sorted entries, LF, no timestamps), a `package.json`
  with the topic `cordis-plugin` and `@deepseek-ai/cordis` as a peer, and the digest recorded.
  Done when: packing the same plugin twice, on macOS and Windows, gives the same sha512.
- [ ] T011 [M11] `plugin publish <name>`: creates the repository (or reuses the person's), the topic and the release with the `.tgz`. An outward
  action: the verb shows the exact account, repository and version and waits for the person's yes in the chat or the frame; the agent never
  confirms for them and no one-click handler publishes (read the handler first). Rehearsed on `inboxxobni` before any personal account.
  Done when: a rehearsal publish on `inboxxobni` shows up as a release and, within the hour, in the registry; declining publishes nothing.
- [ ] T012 [M11] The frame offers both: a Share action on a plugin and a Pull field in Settings > Plugins, calling the T009 and T011 verbs and
  showing their refusals in plain words. No logic lives in the frame.
  Done when: on screen, a plugin is shared from one app and pulled into another by pressing buttons only, shown side by side with the mockup.
- [ ] T013 [M11] The acceptance walk: on mbpi9win (Windows) the agent builds a plugin and it is published; on this Mac and on z370n (Ubuntu) it
  is pulled into a different app and works live with an identical digest on all three.
  Done when: the three digests match and the screenshots are in the workshop handout.
- [ ] T014 [M11] Workshop guide step and a dry run: step 7 of the guide gains "share a plugin, pull a neighbour's", and two people run it
  together at least a week before 2026-11-20.
  Done when: the guide's step passes for two people on different OSes with no help.
- [ ] T015 [M11] A pulled plugin is remembered: the app's `blend.yaml` and lock record its source (`github:<owner>/<repo>@<version>`), release
  sha512 and content digest, so the app (its snapshot, an export, a copy on another machine) can fetch exactly the same plugin again, and an
  app assembled from several people's plugins is reproducible. Removing the plugin removes the record.
  Done when: pull a plugin, snapshot the app, create a new app from the snapshot on another OS, and the same plugin is fetched, verified and
  running; a source whose bytes changed since the record is refused, not silently replaced.
