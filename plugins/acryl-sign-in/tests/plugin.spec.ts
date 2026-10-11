import type { IncomingMessage, ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import * as signIn from '../src/index.ts'
import { SIGN_IN_ANSWER_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_CANCEL_PATH, SIGN_IN_PROVIDERS_PATH } from '../src/contract.ts'

// FiberState is a const enum in the shipped build, so compare numbers.
const PENDING = 0
const ACTIVE = 2
const settle = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

function webServer() {
  const paths: string[] = []
  const handlers = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>()
  return {
    port: 4321,
    paths,
    handlers,
    register(route: { path: string; handler: (req: IncomingMessage, res: ServerResponse) => void }) {
      paths.push(route.path)
      handlers.set(route.path, route.handler)
      return () => { paths.splice(paths.indexOf(route.path), 1) }
    },
  }
}

function post(value: unknown): IncomingMessage {
  const body = JSON.stringify(value)
  const req = Readable.from([body]) as IncomingMessage
  req.method = 'POST'
  req.headers = {
    host: '127.0.0.1:4321', origin: 'http://127.0.0.1:4321', 'sec-fetch-site': 'same-origin',
    'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)),
  }
  Object.defineProperty(req, 'socket', { configurable: true, value: { remoteAddress: '127.0.0.1' } })
  return req
}

function response(): ServerResponse & { body: string } {
  const res = { body: '', statusCode: 200, setHeader() {}, end(body?: string) { res.body = body ?? '' } }
  return res as unknown as ServerResponse & typeof res
}

const authorization = { list: () => [], begin: async () => ({ status: 'cancelled' }) }
const credentials = { describeRecord: async () => ({ configured: false }) }
const ALL = [SIGN_IN_PROVIDERS_PATH, SIGN_IN_ATTEMPT_PATH, SIGN_IN_BEGIN_PATH, SIGN_IN_ANSWER_PATH, SIGN_IN_CANCEL_PATH]

describe('acryl-sign-in Host plugin', () => {
  it('waits for the web server and the harness authorization and credentials services, then serves its five routes', async () => {
    const server = webServer()
    const root = new Context()
    const fiber = root.plugin(signIn)
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('acrylWeb', server)
    root.provide('authorization', authorization)
    await settle()
    expect(fiber.state).toBe(PENDING)
    root.provide('credentials', credentials)
    await settle()
    expect(fiber.state).toBe(ACTIVE)
    expect(server.paths).toEqual(ALL)
    await fiber.dispose()
    expect(server.paths).toEqual([])
  })

  it('takes its routes down when the authorization service goes away and restores them when it returns', async () => {
    const server = webServer()
    const root = new Context()
    root.provide('acrylWeb', server)
    root.provide('credentials', credentials)
    const withdraw = root.provide('authorization', authorization)
    const fiber = root.plugin(signIn)
    await settle()
    expect(server.paths).toEqual(ALL)
    withdraw()
    await settle()
    expect(server.paths).toEqual([])
    expect(fiber.state).toBe(PENDING)
    root.provide('authorization', authorization)
    await settle()
    expect(server.paths).toEqual(ALL)
    expect(new Set(server.paths).size).toBe(ALL.length)
    await fiber.dispose()
  })

  it('makes the signed-in provider the default for new sessions when the current default has no credential', async () => {
    const server = webServer()
    const root = new Context()
    const saved: unknown[] = []
    let finish: (() => void) | undefined
    const finished = new Promise<void>(resolve => { finish = resolve })
    root.provide('acrylWeb', server)
    root.provide('credentials', { describe: async () => ({ configured: false }), describeRecord: async (key: string) => ({ configured: key === 'llm-pi-ai/anthropic' }) })
    root.provide('authorization', {
      list: () => [{ key: 'llm-pi-ai/anthropic', label: 'Anthropic', methods: [{ id: 'api-key', label: 'API key' }] }],
      begin: async () => ({ status: 'authorized' }),
    })
    root.provide('settings', { describe: () => [], update: async () => {} })
    root.provide('llm', {
      listConfigurableProviders: () => [],
      // DeepSeek, the current default, is not live (no key), so it cannot answer.
      listProviders: () => [{ id: 'anthropic' }],
      listModels: async () => [{ id: 'claude-fable-5' }, { id: 'claude-sonnet-5' }],
    })
    root.provide('agentDefaultModel', {
      currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4-pro' }),
      saveSelection: async (next: unknown) => { saved.push(next); finish?.() },
    })
    const fiber = root.plugin(signIn)
    await settle()
    const res = response()
    server.handlers.get(SIGN_IN_BEGIN_PATH)?.(post({ key: 'llm-pi-ai/anthropic', method: 'api-key' }), res)
    await finished
    expect(saved).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-5' }])
    await fiber.dispose()
  })
})
