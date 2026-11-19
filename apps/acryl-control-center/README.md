# ACRYL Control Center

**ACRYL Control Center** as a Blend: the control center of your ACRYL apps. Registry id `acryl.control-center`. Source:
<https://github.com/acrylblends/63-acryl-control-center>, made from <https://github.com/acryldev/acryl> (`scripts/launcher-blend.mjs --no-start`).

- your apps, with their surface (web or desktop), started and stopped from one list;
- a new app from a starter or from a Blend of the registry;
- plugins to pull into an app and to share from it;
- the Blends right panel: chat, Claude Code, Codex, Pi and a terminal.

## Download

The app, ready to install (the latest release, <https://github.com/acrylblends/63-acryl-control-center/releases/latest>):

| | Apple Silicon / ARM | Intel / x64 |
|---|---|---|
| macOS | [ACRYL-Control-Center-mac-arm64.dmg](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-mac-arm64.dmg) | [ACRYL-Control-Center-mac-x64.dmg](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-mac-x64.dmg) |
| Windows | [ACRYL-Control-Center-win-arm64.exe](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-win-arm64.exe) | [ACRYL-Control-Center-win-x64.exe](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-win-x64.exe) |
| Linux (Debian, Ubuntu) | [ACRYL-Control-Center-linux-arm64.deb](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-linux-arm64.deb) | [ACRYL-Control-Center-linux-x64.deb](https://github.com/acrylblends/63-acryl-control-center/releases/latest/download/ACRYL-Control-Center-linux-x64.deb) |

The apps are not signed yet. macOS: the first start is right-click > Open. Windows: SmartScreen may ask, More info > Run anyway.
Linux: `sudo apt install ./ACRYL-Control-Center-linux-x64.deb`. On Windows and Linux it uses the git on your machine.

## Start with the `acryl` command

```bash
npx acryl --gui    # in its own window
npx acryl --web    # in your browser
```

The first start makes it in `~/.acryl/control-center` and installs it (about a minute). Or run it from a clone:

```bash
git clone https://github.com/acrylblends/63-acryl-control-center.git
cd 63-acryl-control-center && npm install && npm run desktop
```

`npm run dev` serves it to a browser instead. The apps it lists live in `~/.acryl/apps.json`; new apps are suggested in `~/ACRYL`.

## Where the shared code comes from

Most of this app is not written here:

- **The library plugins** (`plugins/acryl-door`, `acryl-router`, `desktop`, `instance`, `plugin-share` and the others named in
  `plugins/library.json`) are copies of the acrylblends library, from <https://github.com/acrylblends/acrylblends>.
  `plugins/library.lock.json` records the release each came from and a hash of every file. `npx acrylblends upgrade` brings them to the
  newest release; when a file was changed here, it stops, shows the diff and changes nothing (`--force` replaces it and keeps a backup in
  `.acryl/upgrade-backup/`). Fix a library plugin in acrylblends, not here; your own code goes in a plugin of your own under `plugins/`.
- **The frame and its parts** (`@acryldev/blends-frame`, `@acryldev/settings` and the other `@acryldev/*` packages in
  `package.json`) and the framework (`acrylblends`) come from npm, built from the same repository (`ide/` and `packages/`). `npm install`
  installs them; `npx acrylblends upgrade` moves `package.json` to the release it brings.
- **The Control Center itself** is generated from ACRYL, <https://github.com/acryldev/acryl>, by `scripts/launcher-blend.mjs`:
  - `plugins/acryl-launcher-host/` (its `index.ts`, `package.json`, `contract.ts`, `door.ts`, `registry.ts`, `route.ts`, `runner.ts`,
    `service.ts`) is the Host half of acryl's `plugins/acryl-launcher-desktop`, with its imports renamed for a Blends app;
  - `plugins/acryl-launcher-host/launcher-lib/` (8 files) is acryl's `plugins/acryl-launcher`, built: its `.js` and `.d.ts` copied as they are;
  - `public/launcher.js` is the page, acryl's `plugins/acryl-launcher-desktop/lib/page.js`.

  Change these in acryl and run the script again; an edit made here is overwritten. They become one published package in place of the
  copies with acryl spec 051 (task T010).

What is this app's own: `blend.yaml`, `cordis.patch.yml`, `src/` (the root serves the Control Center, the template's first screen is at
`/home`), `assets/`, the tests and the release workflow.

MIT licence.
