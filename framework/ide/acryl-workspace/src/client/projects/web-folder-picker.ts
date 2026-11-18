/** Browser client for the Host's native folder chooser route (Web has no chooser of its own). */

import { PICK_FOLDER_UNAVAILABLE_STATUS, WORKSPACE_PICK_FOLDER_PATH, parsePickFolderView } from '../../folder-picker/contract.ts'

/** The machine running the Host has no folder chooser, so the caller should ask for a typed path. */
export class FolderChooserUnavailableError extends Error {
  constructor() {
    super('no native folder chooser is available')
    this.name = 'FolderChooserUnavailableError'
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * @param fetchImpl - injectable for tests; defaults to the page's fetch.
 * @returns a function that opens the chooser and resolves the picked absolute path, or null when cancelled.
 * @throws FolderChooserUnavailableError when the Host has no chooser; an Error for any other failure.
 */
export function createWebFolderPicker(fetchImpl: FetchLike = (input, init) => fetch(input, init)): () => Promise<string | null> {
  return async () => {
    const response = await fetchImpl(WORKSPACE_PICK_FOLDER_PATH, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    if (response.status === PICK_FOLDER_UNAVAILABLE_STATUS) throw new FolderChooserUnavailableError()
    if (!response.ok) throw new Error('The folder chooser could not be opened')
    return parsePickFolderView(await response.json()).path
  }
}
