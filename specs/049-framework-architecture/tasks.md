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
  Finding, offline half (Fork3, 2026-11-07; real code, nothing published: a sample plugin injecting `router` and `routerHttp`, `packageManifest`,
  `packFolder` from `@webboxes/plugin-hub`, then the registry's `packageJsonFromTarball` and `pluginFromRelease`). Today the registry would list it as
  `compatibility: "DSH stock"`, `provides: []`, `consumes: []`, with a `dsh plugin ... add` install line, which is wrong for an acrylblends app.
  - G1: `package_plugin` writes no contract (`acryl.requires/provides/slots`). Fix in T010: call the hub's `syncServiceContract` when packaging.
  - G2: `files: ['*.ts', '**/*.ts', 'README.md']` silently drops `plugin.json`, other `*.json` data and `.js` files. Fix in T010: drop the list, let the standard skips apply.
  - G3: `SOURCE_EXTENSIONS` in the hub's `contract.ts` is `.js .mjs .cjs`, so `provides` and `slots` of `.ts` plugins are never seen. Fix: add `.ts .mts .tsx`; needs `@webboxes/plugin-hub` 0.2.0.
  - G4: with a contract, `compatibilityOf` still says "Both" for `router`/`routerHttp` (false) and the install line stays wrong. Fix in `cordisplugins.github.io` (`scripts/lib/discover.mjs` and the badge): the keyword `acrylblends` gives compatibility "ACRYL Blends" and the line `npm run acryl -- plugin pull github:<owner>/<repo>@<version>` (wording final when T009 lands). Not a new registry kind.
  - G5 (seen in code, not run): the hub's `sharePlugin` and `bundleProblem` require a DSH Loader patch (`dsh.bundle.patch`) that acrylblends plugins do not have. T011 handles this without weakening it for DSH bundles.
  - Good: installed `@webboxes/plugin-hub` 0.1.0 has `contract`, `pack`, `pull`, `tarball`, `share` identical to source and its tarball is already deterministic, so it is a dependency, not a copy. Pull reuses `pullPlugin`, `parsePluginSource`, `readTarball`; the `@sha256:` content digest is `digestFiles` over the unpacked package. A new acrylblends plugin `plugins/plugin-share/` owns pull and publish.
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

### M12 - one name for every part: `acryl` as the entry point, `@acryl/*` as the parts (owner, 2026-11-10)

Owner's words: "use our npm name 'acryl' as main entry point that will point to acrylblends and any other sub part, like @acryl/blends or
@acryl/core etc." Design, facts checked on 2026-11-10 and the questions for the owner: [acryl-namespace.md](./acryl-namespace.md). Recorded
by AcrylImplementer. Updated 2026-11-11 with the owner's answers: `@acryl` is the owner's npm organization and the `acryl` package page is
the owner's; the commands must be short and memorable, with no `--` separator and no pile of flags ("it has to be simple and memorable using
namespaces like @acryl/blends"). The workshop of 2026-11-20 (D8) uses the short commands once T025 passes on all three systems; the old
commands stay as the fallback.

- [ ] T016 [M12] The names are ours: the owner said on 2026-11-11 that `@acryl` is theirs and that npmjs.com/package/acryl is theirs. Still to
  check once, with the owner signed in (this Mac is not signed in to npm): the organization's members and write access, and the owner says
  which names may be reserved before 2026-11-20 (`@acryl/core`, `@acryl/blends`, `@acryl/create-blends`, `@acryl/code`, `create-acryl`).
  Reserving publishes a placeholder version: an outward action, only on the owner's explicit go.
  Done when: the organization's package list or `npm access` shows the owner's accounts with write access, and the owner's answer on
  reserving is recorded here.
- [ ] T017 [M12] The questions of `acryl-namespace.md` answered (the `acryl agent` subcommand, one repository or two, registry id prefix), the
  answers written into that note as decisions, and open question 1 of `spec.md` closed.
  Done when: the note has no open question left and `spec.md` points to it.
- [ ] T018 [M12] The core boundary as a test: a check that builds the package set of the Blank template without the frame and fails when it
  imports `agent*`, `driver-*`, `openai`, the frame or a DSH agent package, including the packaged closure and dynamic imports. First finding to
  record: does `acryl-door` still start when the agent plugin is absent (it must use `ctx.get`, not `inject`)?
  Done when: the check runs on `main`, names each offending import, and its result today (pass, or the list the door and any other plugin
  have to fix) is recorded under this ticket.
- [ ] T019 [M12] `acryl` is the one command and forwards to the parts without changing them. The surface is the v2 discussion's (section 2):
  `acryl` and `acryl web` behave as before; `acryl new` (alias `create`), `acryl install <blend>`, `acryl list`, `acryl update`,
  `acryl blends`, `acryl plugin` (alias `plugins`) and `acryl code` run the existing `acrylblends` CLI and the IDE. Flags reach the parts
  without a `--` (through `npx`/the installed bin; `npm create` needs a separate form, T025).
  Done when: `npx acryl new my-app` makes the same app as `npm create acrylblends@latest my-app -- --template blank --desktop -y --install`
  (file for file), `npx acryl plugin publish hello --owner x` works inside an app, and the existing `acryl` tests still pass. Code only; no publish.
- [ ] T020 [M12, owner's go for each publish, in this order] The canonical names are published: `acryl` with the new subcommands, `create-acryl`
  (`npm create acryl my-app`), `@acryl/blends` and `@acryl/create-blends` (`npm create @acryl/blends my-app`), then `@acryl/create` and
  `@acryl/code`; `acrylblends` and `create-acrylblends` become thin aliases. The v2 discussion's sequence: organization, repository, blends and
  create, core, code and commands, application Blends, Registry and store.
  Done when: an app made by the old command and one made by the new command are identical, `from 'acrylblends'` and
  `from '@acryl/blends'` both resolve in a running app, and ACRYL's own CLI runs on the new package.
- [ ] T021 [M12, after T017] The repository is where the owner decided (question 2): `acrylblends/acrylblends` moved, with its old address
  redirecting, and the pins in `acryldev/acryl` updated.
  Done when: both repositories build from their new places and the old GitHub address opens the new one.
- [ ] T022 [M12, after T018] Core and Full editions of one Blend: a `profiles` field in the Blend format (`core` and `full extends core`), read by
  the resolver, and the Registry offering both.
  Done when: one Blend resolves to a core app with no agent row and a full app with them, from the same id, and both pass the T018 check or
  its inverse.
- [ ] T023 [M12, after T017] Registry ids use the umbrella: a stable id in the Blend's metadata (`com.acryl.crm` in the discussion, `acryl.crm`
  in the registry today; T017 picks one), the npm family `@acryl/blend-*` for Blends that ship as packages, and the old `acrylblends.` ids keep
  resolving.
  Done when: `npx acryl new my-app acryl.notes-desktop` and `acrylblends.notes-desktop` make the same app.
- [ ] T025 [M12, Phase A, before 2026-11-20] Short commands, no `--`, no flag pile: creating an app needs one line and running it one more.
  The defaults of the create command become the frame with agents, the install, and no questions when a directory is given; flags only turn
  things off (`--no-install`, `--bare`). A starter is a plain word after the directory (`my-app notes`), and a registry starter opens inside
  the frame (today `--from` is refused with `--desktop`, so it opens as a bare app: the owner's screenshot of 2026-11-10). `npm create`
  gets the same line through `create-acryl` and `@acryl/create-blends`, whose arguments are all positional.
  Done when: on macOS, Windows and Ubuntu, `npx acryl new my-app` then `cd my-app && npm run dev` opens the frame with the chat and agents, the
  same with `notes`, and a registry starter shows the same frame; the old commands still work; checked from local tarballs before anything is
  published.
- [ ] T026 [M12, Phase A, with T025] The data of an app made by `acryl new` is in `~/.acryl/apps/<id>/data/`, as for an installed app (owner,
  2026-11-11: "data goes to the same location"; the three cases are the table in `app-storage.md`). Findings of 2026-11-11 that shape it:
  (1) the id cannot live in `blend.yaml`, which is committed: a git clone of the app would share the id, so two copies on one machine would share
  one set of chats. It lives in `.acryl/app.json` of the app folder (git-ignored, travels with a moved folder, absent in a clone, which then gets its
  own). (2) The rule "where is the app's home" is repeated in about eight production places (`plugins/instance/index.ts`, `plugins/desktop/frame.ts`,
  `plugins/desktop-web/main.ts`, `packages/cli/src/frame-url.ts`, four spots in `packages/cli/src/ide-profile.ts` including the generated host,
  `packages/cli/src/upgrade.ts`) and hardcoded in about ten `scripts/verify-*.mjs`; they all change together, or the frame, the door and the
  desktop disagree about where the app lives. (3) The engine files chats under the absolute folder they ran in (`sessions/--Users-...--`), so a moved
  app loses them until the engine keys them by app id: that is a change in how the engine names sessions and is not part of this task; the move keeps
  every other file. (4) The door's `.acryl/` folder in the app is its own state and stays there. An app that already has `.acrylblends/` is moved once
  on its first start (copied first, checked file by file, the old folder renamed `.acrylblends.old`, never deleted). The templates' `.gitignore` keeps
  `.acrylblends/` ignored for apps not yet moved.
  Done when: on macOS, Windows and Ubuntu, `npx acryl new shop` then running it writes settings, sessions and logs only under
  `~/.acryl/apps/<id>/data/` (checked with `ACRYL_HOME` set to a scratch folder), nothing under `shop/.acrylblends/`; moving `shop/` to another folder
  keeps its settings and logs; an old app with `.acrylblends/` opens with its data after the move; one function owns the rule and a test fails
  when another file computes it; the instance, CLI, frame, desktop and door tests and the verify scripts pass.
- [ ] T024 [M12, after T020] The sites, READMEs and the workshop guide say `acryl` first: `acryl.dev`, `acrylblends.github.io`,
  `cordisplugins.github.io` and the package pages point to one another and to the same commands.
  Done when: every public page that tells a person how to start shows the same one command.
