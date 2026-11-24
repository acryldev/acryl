# Spec 052 Step 1 - the one install, proven on macOS, Windows and Ubuntu (2026-11-24)

Step 1 of [`plan-space-reuse.md`](plan-space-reuse.md) (T006). What was built: `installApp` in `plugins/launcher/app-install.js`
(`app-install-cli.mjs` as one command), run by `acryl --gui` / `acryl ade` (`distribution/acryl-npm-launcher/managed.js`) and by Control
Center (`plugins/launcher-desktop/src/service.ts`: Start of an app without packages, + New app from a Blend or a starter). A fresh app on a
Blends version this computer already has starts from that version's Program, `<home>/program/blends-<version>/node_modules`: an APFS
clone on macOS, hard links on Linux and Windows. Then `npm install` on top adds the app's own packages. The first app installed on a
version becomes its Program. Commits 17de6496ce060ad0d0eb4229956406512e835414 and a7f17573effad316d27a98b218b2994c7617df8a.

The method is the same as [`baseline.md`](baseline.md): scratch HOMEs on the test hosts, `create-acrylblends@1.7.33 --no-install`, then
each app installed by the module's command (`node app-install-cli.mjs --home <home>/.acryl`). Disk on Linux and Windows is each file once
by inode or file ID; on macOS it is the free space a dedicated sparse APFS image lost. The script (`step1-proof.mjs`, Step 0's with a
`module` and a `removal` phase) and every host's results are in the measuring session's scratch folder (`evidence/step1-*.tgz`).

## MB added per app: Control Center (becomes the Program), Notes, Small CRM, and an extra app (blank starter)

| Host | Control Center | Notes | Small CRM | Extra app | One Electron for all |
|---|---|---|---|---|---|
| z370n (Ubuntu, hard links) | 705 | 8.2 | 8.6 | 7.3 | yes: one inode, 5 links |
| mbpi9win (Windows 10, hard links) | 762 | 12.5 | 10.4 | 7.1 | yes: one file ID |
| AION (macOS 26, clones, free space) | 1,152 free space (the app and the Program, two clones) | 12.8 | 12.8 | 11.8 | one clone per app, blocks shared |

The bar was "an extra app at 50 MB or less": every extra app on every host is 7-13 MB. The module said "Starting from the shared
blends-1.7.33" for every app after the first, and no install changed a Program file (the sha256 check after each install on top).

## Every start check, per app, per host

For all four apps on all three hosts: `npm run desktop` starts it (the frame answers in about 2 s on z370n, 7-13 s on Windows, 8-9 s
on AION), its window answers the door (`acryl look`), a terminal in the app runs a typed command (`pty-check.sh`), `live-test.sh`
serves a new plugin and then an edit typed through the in-app terminal without a reload, and the app's port is free after it stops.
node-pty and koffi load in Node and in the app's Electron, except koffi inside Electron on AION (below).

## Removing the first app never breaks the Program (the coordinator's check)

On each host Control Center was removed (`rm -rf` of its folder: the app whose install became the Program), then:

- the Program in `<home>/.acryl/program/blends-1.7.33` was whole: every file of its `sha256.json` matched by content (z370n 28,837
  files, Windows 28,888, AION 29,046);
- the Program and Notes kept the same file: on z370n and Windows one inode (file ID), its link count going from 5 to 4; on AION each file is its own clone,
  with the same inode as before;
- a new app made after the removal started from the Program and added 7.2 MB (z370n), 5.9 MB (Windows) or 18.2 MB of free space (AION);
- Notes and the new app then passed every start check above.

The Program never lives in an app's folder: it is made under the home first and renamed into place, and an app only ever gets links or
clones of it.

## Found on the way

1. **`acryl` ships without dependencies** (the terminal Control Center is bundled into `launcher.js`). The first commit imported
   `@acryldev/launcher` from `forward.js` and `managed.js`, and its `import.meta.resolve` in the Control Center service survived into the
   bundle. The selector's pty test caught it ("Cannot find package '@acryldev/launcher'"). Now the launcher exports `INSTALL_CLI`, the
   file beside its own module, and `tui/bundle.mjs` and `scripts/pack-npm-selector.mjs` copy the two install files beside `launcher.js`,
   as they already do `model-key.js`.
2. **The Windows runner started every command through a shell**, which splits an argument containing a space (`C:\Users\First Last\...`)
   and `node -e <script>`. It now uses a shell only for `npm` and `npx` (the .cmd files).
3. **AION's Node is x64 under Rosetta** (baseline finding 5, reported only, not fixed here): koffi does not load inside Electron there,
   in this layout as in today's npm layout. The apps start, and their terminal and live plugins work.

## Not in this step

- `acryl new` in a terminal still installs inside `create-acrylblends` (the framework layer, which cannot depend on the launcher).
  That is the next slice.
- Control Center and `acryl` get this through a release of `@acryldev/launcher`, `@acryldev/launcher-desktop` and `acryl`.
- `acryl apps reinstall` and `acryl clean` (T008) are not built yet.
