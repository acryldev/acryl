import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_DIRECTORY_PICKER_PATH, DESKTOP_DIRECTORY_VALIDATOR_PATH } from '../../src/workspaces/directory-picker-contract.ts'
import { directoryPickerRoutes, type DesktopDirectoryNative } from '../../src/workspaces/directory-picker-route.ts'
import { call, postJson } from '../api/call.ts'

function native(overrides: Partial<DesktopDirectoryNative> = {}): DesktopDirectoryNative {
  return { pickDirectory: async () => null, validateDirectory: async () => true, ...overrides }
}

describe('desktop directory picker route', () => {
  it('returns the path selected by the native desktop adapter', async () => {
    const pickDirectory = vi.fn(async () => 'C:\\Work')

    const res = await call(directoryPickerRoutes(native({ pickDirectory })), DESKTOP_DIRECTORY_PICKER_PATH, { method: 'POST' })

    expect(pickDirectory).toHaveBeenCalledOnce()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/^application\/json/u)
    expect(await res.json()).toEqual({ path: 'C:\\Work' })
  })

  it('keeps cancellation distinct from route failure', async () => {
    const res = await call(directoryPickerRoutes(native()), DESKTOP_DIRECTORY_PICKER_PATH, { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ path: null })
  })

  it('rejects cross-origin and non-POST requests without opening a dialog', async () => {
    const pickDirectory = vi.fn(async () => null)
    const routes = directoryPickerRoutes(native({ pickDirectory }))

    expect((await call(routes, DESKTOP_DIRECTORY_PICKER_PATH, { method: 'POST', headers: { origin: 'https://example.com' } })).status).toBe(403)
    expect((await call(routes, DESKTOP_DIRECTORY_PICKER_PATH, { method: 'POST', remoteAddress: '192.0.2.10' })).status).toBe(403)
    const get = await call(routes, DESKTOP_DIRECTORY_PICKER_PATH)
    expect(get.status).toBe(405)
    expect(get.headers.get('allow')).toBe('POST')
    expect(pickDirectory).not.toHaveBeenCalled()
  })

  it('returns a stable error without exposing Electron details', async () => {
    const reportError = vi.fn()
    const routes = directoryPickerRoutes(native({ pickDirectory: async () => { throw new Error('private native failure') } }), reportError)

    const res = await call(routes, DESKTOP_DIRECTORY_PICKER_PATH, { method: 'POST' })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'native directory picker failed' })
    expect(reportError).toHaveBeenCalledWith('open the native directory picker', expect.any(Error))
  })
})

describe('desktop directory validation route', () => {
  it('returns the runtime decision for a selected path', async () => {
    const validateDirectory = vi.fn(async () => false)

    const res = await postJson(directoryPickerRoutes(native({ validateDirectory })), DESKTOP_DIRECTORY_VALIDATOR_PATH, { path: 'E:\\repo' })

    expect(validateDirectory).toHaveBeenCalledWith('E:\\repo')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ allowed: false })
  })

  it.each([
    [{}, 400],
    [{ path: '' }, 400],
    [{ path: 42 }, 400],
  ])('rejects an invalid validation body', async (body, statusCode) => {
    const validateDirectory = vi.fn(async () => true)

    const res = await postJson(directoryPickerRoutes(native({ validateDirectory })), DESKTOP_DIRECTORY_VALIDATOR_PATH, body)

    expect(validateDirectory).not.toHaveBeenCalled()
    expect(res.status).toBe(statusCode)
  })

  it('rejects cross-origin validation before reading the path', async () => {
    const validateDirectory = vi.fn(async () => true)

    const res = await postJson(directoryPickerRoutes(native({ validateDirectory })), DESKTOP_DIRECTORY_VALIDATOR_PATH, { path: 'C:\\Work' }, {
      headers: { origin: 'https://example.com' },
    })

    expect(validateDirectory).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })

  it('reports a runtime validation failure as a stable server error', async () => {
    const reportError = vi.fn()
    const routes = directoryPickerRoutes(native({ validateDirectory: async () => { throw new Error('private volume query failure') } }), reportError)

    const res = await postJson(routes, DESKTOP_DIRECTORY_VALIDATOR_PATH, { path: 'E:\\repo' })

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'directory validation failed' })
    expect(reportError).toHaveBeenCalledWith('validate a workspace directory', expect.any(Error))
  })
})
