/**
 * The app's own icon, chosen in Settings > App: one PNG at `<app>/assets/icon.png`, the file the page serves as the tab's icon and the desktop window
 * shows (its Dock icon on macOS from the window's next start). The page sends a PNG it drew at 512 px; anything else is refused.
 */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const APP_ICON_FILE = join('assets', 'icon.png')
export const APP_ICON_MAX_BYTES = 2 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export class AppIconRefused extends Error {}

/** The PNG's bytes from the page's base64, or a refusal in words for the person. */
export function iconBytes(base64: unknown): Uint8Array {
  if (typeof base64 !== 'string' || base64.length === 0) throw new AppIconRefused('choose an image first')
  if (base64.length > Math.ceil(APP_ICON_MAX_BYTES / 3) * 4) throw new AppIconRefused('that image is too large: choose one under 2 MB')
  const bytes = Buffer.from(base64, 'base64')
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new AppIconRefused('that is not a PNG image')
  return bytes
}

/** Write the icon into the app, replacing any earlier one in one step (a half-written icon is never served). */
export async function saveAppIcon(root: string, bytes: Uint8Array): Promise<void> {
  const target = join(root, APP_ICON_FILE)
  await mkdir(join(root, 'assets'), { recursive: true })
  const temporary = `${target}.${String(process.pid)}.tmp`
  await writeFile(temporary, bytes)
  await rename(temporary, target)
}
