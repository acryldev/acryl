import { describe, expect, it } from 'vitest'
import { WORKSPACE_PICK_FOLDER_PATH } from '../../src/folder-picker/contract.ts'
import { FolderChooserUnavailableError, createWebFolderPicker } from '../../src/client/projects/web-folder-picker.ts'

function reply(status: number, body: unknown): (input: string, init?: RequestInit) => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createWebFolderPicker', () => {
  it('posts JSON to the route and returns the picked path, or null when cancelled', async () => {
    const seen: Array<{ input: string; init?: RequestInit }> = []
    const pick = createWebFolderPicker(async (input, init) => {
      seen.push({ input, ...(init === undefined ? {} : { init }) })
      return new Response(JSON.stringify({ path: '/p/proj' }), { status: 200 })
    })
    expect(await pick()).toBe('/p/proj')
    expect(seen[0]?.input).toBe(WORKSPACE_PICK_FOLDER_PATH)
    expect(seen[0]?.init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' } })
    expect(await createWebFolderPicker(reply(200, { path: null }))()).toBeNull()
  })

  it('distinguishes "this machine has no chooser" from a failure', async () => {
    await expect(createWebFolderPicker(reply(501, { error: 'no' }))()).rejects.toBeInstanceOf(FolderChooserUnavailableError)
    await expect(createWebFolderPicker(reply(500, { error: 'no' }))()).rejects.toThrow('could not be opened')
    await expect(createWebFolderPicker(reply(200, { nope: 1 }))()).rejects.toThrow('invalid')
  })
})
