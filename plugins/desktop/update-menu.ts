/**
 * The in-app update of a packed product, in Electron: a "Check for Updates..." menu item (under About on macOS, in Help elsewhere) and one quiet check
 * shortly after start. The person says yes twice, as in DeepSeek Harness: once to download, once to restart into the new version. The logic is
 * updater.ts; this file only asks and shows.
 */

import { join } from 'node:path'
import { app, type BrowserWindow, dialog, Menu, MenuItem, shell } from 'electron'
import {
  downloadInstaller,
  isNewer,
  latestRelease,
  type Release,
  type ReleaseSource,
  startInstall,
} from './updater.ts'

/** Add the menu item and check once a little after start; `window` is the window the dialogs and the download progress belong to. */
export function offerUpdates(source: ReleaseSource, window: () => BrowserWindow | undefined): void {
  let busy = false

  const ask = async (options: Electron.MessageBoxOptions): Promise<number> => {
    const owner = window()
    return (
      owner === undefined
        ? await dialog.showMessageBox(options)
        : await dialog.showMessageBox(owner, options)
    ).response
  }

  const install = async (release: Release): Promise<void> => {
    const owner = window()
    let file: string
    try {
      file = await downloadInstaller(
        release,
        join(app.getPath('userData'), 'updates'),
        (fraction) => owner?.setProgressBar(fraction),
      )
    } finally {
      owner?.setProgressBar(-1)
    }
    const installable = process.platform === 'darwin' || process.platform === 'win32'
    if (!installable) {
      await ask({
        type: 'info',
        message: `${app.getName()} ${release.version} is downloaded`,
        detail: `Install it with:\n\nsudo apt install ${file}`,
      })
      shell.showItemInFolder(file)
      return
    }
    const restart = await ask({
      type: 'info',
      message: `${app.getName()} ${release.version} is ready`,
      detail: 'Restart to finish the update. Your apps and their data stay as they are.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (restart !== 0) return
    if (startInstall(file, process.platform, process.execPath, process.pid)) app.quit()
    else shell.showItemInFolder(file)
  }

  const check = async (manual: boolean): Promise<void> => {
    if (busy) return
    busy = true
    try {
      const release = await latestRelease(source, process.platform, process.arch)
      if (release === undefined || !isNewer(release.version, app.getVersion())) {
        if (manual)
          await ask({
            type: 'info',
            message: `${app.getName()} ${app.getVersion()} is the latest version.`,
          })
        return
      }
      const choice = await ask({
        type: 'info',
        message: `${app.getName()} ${release.version} is available`,
        detail: `You have ${app.getVersion()}. The update is downloaded (${Math.round(release.asset.size / 1e6)} MB) and installed in place; your apps and their data stay as they are.`,
        buttons: ['Download and install', 'Later', 'What is new'],
        defaultId: 0,
        cancelId: 1,
      })
      if (choice === 2) void shell.openExternal(release.page)
      if (choice === 0) await install(release)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      console.warn(`desktop: update: ${message}`)
      if (manual)
        await ask({
          type: 'warning',
          message: 'The update could not be checked or downloaded',
          detail: message,
        })
    } finally {
      busy = false
    }
  }

  const menu = Menu.getApplicationMenu()
  const item = new MenuItem({ label: 'Check for Updates...', click: () => void check(true) })
  if (menu !== null) {
    if (process.platform === 'darwin') {
      const first = menu.items[0]?.submenu
      const about =
        first?.items.findIndex(
          (entry: MenuItem) => entry.role === 'about' || /^about\b/iu.test(entry.label),
        ) ?? -1
      first?.insert(about + 1, item)
    } else {
      const help = menu.items.find(
        (entry: MenuItem) => entry.role === 'help' || /^&?help$/iu.test(entry.label),
      )?.submenu
      help?.append(item)
    }
    Menu.setApplicationMenu(menu)
  }
  setTimeout(() => void check(false), 15_000).unref()
}
