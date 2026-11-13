/** Strict same-origin loopback routes for the ACRYL screen. Reads need the app's own page; a change needs the exact `Origin` and a small JSON body. */
import { Acryl } from 'acrylblends'
import { error } from 'acryl-loopback-http'
import { INVALID_JSON, jsonBody, jsonContent, ownPage, privateApi, readJson, type ReportError } from 'acryl-loopback-http/router'
import {
  LAUNCHER_ADD_PATH, LAUNCHER_BLENDS_PATH, LAUNCHER_API_PREFIX, LAUNCHER_HEALTH_PATH, LAUNCHER_NEW_PATH, LAUNCHER_REMOVE_PATH, LAUNCHER_START_PATH, LAUNCHER_STATE_PATH, LAUNCHER_STOP_PATH,
  SURFACES, type NewAppRequest, type Surface,
} from './contract.ts'
import { RegistryUnavailable } from './registry.ts'
import { LauncherRefusal, type LauncherService } from './service.ts'

const MAX_FIELD = 1024

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() !== '' && value.length <= MAX_FIELD ? value.trim() : undefined
const onlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean => Object.keys(value).every(key => allowed.includes(key))

function parseOne(field: string) {
  return (value: unknown): string | undefined => {
    const body = record(value)
    return body === undefined || !onlyKeys(body, [field]) ? undefined : text(body[field])
  }
}

function parseNew(value: unknown): NewAppRequest | undefined {
  const body = record(value)
  if (body === undefined || !onlyKeys(body, ['where', 'name', 'starter', 'blend', 'surface'])) return undefined
  const where = text(body.where)
  const name = text(body.name)
  const starter = text(body.starter)
  const blend = text(body.blend)
  const surface = SURFACES.find((known): known is Surface => known === body.surface)
  if (where === undefined || name === undefined || surface === undefined || (starter === undefined) === (blend === undefined)) return undefined
  return { where, name, surface, ...starter === undefined ? {} : { starter }, ...blend === undefined ? {} : { blend } }
}

export function launcherRoutes(service: LauncherService, report: ReportError = () => {}): Acryl {
  const app = new Acryl()
  app.get(LAUNCHER_STATE_PATH, ownPage, (c) => c.json(service.state()))
  app.get(LAUNCHER_HEALTH_PATH, ownPage, async (c) => {
    try {
      return c.json({ ...await service.health(), keyMask: service.maskedModelKey() ?? null })
    } catch (cause) {
      report('check this machine', cause)
      return c.json(error('the launcher is unavailable'), 500)
    }
  })

  app.get(LAUNCHER_BLENDS_PATH, ownPage, async (c) => {
    try {
      return c.json({ blends: await service.blends() })
    } catch (cause) {
      if (cause instanceof RegistryUnavailable) return c.json(error(cause.message), 502)
      report('read the registry', cause)
      return c.json(error('the launcher is unavailable'), 500)
    }
  })

  /** A change: same-origin JSON in, the new state out. A refusal is 409 with its reason; anything else is reported and 500. */
  const change = <T>(path: string, parse: (value: unknown) => T | undefined, run: (request: T) => void, operation: string): void => {
    app.post(path, ownPage, jsonContent, jsonBody(), async (c) => {
      const value = await readJson(c)
      if (value === INVALID_JSON) return c.json(error('invalid JSON request'), 400)
      const request = parse(value)
      if (request === undefined) return c.json(error(`invalid ${operation} request`), 400)
      try {
        run(request)
        return c.json(service.state())
      } catch (cause) {
        if (cause instanceof LauncherRefusal) return c.json(error(cause.message), 409)
        report(operation, cause)
        return c.json(error('the launcher is unavailable'), 500)
      }
    })
  }
  change(LAUNCHER_ADD_PATH, parseOne('path'), path => { service.add(path) }, 'add an app')
  change(LAUNCHER_REMOVE_PATH, parseOne('id'), id => { service.remove(id) }, 'remove an app')
  change(LAUNCHER_NEW_PATH, parseNew, request => { service.create(request) }, 'make an app')
  change(LAUNCHER_START_PATH, parseOne('id'), id => { service.start(id) }, 'start an app')
  change(LAUNCHER_STOP_PATH, parseOne('id'), id => { service.stop(id) }, 'stop an app')
  return privateApi(LAUNCHER_API_PREFIX, app)
}
