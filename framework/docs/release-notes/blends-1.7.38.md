# @acryldev/blends 1.7.38

Released 2026-11-25.

- **One OS id per app in the desktop shell** (`@acryldev/desktop-shell` 0.1.15, carried in the library; spec 052 T056-T058). The macOS bundle id of the
  app's branded Electron, the Windows AppUserModelID and the Linux window class are one value, `osAppIdOf` in `@acryldev/instance`, the same one its
  launcher in Applications, the Start menu or the app menu carries, so the OS treats the entry and the open window as one app.
- **One copy of `@acryldev/instance` in an app.** desktop-shell 0.1.15 depends on instance 0.1.5, the version the launcher already uses; 0.1.14 pinned
  0.1.4, so an app installed both.
