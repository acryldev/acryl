/** The native folder chooser, for the app's own page only. */

import { Acryl } from 'acrylblends'
import { failure, ownPage, type ReportError } from '../private-route.ts'
import { PICK_FOLDER_UNAVAILABLE_STATUS, WORKSPACE_PICK_FOLDER_PATH, type PickFolderView } from './contract.ts'
import { FolderPickerUnavailableError } from './picker.ts'

/** POST: open the OS's chooser and answer the folder, or `null` when it was cancelled. */
export function pickFolderRoutes(pick: () => Promise<string | null>, reportError: ReportError): Acryl {
  return new Acryl()
    .post(WORKSPACE_PICK_FOLDER_PATH, ownPage, async (c) => {
      // It raises a window on the person's screen: a JSON request only, which a plain HTML form cannot send.
      if (c.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') return c.json(failure('forbidden'), 403)
      try {
        return c.json({ path: await pick() } satisfies PickFolderView)
      } catch (cause) {
        if (cause instanceof FolderPickerUnavailableError) return c.json(failure(cause.message), PICK_FOLDER_UNAVAILABLE_STATUS)
        reportError('open the folder chooser', cause)
        return c.json(failure('the folder chooser failed'), 500)
      }
    })
}
