import { createServer, request, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WORKSPACE_PICK_FOLDER_PATH } from '../../src/folder-picker/contract.ts'
import { FolderPickerUnavailableError } from '../../src/folder-picker/picker.ts'
import { handleWorkspacePickFolderRequest } from '../../src/folder-picker/route.ts'

let answer: () => Promise<string | null> = async () => '/p/proj'
const reported: string[] = []
let server: Server
let origin = ''
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => { void handleWorkspacePickFolderRequest(req, res, origin, () => answer(), operation => { reported.push(operation) }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  port = typeof address === 'object' && address !== null ? address.port : 0
  origin = `http://127.0.0.1:${String(port)}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => { resolve() })) })

function call(method: string, opts: { sameOrigin?: boolean; json?: boolean } = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const { sameOrigin = true, json = true } = opts
  return new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {}
    if (json) headers['content-type'] = 'application/json'
    if (sameOrigin) Object.assign(headers, { origin, 'sec-fetch-site': 'same-origin' })
    const req = request({ host: '127.0.0.1', port, path: WORKSPACE_PICK_FOLDER_PATH, method, headers }, (res) => {
      let out = ''
      res.on('data', (c: Buffer) => { out += c.toString('utf8') })
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, json: JSON.parse(out) as Record<string, unknown> }) })
    })
    req.on('error', reject)
    req.end(method === 'POST' ? '{}' : undefined) // a GET carries no body, or the unread bytes poison the next request
  })
}

describe('pick-folder route', () => {
  it('answers the picked path, or null when the chooser was cancelled', async () => {
    answer = async () => '/p/proj'
    expect(await call('POST')).toMatchObject({ status: 200, json: { path: '/p/proj' } })
    answer = async () => null
    expect(await call('POST')).toMatchObject({ status: 200, json: { path: null } })
  })

  it('refuses a foreign origin, a non-JSON request and a GET - it raises a window on the person\'s screen', async () => {
    answer = async () => { throw new Error('must not open') }
    expect((await call('POST', { sameOrigin: false })).status).toBe(403)
    expect((await call('POST', { json: false })).status).toBe(403)
    expect((await call('GET')).status).toBe(405)
  })

  it('says 501 when the machine has no chooser, and 500 (reported) for anything else', async () => {
    answer = async () => { throw new FolderPickerUnavailableError() }
    expect((await call('POST')).status).toBe(501)
    answer = async () => { throw new Error('boom') }
    expect((await call('POST')).status).toBe(500)
    expect(reported).toEqual(['open the folder chooser'])
  })
})
