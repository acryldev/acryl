import { fileURLToPath } from 'node:url'

/**
 * The app this shell runs. In an app copy the shell sits at `<app>/plugins/desktop-shell/main.ts`, so the app is two levels above it. Installed as a
 * package (`<app>/node_modules/@acryldev/desktop-shell/lib/main.js`), the shell is not inside the app's tree: `npm run desktop` (bin.ts) names the
 * app in ACRYLBLENDS_APP_ROOT, since Electron started on a file takes that file's folder as its app path; a packaged app has no launcher, and there
 * Electron's app path is the app (the packer points its `main` at the shell) (spec 051 T011).
 */
export function appRootFor(
  moduleUrl: string,
  appPath: () => string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!/[\\/]node_modules[\\/]/u.test(moduleUrl)) return fileURLToPath(new URL('../..', moduleUrl))
  return env[APP_ROOT_ENV] || appPath()
}

/** Where the launcher tells the shell's Electron main which app it runs. */
export const APP_ROOT_ENV = 'ACRYLBLENDS_APP_ROOT'
