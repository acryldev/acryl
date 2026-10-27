import { describe, expect, it, vi } from 'vitest'
import { RENDERER_BOOT_REPORT_PATH, rendererBootRoutes } from '../../src/startup/renderer-boot.ts'
import { call, postJson } from '../api/call.ts'

describe('desktop renderer boot route', () => {
  it('accepts a same-origin failed Loader report', async () => {
    const report = {
      status: 'failed' as const,
      plugins: ['dsh-vision-router'],
      error: 'keyed slot "tool.call.toolview" already has an entry for key "vision_crop" at priority 0',
    }
    const notify = vi.fn()

    const res = await postJson(rendererBootRoutes(notify), RENDERER_BOOT_REPORT_PATH, report)

    expect(notify).toHaveBeenCalledWith(report)
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('rejects cross-origin attempts to mark the renderer healthy', async () => {
    const notify = vi.fn()

    const res = await postJson(rendererBootRoutes(notify), RENDERER_BOOT_REPORT_PATH, { status: 'healthy' }, {
      headers: { origin: 'https://example.com' },
    })

    expect(notify).not.toHaveBeenCalled()
    expect(res.status).toBe(403)
  })

  it.each([
    ['an unknown status', { status: 'fine' }],
    ['a failed report without plugins', { status: 'failed' }],
    ['an empty plugin name', { status: 'failed', plugins: [''] }],
    ['too many plugins', { status: 'failed', plugins: Array.from({ length: 65 }, (_, index) => `p${String(index)}`) }],
  ])('refuses %s with 400', async (_label, body) => {
    const notify = vi.fn()
    const res = await postJson(rendererBootRoutes(notify), RENDERER_BOOT_REPORT_PATH, body)
    expect(res.status).toBe(400)
    expect(notify).not.toHaveBeenCalled()
  })

  it('refuses another media type, malformed JSON, and a report over 16 KiB', async () => {
    const notify = vi.fn()
    const routes = rendererBootRoutes(notify)
    const post = (body: string, type: string): Promise<Response> => call(routes, RENDERER_BOOT_REPORT_PATH, { method: 'POST', body, headers: { 'content-type': type } })

    expect((await post('{"status":"healthy"}', 'text/plain')).status).toBe(415)
    expect((await post('{', 'application/json')).status).toBe(400)
    expect((await post(JSON.stringify({ status: 'failed', plugins: ['a'], error: 'x'.repeat(17 * 1024) }), 'application/json')).status).toBe(413)
    expect(notify).not.toHaveBeenCalled()
  })
})
