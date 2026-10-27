import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, ownPage, readJson } from 'acryl-loopback-http/router'
import { jsonContent } from '../api/http.ts'
import { RENDERER_BOOT_REPORT_PATH, type RendererBootReport } from './renderer-boot-contract.ts'

export { RENDERER_BOOT_REPORT_PATH } from './renderer-boot-contract.ts'
export type { RendererBootReport } from './renderer-boot-contract.ts'

const MAX_REPORT_BYTES = 16 * 1024
const MAX_FAILED_PLUGINS = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseReport(value: unknown): RendererBootReport | undefined {
  if (!isRecord(value)) return undefined
  if (value.status === 'healthy') return { status: 'healthy' }
  if (value.status !== 'failed' || !Array.isArray(value.plugins) || value.plugins.length > MAX_FAILED_PLUGINS) {
    return undefined
  }
  if (!value.plugins.every(plugin => typeof plugin === 'string' && plugin.length > 0 && plugin.length <= 512)) {
    return undefined
  }
  if (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > 12 * 1024)) {
    return undefined
  }
  return {
    status: 'failed',
    plugins: [...value.plugins],
    ...(value.error === undefined ? {} : { error: value.error }),
  }
}

/** Validate and forward one same-origin renderer Loader outcome: 204 with no body once it is forwarded. */
export function rendererBootRoutes(report: (value: RendererBootReport) => void): Acryl {
  return new Acryl().post(RENDERER_BOOT_REPORT_PATH, ownPage, jsonContent, jsonBody(MAX_REPORT_BYTES), async (c) => {
    const body = await readJson(c)
    const value = body === INVALID_JSON ? undefined : parseReport(body)
    if (value === undefined) return c.json(error('invalid renderer boot report'), 400)
    report(value)
    return c.body(null, 204)
  })
}
