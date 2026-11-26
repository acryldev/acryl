# @acryldev/blends 1.7.39

Released 2026-11-26.

- **`acrylblends own <package>`: an app owns a core part (spec 052 D18, T068).** It copies the installed frame package (the frame, the chat around the
  app, Settings, ...) into the app's `plugins/<folder>/`, installs its build tools, builds it, and regenerates the frame so the app mounts its own copy;
  every other app keeps the shared one. Change it in `plugins/<folder>/src/`, then `npm run build` there. A failed step removes the copy. To give it
  back, remove the folder and run `acrylblends upgrade`.
- **The frame packages carry their source.** Each of the eleven frame core packages (blends-frame 0.2.19, settings 0.2.2, app-shell 0.2.2, versions
  0.2.2, plugin-admin 0.2.3, system-prompt 0.3.1, app-context 0.2.4, support 0.2.3, sign-in 0.2.5, brand-client 0.2.2, web 0.3.2) publishes its `src/`
  and build config, so the code an app runs is the code it can own.
- **The agent never edits `node_modules`** (app-context 0.2.4): core parts are shared and read-only; the agent changes the app's own files and says when
  a change needs a core plugin the app must own first.
- **Updates in an app run from its Blend copy** (desktop-shell 0.1.16, launcher-desktop 0.2.6): the menu's Check for Updates, Settings > Updates and the
  Home banner, for ACRYL Control Center's own release.
