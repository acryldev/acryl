# The Desktop (Electron) app: structure, and what a plugin can and cannot change

Source: `apps/acryl-desktop` in the ACRYL repository. Read this before promising any Desktop change.

## Two halves

- **Main process (Node, Electron).** Boots the ACRYL runtime, owns the window, the native menu, notifications, the tray, the
  installer identity and updates. Files (all under `apps/acryl-desktop/`): `src/main.ts` (boot, `PRODUCT_NAME = 'ACRYL'`),
  `src/electron-shell-generation.ts` (creates the `BrowserWindow`), `src/window-options.ts` (window chrome per mode and
  platform), `src/native-menu.ts`, `src/notifications.ts`, `src/desktop-*.ts` and `src/profile*.ts`, `src/pnpm.ts` services (`desktopProfiles`, `desktopPnpm`, plugins,
  market, terminal), `src/tray-*.ts`, `src/update-*.ts`, `build/` (icons: `app-icon.png`, `app-icon-mac.png`, `tray-icon*.png`, logos), and the
  `package.json` `build` section (electron-builder: `appId` `dev.acryl.desktop`, `productName` `ACRYL`, icons, targets).
- **Renderer (the web client app).** The SAME React client app as Web, loaded from the Desktop-owned local web server into the
  window (`src/client/*` adds Desktop-only pieces: `AdvancedFrame.tsx`, `advanced-shell.ts`, `theme-presenter.ts`,
  `layout-service.ts`, the Desktop settings tabs, `styles.ts` and `desktop-settings-styles.ts` which hold CSS in TypeScript).

## Presentation modes

- **compatibility**: the stock DSH web UI inside a native window.
- **advanced**: the ACRYL frame: a translucent native window (macOS vibrancy `sidebar`, hidden inset title bar with traffic lights;
  Windows Mica with a title bar overlay), the ACRYL sidebar, main surface and details panel. It exposes frame slots:
  `desktop.main` (replaceable main surface), `sidebar`, `conversation`, `details`, `shell.overlay` (see
  `../maps/mount-points.md`). Advanced mode is supported on macOS and Windows.

## What a plugin can change (live, in an installed app)

Everything in the renderer that Web can change, identically: theme tokens and fonts (`ui-theme.md`), brand slots and the tab or
window title text (`ui-branding.md`), client slots including the Desktop frame slots, host services, tools, commands. The
theme presenter applies the resolved tokens to the document body, and dark mode follows `nativeTheme`.
The Desktop-only host services (`desktopProfiles`, `desktopPnpm`, `livePluginActivation`) are in `desktop-main.md`.

## What needs a source change and a rebuild (COLD)

| Change | Where |
| --- | --- |
| App icon, tray icon, logos in the installer | `build/*.png`, `package.json` build `icon` entries |
| Product name, app id, installer name | `package.json` `build` (`appId`, `productName`), `src/main.ts` `PRODUCT_NAME` |
| Title bar, vibrancy or Mica, window size, minimum size, traffic light position | `src/window-options.ts` (`advancedWindowOptions`, `compatibilityWindowOptions`) |
| Native menu items and shortcuts | `src/native-menu.ts` |
| The Desktop-only frame layout and settings tabs | `src/client/AdvancedFrame.tsx`, `src/client/desktop-settings*.ts(x)` |
| Notifications, tray icons and locale, updates | `src/notifications.ts`, `src/tray-icons.ts`, `src/tray-locale.ts`, `src/updates.ts`, `src/update-*.ts` |

These are only possible when you are working inside the ACRYL repository. To try one: `corepack pnpm run dev` (an isolated
development app with its own home, `~/.acryl-dev`), reload after client changes, and restart after main-process changes. Run the
Desktop tests (`apps/acryl-desktop`, `vitest run`). A packaged app is read-only: `app.asar` cannot be edited, so an agent in an
installed app can only use the live plugin changes above. Say that plainly.

## Safety

- Never disable the sandbox or `contextIsolation`, never enable `nodeIntegration`, in `webPreferences`.
- Never touch the user's real `~/.dsh` or `~/.acryl`; use a temporary home for experiments.
- A visual change cannot be seen by you: ask the user to look.
- Reference: `reference/cordis-guides/hello-world-plugin-guide.md`, `reference/cordis-guides/development-canvas-plugin.md`.
