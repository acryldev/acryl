/** Same-origin route that opens the operating system's own folder chooser on the machine running the Host. */
export const WORKSPACE_PICK_FOLDER_PATH = '/api/acryl-workspace/pick-folder'

/** What the chooser answered: the picked absolute path, or null when it was cancelled. */
export interface PickFolderView {
  readonly path: string | null
}

/** HTTP status the route uses when this machine has no native chooser (a headless Linux box, say). */
export const PICK_FOLDER_UNAVAILABLE_STATUS = 501

export function parsePickFolderView(value: unknown): PickFolderView {
  if (typeof value !== 'object' || value === null || !('path' in value)) throw new Error('invalid folder chooser response')
  const path = (value as { path?: unknown }).path
  if (path !== null && typeof path !== 'string') throw new Error('invalid folder chooser response')
  return { path }
}
