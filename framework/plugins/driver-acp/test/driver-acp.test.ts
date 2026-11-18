import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import * as router from '../../acryl-router/src/index.ts'
import * as state from '../../acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../../agent/index.ts'
import {
  type ChatDriver,
  type ChatEvent,
  createDrivers,
  type Drivers,
} from '../../agent-panel/drivers.ts'
import * as panel from '../../agent-panel/index.ts'
import { builder } from '../../builder/index.ts'
import { extensions } from '../../extensions/index.ts'
import { instance, pinnedInstance } from '../../instance/index.ts'
import * as driverAcp from '../index.ts'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step()
})

const FAKE = join(import.meta.dirname, 'fake-agent.mjs')
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Development mode for the plugin, restored afterwards. */
function development(): void {
  const saved = { NODE_ENV: process.env.NODE_ENV, ACRYL_DOOR: process.env.ACRYL_DOOR }
  process.env.NODE_ENV = 'test'
  delete process.env.ACRYL_DOOR
  cleanup.push(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
}

/** An app folder, and the file the fake agents write their pids to. */
function folder() {
  const root = mkdtempSync(join(tmpdir(), 'acp-root-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const pids = join(root, 'pids.txt')
  const started = (): number[] => {
    try {
      return readFileSync(pids, 'utf8').trim().split('\n').filter(Boolean).map(Number)
    } catch {
      return []
    }
  }
  return { root, pids, started }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until(check: () => boolean, ms = 10_000): Promise<void> {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (check()) return
    await sleep(20)
  }
  throw new Error('timed out waiting')
}

/** The fake agent as the plugin's only agent, mounted with a bare registry (no panel). */
async function boot(config: Partial<driverAcp.DriverAcpConfig> = {}) {
  development()
  const { root, pids, started } = folder()
  const app = new Context()
  await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
  const registry = createDrivers()
  app.provide('drivers', registry)
  const fiber = app.plugin(driverAcp, {
    agents: { fake: { command: process.execPath, args: [FAKE], env: { FAKE_ACP_PIDS: pids } } },
    ...config,
  })
  await fiber.await()
  cleanup.push(() => fiber.dispose())
  const driver = registry.get('acp:fake') as ChatDriver
  return { app, registry, fiber, driver, root, started }
}

async function run(
  driver: ChatDriver,
  message: string,
  signal = new AbortController().signal,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = []
  for await (const event of driver.start({ message, signal })) events.push(event)
  return events
}

test('a turn streams the agent message as text and each finished tool call as one tool event; thoughts stay out', async () => {
  const { driver } = await boot()
  assert.equal(driver.kind, 'chat')
  assert.deepEqual(await run(driver, 'hello'), [
    { event: 'text', data: { text: 'Hel' } },
    { event: 'text', data: { text: 'lo' } },
    {
      event: 'tool',
      data: { tool: 'Read README.md', input: { path: 'README.md' }, result: { lines: 3 } },
    },
    { event: 'tool', data: { tool: 'Run npm test', error: 'exit code 1' } },
  ])
})

test('later messages continue the same session in the same process', async () => {
  const { driver, started } = await boot()
  assert.deepEqual(await run(driver, 'count'), [{ event: 'text', data: { text: 'prompts 1' } }])
  assert.deepEqual(await run(driver, 'count'), [{ event: 'text', data: { text: 'prompts 2' } }])
  assert.equal(started().length, 1)
})

test('aborting the signal cancels the turn through session/cancel, and the next message runs', async () => {
  const { driver } = await boot()
  const stop = new AbortController()
  const events: ChatEvent[] = []
  const reading = (async () => {
    for await (const event of driver.start({ message: 'wait', signal: stop.signal })) {
      events.push(event)
      stop.abort()
    }
  })()
  await reading
  assert.deepEqual(
    events,
    [{ event: 'text', data: { text: 'working' } }],
    'a cancelled turn ends without an error',
  )
  assert.deepEqual(await run(driver, 'count'), [{ event: 'text', data: { text: 'prompts 2' } }])
})

test("a permission request gets the agent's reject option by default, and its allow option when configured", async () => {
  const rejecting = await boot()
  assert.deepEqual(await run(rejecting.driver, 'permission'), [
    { event: 'text', data: { text: 'no' } },
  ])
  const allowing = await boot({ permissions: 'allow' })
  assert.deepEqual(await run(allowing.driver, 'permission'), [
    { event: 'text', data: { text: 'yes' } },
  ])
})

test('a turn that stops short and an agent error are errors in the chat', async () => {
  const { driver } = await boot()
  assert.deepEqual(await run(driver, 'refuse'), [
    { event: 'error', data: { message: 'acp:fake refused to continue' } },
  ])
  assert.deepEqual(await run(driver, 'nonsense'), [
    { event: 'error', data: { message: 'the fake agent does not know "nonsense"' } },
  ])
})

test('an agent that crashes is reported with its reason, and the next message starts a new one', async () => {
  const { driver, started } = await boot()
  const [crash] = await run(driver, 'crash')
  assert.ok(crash?.event === 'error')
  assert.match(crash.data.message, /exit code 3.*boom: the fake agent crashed/u)
  assert.deepEqual(await run(driver, 'count'), [{ event: 'text', data: { text: 'prompts 1' } }])
  assert.equal(started().length, 2)
})

test('an agent that cannot be started is an error of the turn, not of the app', async () => {
  const { driver } = await boot({
    agents: { fake: { command: process.execPath, args: ['--no-such-flag-for-node'] } },
  })
  const [failed] = await run(driver, 'hello')
  assert.equal(failed?.event, 'error')
})

test('unloading the plugin ends the agent process it started, and its drivers leave', async () => {
  const { driver, fiber, registry, started } = await boot()
  await run(driver, 'count')
  const [pid] = started()
  assert.ok(pid !== undefined && alive(pid), 'the agent runs after a message')
  await fiber.dispose()
  await until(() => !alive(pid))
  assert.deepEqual(registry.list(), [], 'the drivers leave with the plugin')
})

test('unloading the plugin also ends what the agent started (its tool processes), not only the agent', {
  skip: process.platform === 'win32',
}, async () => {
  const { driver, fiber, started } = await boot()
  await run(driver, 'spawn')
  const [agent, tool] = started()
  assert.ok(
    agent !== undefined && tool !== undefined && alive(agent) && alive(tool),
    'the agent and its tool process run',
  )
  await fiber.dispose()
  await until(() => !alive(agent) && !alive(tool))
})

test('unloading in the middle of a turn ends the turn and the process', async () => {
  const { driver, fiber, started } = await boot()
  const events: ChatEvent[] = []
  const reading = (async () => {
    for await (const event of driver.start({
      message: 'wait',
      signal: new AbortController().signal,
    }))
      events.push(event)
  })()
  await until(() => events.length > 0)
  const [pid] = started()
  await fiber.dispose()
  await reading
  assert.equal(events.at(-1)?.event, 'error', 'the turn ends with the reason the agent is gone')
  assert.ok(pid !== undefined && !alive(pid))
})

test('reloading three times leaves one driver and no process behind', async () => {
  development()
  const { root, pids, started } = folder()
  const app = new Context()
  await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
  const registry: Drivers = createDrivers()
  app.provide('drivers', registry)
  for (let round = 0; round < 3; round++) {
    const fiber = app.plugin(driverAcp, {
      agents: { fake: { command: process.execPath, args: [FAKE], env: { FAKE_ACP_PIDS: pids } } },
    })
    await fiber.await()
    assert.deepEqual(
      registry.list().map((d) => d.name),
      ['acp:fake'],
    )
    await run(registry.get('acp:fake') as ChatDriver, 'count')
    await fiber.dispose()
  }
  assert.equal(started().length, 3)
  await until(() => started().every((pid) => !alive(pid)))
  assert.deepEqual(registry.list(), [])
})

test('an agent whose command is not on the machine gets no driver and one line saying why', async () => {
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (line: string) => void warnings.push(line)
  cleanup.push(() => {
    console.warn = warn
  })
  const { registry } = await boot({
    agents: { ghost: { command: 'acp-agent-that-is-not-installed', args: [] } },
  })
  assert.deepEqual(registry.list(), [])
  assert.deepEqual(warnings, [
    'driver-acp: no acp:ghost driver, "acp-agent-that-is-not-installed" is not on the PATH',
  ])
})

test('dsh is a preset: the command line of its ACP server, with no code of its own', () => {
  assert.deepEqual(driverAcp.PRESETS.dsh, { command: 'dsh', args: ['--profile', 'acp'] })
})

test('without the panel the plugin is pending; in production it starts nothing', async () => {
  development()
  const { root } = folder()
  const app = new Context()
  await app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })).await()
  const fiber = app.plugin(driverAcp, {
    agents: { fake: { command: process.execPath, args: [FAKE] } },
  })
  await sleep(50)
  assert.equal((app as unknown as { drivers?: unknown }).drivers, undefined)
  const registry = createDrivers()
  app.provide('drivers', registry)
  await fiber.await()
  assert.deepEqual(
    registry.list().map((d) => d.name),
    ['acp:fake'],
  )
  await fiber.dispose()

  process.env.NODE_ENV = 'production'
  const production = app.plugin(driverAcp, {
    agents: { fake: { command: process.execPath, args: [FAKE] } },
  })
  await production.await()
  assert.deepEqual(registry.list(), [])
  await production.dispose()
})

test('through the real agent panel: the page asks acp:fake and gets its text, its tool lines and done', async () => {
  development()
  const { root, pids } = folder()
  const app = new Context()
  const fibers: Array<ReturnType<Context['plugin']>> = []
  const mount = async (fiber: ReturnType<Context['plugin']>) => {
    fibers.push(fiber)
    await fiber.await()
  }
  await mount(app.plugin(instance, pinnedInstance(join(root, '.acrylblends'), { root })))
  await mount(app.plugin(router))
  await mount(app.plugin(state))
  await mount(
    app.plugin(extensions, { sources: [{ dir: join(root, 'plugins'), trust: 'install' }] }),
  )
  for (const plugin of [model, tools, memory, agent]) await mount(app.plugin(plugin))
  await mount(app.plugin(builder, {}))
  await mount(app.plugin(panel, { drivers: [] }))
  await mount(
    app.plugin(driverAcp, {
      agents: { fake: { command: process.execPath, args: [FAKE], env: { FAKE_ACP_PIDS: pids } } },
    }),
  )
  cleanup.push(async () => {
    for (const fiber of [...fibers].reverse()) await fiber.dispose()
  })
  const own = { 'sec-fetch-site': 'same-origin' }
  const session = (await (
    await app.router.request('/api/agent-panel/session', { headers: own })
  ).json()) as {
    token: string
    drivers: Array<{ name: string; kind: string }>
  }
  assert.ok(
    session.drivers.some((d) => d.name === 'acp:fake' && d.kind === 'chat'),
    'the panel lists the driver',
  )
  const response = await app.router.request('/api/agent-panel/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...own, 'x-agent-panel-token': session.token },
    body: JSON.stringify({ message: 'hello', driver: 'acp:fake' }),
  })
  assert.equal(response.status, 200)
  const events = (await response.text())
    .split('\n\n')
    .filter(Boolean)
    .map((block) => block.match(/^event: (.+)$/mu)?.[1])
  assert.deepEqual(events, ['text', 'text', 'tool', 'tool', 'done'])
})
