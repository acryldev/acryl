// The ACP client against the official ACP v1 JSON schema (vendored in `acp-v1/`, see `../provenance.json`): every message the client sends, and every
// message the test agent sends it, is checked twice, as a whole JSON-RPC message (the schema's `Client` and `Agent` unions) and by its method's own definition
// (`InitializeRequest`, `SessionNotification`, ...). The client is written from that schema rather than ported from an SDK, so a drift shows up here.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { type ChatDriver, createDrivers } from '../../agent-panel/drivers.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as driverAcp from '../index.ts'

const int = (min: number, max: number) => ({
  type: 'number' as const,
  validate: (n: number) => Number.isInteger(n) && n >= min && n <= max,
})
const ajv = new Ajv2020({
  strict: false,
  allErrors: true,
  formats: {
    uint16: int(0, 65_535),
    uint32: int(0, 2 ** 32 - 1),
    int32: int(-(2 ** 31), 2 ** 31 - 1),
    uint64: int(0, Number.MAX_SAFE_INTEGER),
    int64: int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    double: { type: 'number', validate: (n: number) => Number.isFinite(n) },
    uri: { type: 'string', validate: (s: string) => URL.canParse(s) },
  },
})
ajv.addSchema(
  JSON.parse(readFileSync(join(import.meta.dirname, 'acp-v1', 'schema.json'), 'utf8')),
  'acp',
)

function validator(ref: string) {
  const validate = ajv.getSchema(`acp#${ref}`)
  if (!validate) throw new Error(`the ACP schema has no ${ref}`)
  return validate
}
/** The whole message, by who sends it: the schema's top-level `Agent` and `Client` unions. */
const envelope = { toAgent: validator('/anyOf/1'), toClient: validator('/anyOf/0') }

/** The definition each message is checked against, by direction and method; a response is found by the method of the request it answers. */
const DEFINITIONS = {
  toAgent: {
    request: {
      initialize: 'InitializeRequest',
      'session/new': 'NewSessionRequest',
      'session/prompt': 'PromptRequest',
    },
    notification: { 'session/cancel': 'CancelNotification' },
    response: { 'session/request_permission': 'RequestPermissionResponse' },
  },
  toClient: {
    request: { 'session/request_permission': 'RequestPermissionRequest' },
    notification: { 'session/update': 'SessionNotification' },
    response: {
      initialize: 'InitializeResponse',
      'session/new': 'NewSessionResponse',
      'session/prompt': 'PromptResponse',
    },
  },
} as const

type Direction = keyof typeof DEFINITIONS
interface WireMessage {
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: unknown
}

/** Checks every recorded message; returns the definitions that were used, so the test can see it covered them all. */
function check(wire: Array<{ direction: Direction; message: WireMessage }>): Set<string> {
  const methods = new Map<string, string>()
  const used = new Set<string>()
  for (const { direction, message } of wire) {
    const whole = envelope[direction]
    assert.ok(
      whole(message),
      `${direction} ${JSON.stringify(message)}: ${ajv.errorsText(whole.errors)}`,
    )
    let definition: string | undefined
    if (message.method !== undefined) {
      const kind = message.id === undefined ? 'notification' : 'request'
      if (message.id !== undefined)
        methods.set(`${direction}:${String(message.id)}`, message.method)
      definition = (DEFINITIONS[direction][kind] as Record<string, string>)[message.method]
      assert.ok(
        definition,
        `${direction} sent ${kind} ${message.method}, which this test does not know`,
      )
      const validate = validator(`/$defs/${definition}`)
      assert.ok(
        validate(message.params),
        `${direction} ${message.method}: ${ajv.errorsText(validate.errors)}`,
      )
    } else if (message.error === undefined) {
      const asked = methods.get(
        `${direction === 'toAgent' ? 'toClient' : 'toAgent'}:${String(message.id)}`,
      )
      assert.ok(asked, `${direction} answered ${String(message.id)}, which nobody asked`)
      definition = (DEFINITIONS[direction].response as Record<string, string>)[asked]
      assert.ok(definition, `${direction} answered ${asked}, which this test does not know`)
      const validate = validator(`/$defs/${definition}`)
      assert.ok(
        validate(message.result),
        `${direction} answer to ${asked}: ${ajv.errorsText(validate.errors)}`,
      )
    }
    if (definition) used.add(definition)
  }
  return used
}

test('every message of a session, both ways, is valid ACP v1: the handshake, text, tools, a permission, a cancel, a refusal, an error', async () => {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = 'test'
  delete process.env.ACRYL_DOOR
  const root = mkdtempSync(join(tmpdir(), 'acp-wire-'))
  const wireFile = join(root, 'wire.jsonl')
  const app = new Context()
  try {
    await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
    const registry = createDrivers()
    app.provide('drivers', registry)
    const fiber = app.plugin(driverAcp, {
      agents: {
        fake: {
          command: process.execPath,
          args: [join(import.meta.dirname, 'fake-agent.mjs')],
          env: { FAKE_ACP_WIRE: wireFile },
        },
      },
    })
    await fiber.await()
    const driver = registry.get('acp:fake') as ChatDriver
    for (const message of ['hello', 'permission', 'refuse', 'nonsense']) {
      for await (const _ of driver.start({ message, signal: new AbortController().signal })) {
        // Only the wire is checked here; driver-acp.test.ts checks the events.
      }
    }
    const stop = new AbortController()
    for await (const _ of driver.start({ message: 'wait', signal: stop.signal })) stop.abort()
    await fiber.dispose()

    const wire = readFileSync(wireFile, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { direction: Direction; message: WireMessage })
    const used = check(wire)
    const all = Object.values(DEFINITIONS).flatMap((kinds) =>
      Object.values(kinds).flatMap((byMethod) => Object.values(byMethod)),
    )
    assert.deepEqual(
      [...used].sort(),
      [...new Set(all)].sort(),
      'the session used every message the client speaks',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('the check itself refuses what is not ACP: a wrong protocol version and an update without its kind', () => {
  const jsonrpc = '2.0'
  assert.throws(
    () =>
      check([
        {
          direction: 'toAgent',
          message: {
            jsonrpc,
            id: 1,
            method: 'initialize',
            params: { protocolVersion: 'one' },
          } as WireMessage,
        },
      ]),
    /toAgent initialize: /u,
  )
  assert.throws(
    () =>
      check([
        {
          direction: 'toClient',
          message: {
            jsonrpc,
            method: 'session/update',
            params: { sessionId: 's', update: { content: { type: 'text', text: 'x' } } },
          } as WireMessage,
        },
      ]),
    /toClient session\/update: /u,
  )
})
