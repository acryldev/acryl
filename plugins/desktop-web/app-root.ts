import { fileURLToPath } from 'node:url'

/**
 * The app this shell runs. In an app copy the shell sits at `<app>/plugins/desktop-web/main.ts`, so the app is two levels above it. Installed as a
 * package (`<app>/node_modules/@acrylblends/desktop-web/lib/main.js`), the shell is not inside the app's tree and Electron knows the app: the
 * folder whose `package.json` named `main`, which is the same answer for `electron .` in development and for a packaged app (spec 051 T011).
 */
export function appRootFor(moduleUrl: string, appPath: () => string): string {
  return /[\\/]node_modules[\\/]/u.test(moduleUrl)
    ? appPath()
    : fileURLToPath(new URL('../..', moduleUrl))
}
