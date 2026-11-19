# Desktop

An Acryl app also runs as a desktop app: an Electron window opens on the app's own server. It is the same app and the same code as `npm run dev`; nothing in the app changes. A Blend app that runs inside the ACRYL frame
(it has `scripts/ide-host.mjs`) gets the whole frame in the window, the same one `npm run dev` serves to the browser: see [The frame in the window](#the-frame-in-the-window). This page covers a plain Acryl app (the `nodejs`
template) and a Blend app (the `agent` template or any other `acrylblends init` template). It runs from source today: packaging a distributable app (dmg, exe, deb) is not part of it yet.

## Add it

In an app made by `npm create acrylblends@latest my-app nodejs` (or `notes`, `chat`):

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

1. For a frame app, attaches to the running frame or starts its host (see [The frame in the window](#the-frame-in-the-window)). Otherwise it serves the app on `127.0.0.1` with a free port: for a plain app, `app.fetch` from `src/app.ts` (`export default app`) through `acrylblends/node-server`; for a Blend app, its own `createApp`.
2. Takes a single-instance lock: a second launch of the same app focuses the first window and exits.
3. Opens one window on the server's address, with a locked-down renderer (context isolation, no Node in the page, the sandbox, web security). Navigation stays on the app's own origin; a link to any other `http(s)` or `mailto` address opens in the system browser.
4. When the window closes (or on SIGINT or SIGTERM), stops the server or frame host it started (never one it attached to) and exits.

## The frame in the window

A Blend app made with the frame (`npm run dev` runs `scripts/ide-host.mjs`) opens the ACRYL frame in its desktop window, not only its page: the left panel with the
projects and sessions, the right panel with Files, Changes and Review, Settings, terminal tabs, the DSH chat, and the app's own page in a browser tile. It is the
same frame the browser shows; the desktop builds nothing of its own.

1. When the frame already runs for this folder (`npm run dev` in another terminal), the window attaches to it: it reads the address the host keeps in
   `.acrylblends/frame-url.json` (owner-only, with the launch token) and opens it. Closing the window leaves that host running.
2. Otherwise the window starts the host itself, exactly as `npm run dev` does (the same npm and Node that ran `npm run desktop`; the host never runs inside
   Electron), and opens the address it prints. Closing the window stops that host and everything it started, including its terminals, so its port is free
   again. Ctrl-C in the terminal does the same: Electron runs in a process group of its own, and `npm run desktop` passes it exactly one signal (a second
   one would end Electron before it could stop the host).
3. Navigation follows ACRYL Desktop's rule: the frame's own address stays in the window, and its tiles (the app's page in an iframe) load freely. A link to any
   other `http(s)` or `mailto` address opens in the system browser, and nothing else opens at all.
4. The door's `window list` shows each window's address without the launch token.

The application menu's `Settings...` (`Cmd+,` on macOS, in the app menu; `Ctrl+,` and the File menu on Windows and Linux) opens the frame's own Settings, the dialog the left panel's Settings button opens. `acrylblends.desktopPath` does not apply to a frame app, because the frame opens the app's page in its tile on first run.

## The first launch downloads Electron

`npm install` does not download Electron's binary (Electron 44 has no install script). The first `npm run desktop` does: about 100 MB, once per machine, then it is cached. Behind a proxy or mirror set `ELECTRON_MIRROR`
(and `ELECTRON_CACHE` to reuse a download); if the download is blocked, run `npx install-electron` where the mirror is reachable.

## Linux: Ubuntu 23.10 and later

Ubuntu 23.10 and later restrict unprivileged user namespaces (`kernel.apparmor_restrict_unprivileged_userns=1`). Chromium's sandbox needs them, and an Electron unpacked by npm into `node_modules` has no AppArmor profile, so Electron stops at the start with "The SUID sandbox helper binary was found, but is not configured correctly" before the app runs.

`npm run desktop` starts through `plugins/desktop/launch.ts`, which reads that sysctl. **Only when it is `1` on Linux** it starts Electron with `--no-sandbox` and prints one line saying so; on macOS, on Windows and on any Linux without the restriction Electron starts with its sandbox, as it always does. The window's renderer is still locked down (context isolation, no Node in the page, web security); what is lost is Chromium's process sandbox around it.

To keep the sandbox, give Electron an AppArmor profile that allows `userns`, as the VS Code and Chrome `.deb` packages do. Save this as `/etc/apparmor.d/my-app-electron` (the path is the one in your app's `node_modules`), then `sudo apparmor_parser -r /etc/apparmor.d/my-app-electron`:

```text
abi <abi/4.0>,
include <tunables/global>

profile my-app-electron /path/to/my-app/node_modules/electron/dist/electron flags=(unconfined) {
  userns,
  include if exists <local/my-app-electron>
}
```

The launcher then still sees the sysctl as `1` and passes `--no-sandbox`; set `ACRYLBLENDS_DESKTOP_SANDBOX=1` to start with the sandbox anyway.

## A different start page

The window opens on `/`. To open another path, set it in `package.json`: `"acrylblends": { "desktopPath": "/todo" }`.
