/** Same-origin POST handler for the native folder chooser. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { error, finishJson, isJsonRequest, isSameOriginLoopbackRequest } from 'acryl-loopback-http'
import { PICK_FOLDER_UNAVAILABLE_STATUS, type PickFolderView } from './contract.ts'
import { FolderPickerUnavailableError } from './picker.ts'

export async function handleWorkspacePickFolderRequest(
  req: IncomingMessage,
  res: ServerResponse,
  expectedOrigin: string,
  pick: () => Promise<string | null>,
  reportError: (operation: string, cause: unknown) => void,
): Promise<void> {
  if (req.method !== 'POST') return finishJson(res, 405, error('method not allowed'), 'POST')
  // Mutating, and it raises a window on the person's screen: same-origin loopback and a JSON request only.
  if (!isSameOriginLoopbackRequest(req, expectedOrigin, true) || !isJsonRequest(req)) return finishJson(res, 403, error('forbidden'))
  try {
    const view: PickFolderView = { path: await pick() }
    return finishJson(res, 200, view, 'POST')
  } catch (cause) {
    if (cause instanceof FolderPickerUnavailableError) return finishJson(res, PICK_FOLDER_UNAVAILABLE_STATUS, error(cause.message))
    reportError('open the folder chooser', cause)
    return finishJson(res, 500, error('the folder chooser failed'))
  }
}
