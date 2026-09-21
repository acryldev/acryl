# Profile and install services (Desktop main and the compatibility subset)

Use this when a plugin needs to know which profile is active, run a package operation in it, or activate another
plugin without a restart. These are Host services, not browser code.

Working example: `../example-plugins/packages/desktop-main-profile-info/`.

| Service | Where | What you get |
| --- | --- | --- |
| `desktopProfiles` | all surfaces (Desktop full, Web and CLI a subset) | `current` = `{ name, dir }` on every surface. Desktop also has `list()`, `create(name)`, `select(name)` (requests a restart), `canDelete(name)`, `delete(name)` |
| `desktopPnpm` | all surfaces | `runPlugin(args)` runs `dsh plugin ...` in the active profile and returns a handle: `stdout`, `stderr` (streams), `done` (`{ exitCode }`), `cancel()`. Desktop refuses `runPlugin(['add'])`; `run([...])` (generic pnpm) works there |
| `livePluginActivation` | all surfaces | `activate(name)`, `deactivate(name)`, `setEnabled(name, on)`, `statusOf(name)`: mount or unmount an installed plugin live |

## Rules

- Feature-test members that only Desktop has (`typeof profiles.list === 'function'`) before calling them.
- Declare `inject: ['desktopProfiles']` when the plugin is meaningless without it, or read
  `ctx.get('desktopProfiles')` at call time when it is optional. Never capture these at apply time (they can be
  provided after your plugin mounts: the documented ordering trap).
- Never write into another profile's directory, and never touch the user's real home from a test. Use a temporary
  `DSH_HOME`.
- `select()` restarts the app: only do it because the user asked.
- This pack's own install tool (`acryl_install_plugin`) is built on these three services; read
  `../lib/install.js` for a real, tested usage, and `reference/cordis-guides/hello-world-plugin-guide.md` for the
  Desktop plugin walkthrough.
