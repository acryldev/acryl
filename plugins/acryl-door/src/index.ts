/**
 * `acryl-door`: the Door of the five nouns, as a Cordis plugin of a framework app (spec 049 slice 9). An agent working in the app folder
 * looks at the running page, acts on it, and installs plugins live, through `.acryl/bin/acryl`; everything else it does with its own
 * file tools and shell.
 *
 * The page loads `/api/acryl-door/page.js` (one script tag) and keeps an event stream open to the Host; the Host sends it calls. An
 * operator on this machine reaches `/api/acryl-door/call` with the secret from `<app>/.acryl/door.json`. One effect owns the channel and
 * the audit, the routes are mounted after it, and a second effect writes the connection file last, so disposal removes the file first,
 * then the routes (their in-flight calls end), then closes the channel (every pending call settles).
 */

import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Acryl } from 'acryl-router'
import { clientModules } from 'acryl-node-server/client-modules'
import { auditPath, AuditLog } from './host/audit.ts'
import { UiChannel } from './host/channel.ts'
import { Door, type ExtensionsPort, type ToolsPort } from './host/door.ts'
import { newSecret, removeDoorFile, stateDir, writeDoorFile } from './host/door-file.ts'
import { DOOR_PREFIX, privateApi } from './host/http.ts'
import { operatorRoutes } from './host/operator-routes.ts'
import { pageChannelRoutes } from './host/page-routes.ts'

/** Stable Cordis plugin name, equal to the package name and the Loader row id. */
export const name = 'acryl-door'

/** The part of acrylblends' `appInstance` the door reads: the app folder and its name. */
interface AppFolder {
  readonly root: string
  readonly name: string
}

/** The part of `acryl-node-server` the door reads: where the app listens. */
interface Listening {
  readonly url: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    door: Door
  }
}

export const inject = ['router', 'appInstance', 'nodeServer']

export interface Config {
  tools?: { expose?: string[] }
}

export const Config: z<Config> = z.object({
  tools: z.object({
    expose: z.array(z.string().pattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u)).description('App tools (from the tools registry) the door offers; none by default.'),
  }),
})

/** The page module, served compiled from source by the app's own TypeScript. */
const PAGE_DIR = join(import.meta.dirname, import.meta.url.endsWith('.ts') ? 'page' : join('..', 'src', 'page'))

/** A listening address as one the operator reaches: an any-address bind is reached on loopback. */
function loopbackUrl(url: string): string {
  const parsed = new URL(url)
  if (parsed.hostname === '0.0.0.0' || parsed.hostname === '[::]') parsed.hostname = '127.0.0.1'
  return parsed.origin
}

export function apply(ctx: Context, rawConfig: Config = {}): void {
  const config = Config(rawConfig)
  const app = ctx.get('appInstance') as unknown as AppFolder
  const server = ctx.get('nodeServer') as unknown as Listening
  if (typeof app?.root !== 'string') throw new Error('acryl-door: the appInstance service has no app folder (root)')
  const reportError = (operation: string, cause: unknown): void => {
    ctx.logger?.error?.(`acryl-door: failed to ${operation}: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  const secret = newSecret()
  const channel = new UiChannel()
  const audit = new AuditLog(auditPath(stateDir(app.root)))
  const door = new Door({
    channel,
    audit,
    app: { name: app.name, root: app.root },
    extensions: () => ctx.get('extensions') as unknown as ExtensionsPort | undefined,
    tools: () => ctx.get('tools') as unknown as ToolsPort | undefined,
    expose: config.tools?.expose ?? [],
  })
  ctx.effect(() => () => { channel.close() }, 'acryl-door: page channel')
  // One script tag for the page (`page.js`): it imports the module tree served below it.
  const pageModule = new Acryl()
    .get(`${DOOR_PREFIX}/page.js`, c => c.body(`import '${DOOR_PREFIX}/page/main.ts'\n`, 200, { 'content-type': 'text/javascript; charset=utf-8' }))
    .route(`${DOOR_PREFIX}/page`, clientModules({ root: PAGE_DIR }))
  ctx.router.route('/', privateApi(
    DOOR_PREFIX,
    pageModule,
    pageChannelRoutes(channel, { prefix: DOOR_PREFIX }),
    operatorRoutes(DOOR_PREFIX, secret, door, reportError),
  ))
  ctx.effect(function* () {
    yield ctx.reflect.provide('door', door)
    writeDoorFile(app.root, loopbackUrl(server.url), secret)
    yield () => { removeDoorFile(app.root, secret) }
  }, 'acryl-door: the door service and .acryl/door.json')
}

export { Door, DoorError, VERBS, type Verb, type VerbAnswer } from './host/door.ts'
export { DOOR_PREFIX } from './host/http.ts'
export { doorFilePath, readDoorFile, STATE_DIR, type DoorFile } from './host/door-file.ts'
export type { CallResponse } from './host/operator-routes.ts'
