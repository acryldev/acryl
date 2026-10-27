# Desktop

An Acryl app also runs as a desktop app: an Electron window opens on the app's own server. It is the same app and the same code as `npm run dev`; nothing in the app changes. This page covers a plain Acryl app (the `nodejs`
template) and a Blend app (the `acryl-app` template or `acrylblends init`). It runs from source today: packaging a distributable app (dmg, exe, deb) is not part of it yet.

## Add it

In an Acryl app made by `npm create acrylblends@latest my-app -- --template nodejs`:

```sh
cd my-app
npm install
npx acrylblends add desktop
npm install
npm run desktop
```

In a Blend app, the same two commands (`npx acrylblends add desktop`, `npm install`) add the Blend form of the shell, and `npx acrylblends init my-app --template todo --desktop` creates a Blend app with it already in.
`acrylblends add desktop` chooses the right form: a Blend app (it has `plugins/instance`) or a plain Acryl app.

## What it adds

- `plugins/desktop-web/` (a plain app) or `plugins/desktop/` (a Blend app): the window code. Only this folder imports `electron`; the app's own code never does.
- `electron` as a development dependency (pinned to 44.9.3) and the script `npm run desktop`.
- `.acrylblends/` in `.gitignore`: Electron's user data (window state, cache, logs) lives in `.acrylblends/electron` inside the app's own folder, never in the user's application-data folder.

## What `npm run desktop` does

1. Serves the app on `127.0.0.1` with a free port: for a plain app, `app.fetch` from `src/app.ts` (`export default app`) through `acrylblends/node-server`; for a Blend app, its own `createApp`.
2. Takes a single-instance lock: a second launch of the same app focuses the first window and exits.
3. Opens one window on the server's address, with a locked-down renderer (context isolation, no Node in the page, the sandbox, web security). Navigation stays on the app's own origin; any other link opens in the system browser.
4. When the window closes (or on SIGINT or SIGTERM), stops the server and exits.

## The first launch downloads Electron

`npm install` does not download Electron's binary (Electron 44 has no install script). The first `npm run desktop` does: about 100 MB, once per machine, then it is cached. Behind a proxy or mirror set `ELECTRON_MIRROR`
(and `ELECTRON_CACHE` to reuse a download); if the download is blocked, run `npx install-electron` where the mirror is reachable.

## A different start page

The window opens on `/`. To open another path, set it in `package.json`: `"acrylblends": { "desktopPath": "/todo" }`.
