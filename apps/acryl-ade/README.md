# ACRYL ADE

**ACRYL ADE**, the Agent Development Environment: the ACRYL IDE (<https://github.com/acryldev/acryl>) as one Blend. Registry id `acryl.ade`. Source: <https://github.com/acryldev/acryl/tree/main/apps/acryl-ade> (the ACRYL monorepo). Page: <https://acrylblends.github.io/blends/ai/ade/acryl.ade>.

It opens the IDE's workbench, ported into the Blends framework as `@acryldev/workspace`:

- **left:** your projects, each with its git branches and worktrees, and the chats and terminals open on each;
- **centre:** tabs: the agent's chat (DeepSeek Harness), terminals, files, diffs;
- **right:** what the agent changed, the review of a turn, and the project's files.

The chat is the same agent ACRYL IDE runs, with its shell, file tools and jobs. Claude Code, Codex or any other terminal agent runs in a terminal tab beside it.

## Download

The app, ready to install (release 0.2.1, <https://github.com/acryldev/acryl/releases/tag/ade-v0.2.1>):

| | Apple Silicon / ARM | Intel / x64 |
|---|---|---|
| macOS | [ACRYL-ADE-mac-arm64.dmg](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-mac-arm64.dmg) | [ACRYL-ADE-mac-x64.dmg](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-mac-x64.dmg) |
| Windows | [ACRYL-ADE-win-arm64.exe](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-win-arm64.exe) | [ACRYL-ADE-win-x64.exe](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-win-x64.exe) |
| Linux (Debian, Ubuntu) | [ACRYL-ADE-linux-arm64.deb](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-linux-arm64.deb) | [ACRYL-ADE-linux-x64.deb](https://github.com/acryldev/acryl/releases/download/ade-v0.2.1/ACRYL-ADE-linux-x64.deb) |

The apps are not signed yet. macOS: the first start is right-click > Open. Windows: SmartScreen may ask, More info > Run anyway.
Linux: `sudo apt install ./ACRYL-ADE-linux-x64.deb`. On Windows and Linux ACRYL ADE uses the git on your machine.

Or with the `acryl` command, which makes and runs it from source in `~/.acryl/ade`: `npx acryl ade` (browser) or `npx acryl ade --gui` (window).

## Start from source

```bash
npm create @acryldev/blends@latest my-ade -- --from acryl.ade
cd my-ade && npm run dev
```


The first screen asks for a model key (Settings > Models). Add a project with the `+` next to Projects.

## How it is made

ACRYL ADE is an ordinary Blend: `blend.yaml`, `src/`, `plugins/`, tests. The one difference from the blank app is its frame layer,
`cordis.patch.yml`: where every other Blend mounts the Blends frame (`@acryldev/blends-frame`) at the page's root, ACRYL ADE mounts the
IDE's workbench (`@acryldev/workspace`). The app's own pages still answer under `/app` (`/app/about`), and the agent can grow the app with
plugins like in every Blend.

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
- **The workbench** (`@acryldev/workspace`, mounted by `cordis.patch.yml`) is ACRYL's IDE workbench ported into the acrylblends
  repository (`ide/acryl-workspace`, whose `provenance.json` names the acryl commit it was ported from and what changed), and published to
  npm from there.

What is this app's own: `blend.yaml`, `cordis.patch.yml`, `src/`, the tests and the release workflow.

## Commands

- `npm run dev`: the workbench, with the agent.
- `npm test`, `npm run check`: the app's tests and type checks.

## Forks

[ACRYL SDE](https://acrylblends.github.io/blends/ai/sde) (`acryl.sde`), the Synthetic Data Engine, is ACRYL ADE plus a pipeline that turns a
codebase into anonymized, reviewed training-data packages.

MIT licence.
