/**
 * The window and Dock icon of the app being run. An app folder (`acryl new`) may carry its own `icon.png` next to its
 * `blend.yaml`, so a Blend app shows its own brand rather than ACRYL's; everything else keeps the packaged ACRYL icon.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AppInstance } from 'acryl-harness-runtime'

/** The icon an app folder may carry, next to its definition. A square PNG; on macOS it is shown as is, so it carries its own rounded tile. */
export const APP_ICON_FILE = 'icon.png'

/**
 * @param instance - the app instance being run, when one is known.
 * @param fallback - the packaged ACRYL icon.
 * @param exists - file probe (tests replace it).
 * @returns the app folder's own icon when it has one, otherwise `fallback`.
 */
export function appIconPath(
  instance: Pick<AppInstance, 'home' | 'definitionFile'> | undefined,
  fallback: string,
  exists: (path: string) => boolean = existsSync,
): string {
  if (instance?.definitionFile === undefined) return fallback
  const own = join(instance.home, APP_ICON_FILE)
  return exists(own) ? own : fallback
}
