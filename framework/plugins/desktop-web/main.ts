/**
 * The desktop shell of a plain Acryl app: `npm run desktop` serves the app (`src/app.ts`: `export default app`, and optionally `export const close` for a database to close) on a free loopback port from this Electron main process and
 * opens one window on it. Nothing in the app imports electron; every Electron call is in this file and `window.ts`, so a different shell is a change here only.
 *
 * Order matters: the user-data folder is set before anything else (and before the single-instance lock), so one app never shares window state, logs or the lock with
 * another app or with the real user's data.
 */

import { mkdirSync, readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from 'acrylblends/node-server'
import { app, BrowserWindow, shell } from 'electron'
import 'acrylblends/node-server/register'
import { appHomes } from '../instance/index.ts'
import { createDesktopShutdown, installShutdownRequests } from './shutdown.ts'
import { resolveDesktopUserDataOverride } from './user-data.ts'
import { windowOptions } from './window.ts'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
  name?: string
  acrylblends?: { desktopPath?: string }
}

/** Electron's user-data folder: an explicit DSH_DESKTOP_USER_DATA, else the app's cache folder under ~/.acryl (what Chromium keeps can be rebuilt). */
const userData =
  resolveDesktopUserDataOverride(process.env) ?? join(appHomes(projectRoot).cache, 'electron')
mkdirSync(userData, { recursive: true, mode: 0o700 })
app.setPath('userData', userData)
app.setName(manifest.name ?? 'acryl-app')

if (!app.requestSingleInstanceLock()) {
  // The same app is already open: its window takes focus (see `second-instance` below) and this process ends.
  app.quit()
} else {
  let server: ReturnType<typeof serve> | undefined
  let window: BrowserWindow | undefined
  /** The app module's optional `close`, for an app that owns a database: called once the server has stopped. */
  let closeApp: (() => Promise<void>) | undefined

  const shutdown = createDesktopShutdown(
    () =>
      new Promise<void>((done) => {
        if (server === undefined) return done()
        server.close(() => {
          const closing = closeApp?.() ?? Promise.resolve()
          closing.then(
            () => done(),
            () => done(),
          )
        })
        // Open streams and keep-alive connections would hold close() open: end them.
        ;(server as { closeAllConnections?: () => void }).closeAllConnections?.()
      }),
    (code) => {
      app.exit(code)
    },
  )
  installShutdownRequests(process, app, (code) => {
    void shutdown.request(code)
  })

  app.on('second-instance', () => {
    if (window === undefined) return
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  // The window is the app: closing it ends the process on every platform, after the server has stopped.
  app.on('window-all-closed', () => {
    void shutdown.request(0)
  })

  void app.whenReady().then(async () => {
    // The hook above is registered before the app's modules are loaded, so the app may have .tsx pages: they are loaded here, not as a static import.
    const { default: acrylApp, close } = (await import('../../src/app.ts')) as {
      default: { fetch: Parameters<typeof serve>[0]['fetch'] }
      close?: () => Promise<void>
    }
    closeApp = close
    const port = await new Promise<number>((resolve) => {
      server = serve(
        { fetch: acrylApp.fetch, port: 0, hostname: '127.0.0.1' },
        (info: AddressInfo) => {
          resolve(info.port)
        },
      )
    })
    const origin = `http://127.0.0.1:${port}`
    window = new BrowserWindow(windowOptions({ title: manifest.name ?? 'acryl-app' }))
    window.once('ready-to-show', () => window?.show())
    // Navigation stays on the app's own server; any other address opens in the system browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin === origin) return
      event.preventDefault()
      void shell.openExternal(url)
    })
    await window.loadURL(new URL(manifest.acrylblends?.desktopPath ?? '/', origin).href)
  })
}
