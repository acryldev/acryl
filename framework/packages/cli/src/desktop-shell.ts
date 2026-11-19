/**
 * Where a Blend app's desktop shell is (spec 051 T011): the app's own copy in `plugins/desktop-shell` (every app made before the shell became a
 * package, and any app that edited its shell), else the `@acryldev/desktop-shell` package the app depends on. The packer (its Electron entry and
 * icon fallback) and the frame release (is this a desktop app) ask here, so an app that moved from the copy to the package stays a desktop app.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

/** The package the desktop shell is published as. */
export const DESKTOP_SHELL_PACKAGE = '@acryldev/desktop-shell'

/** The app's desktop shell: where its files are and its Electron entry, relative to the app (POSIX separators, as package.json `main` wants). */
export type DesktopShell =
  | { readonly kind: 'copy'; readonly root: string; readonly main: string }
  | { readonly kind: 'package'; readonly root: string; readonly main: string }

const posix = (path: string): string => path.split('\\').join('/')

/** The app's desktop shell, or undefined for an app without one (a web-only app). A copy wins over the package: it is what the app runs. */
export function findDesktopShell(appDir: string): DesktopShell | undefined {
  const copy = join(appDir, 'plugins', 'desktop-shell')
  if (existsSync(copy)) return { kind: 'copy', root: copy, main: 'plugins/desktop-shell/main.ts' }
  // What the app has installed, looked up the way Node finds an app's packages (its own node_modules, then each parent's), not through
  // require.resolve: a resolution hook (the repository's workspace-source mapping) or NODE_PATH would otherwise answer for packages the app
  // does not have (the first fresh-clone gate caught it).
  for (let dir = realpathSync(appDir); ; dir = dirname(dir)) {
    const root = join(dir, 'node_modules', DESKTOP_SHELL_PACKAGE)
    if (existsSync(join(root, 'package.json'))) {
      const real = realpathSync(root)
      const manifest = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8')) as {
        exports?: Record<string, unknown>
      }
      const entry = manifest.exports?.['./main']
      const file =
        typeof entry === 'string' ? entry : (entry as { default?: unknown } | undefined)?.default
      if (typeof file !== 'string') return undefined
      return {
        kind: 'package',
        root: real,
        main: posix(relative(realpathSync(appDir), join(real, file))),
      }
    }
    if (dirname(dir) === dir) return undefined
  }
}
