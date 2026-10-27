/**
 * One verb list (spec 049 slice 13): the same verbs in the CLI, over MCP and in the built-in chat. The gate is the first test: it lists
 * the verbs from each face of a running app and compares them.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { parseInvocation } from '../../src/cli/acryl.ts'
import { readDoorFile } from '../../src/host/door-file.ts'
import { chatToolName, isDoorToolName, VERBS, type Verb } from '../../src/host/verbs.ts'
import * as door from '../../src/index.ts'
import { operator, removeFolders, runCommand, startApp, until, type Running } from '../harness.ts'

const apps: Running[] = []
afterEach(async () => {
  while (apps.length > 0) await apps.pop()?.close()
  removeFolders()
})

/** The `tools` registry as acrylblends' `agent` plugin provides it: what the built-in chat's agent reads. */
function toolsRegistry() {
  const table = new Map<string, { description: string; run(input: unknown): unknown }>()
  return {
    register(name: string, tool: { description: string; run(input: unknown): unknown }) {
      if (table.has(name)) throw new Error(`tool "${name}" is already registered`)
      table.set(name, tool)
      return () => void table.delete(name)
    },
    list: () => [...table.entries()].map(([name, tool]) => ({ name, description: tool.description })),
    async call(name: string, input: unknown) {
      const tool = table.get(name)
      if (tool === undefined) throw new Error(`unknown tool "${name}"`)
      return await tool.run(input)
    },
  }
}

async function app(options: Parameters<typeof startApp>[0] = {}): Promise<Running & { tools: ReturnType<typeof toolsRegistry> }> {
  const tools = toolsRegistry()
  tools.register('add', { description: 'adds two numbers', run: () => 0 })
  const running = await startApp({ ...options, services: { tools, ...options.services } })
  apps.push(running)
  return { ...running, tools }
}

/** One MCP request to the running app, with the secret from its folder. */
/** `secret: null` sends no authorization header. */
async function mcp(running: Running, body: unknown, secret: string | null | undefined = readDoorFile(running.root)?.secret): Promise<Response> {
  return fetch(`${running.origin}/api/acryl-door/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(secret === null || secret === undefined ? {} : { authorization: `Bearer ${secret}` }) },
    body: JSON.stringify(body),
  })
}

async function mcpCall(running: Running, name: string, args: unknown = {}): Promise<{ content: Array<{ text: string }>; isError: boolean }> {
  const response = await mcp(running, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name, arguments: args } })
  return ((await response.json()) as { result: { content: Array<{ text: string }>; isError: boolean } }).result
}

/** The CLI form of each verb, as an agent types it after `acryl`. */
const CLI_FORMS: Readonly<Record<Verb, readonly string[]>> = {
  'brief': ['brief'],
  'look': ['look'],
  'act': ['act', 'click', '--ref', '1.1'],
  'plugin-list': ['plugin', 'list'],
  'plugin-add': ['plugin', 'add', 'plugins/pomodoro'],
  'plugin-remove': ['plugin', 'remove', 'pomodoro'],
  'plugin-reload': ['plugin', 'reload'],
  'tool-list': ['tool', 'list'],
  'tool-call': ['tool', 'call', '--tool', 'add'],
}

describe('one verb list', () => {
  it('offers the same verbs in the CLI, over MCP and in the built-in chat', async () => {
    const running = await app()

    // The CLI: what the folder's own command lists, and a command line for every one of them.
    const listed = await runCommand(running.root, ['verbs', '--json'], { cwd: running.root })
    expect(listed, listed.err).toMatchObject({ code: 0 })
    const cli = JSON.parse(listed.out) as string[]
    expect(Object.keys(CLI_FORMS).map(verb => parseInvocation(CLI_FORMS[verb as Verb]).verb)).toEqual(Object.keys(CLI_FORMS))

    // MCP: initialize, then the tool list.
    const init = await mcp(running, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })
    expect(await init.json()).toMatchObject({ result: { protocolVersion: '2025-06-18', serverInfo: { name: 'acryl-door' } } })
    const list = await mcp(running, { jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const mcpTools = ((await list.json()) as { result: { tools: Array<{ name: string; inputSchema: { type: string } }> } }).result.tools
    expect(mcpTools.every(tool => tool.inputSchema.type === 'object')).toBe(true)

    // The built-in chat: the door's tools in the registry its agent reads, by verb.
    const chat = running.tools.list().filter(tool => isDoorToolName(tool.name)).map(tool => VERBS.find(verb => chatToolName(verb) === tool.name))

    expect(cli).toEqual([...VERBS])
    expect(mcpTools.map(tool => tool.name)).toEqual([...VERBS])
    expect(chat).toEqual([...VERBS])
    expect(Object.keys(CLI_FORMS)).toEqual([...VERBS])
    // The verbs the spec names are all there.
    expect(VERBS).toEqual(expect.arrayContaining(['brief', 'look', 'act', 'plugin-add', 'plugin-remove', 'plugin-reload']))
    // The app's own tool is still there, beside them.
    expect(running.tools.list().map(tool => tool.name)).toContain('add')
  })

  it('answers a verb with the same text on every face', async () => {
    const running = await app()
    const cli = await operator(running.root, ['brief'])
    expect(cli.code).toBe(0)
    const overMcp = await mcpCall(running, 'brief')
    expect(overMcp.isError).toBe(false)
    const inChat = await running.tools.call(chatToolName('brief'), {})
    expect(overMcp.content[0]?.text).toBe(cli.out.trimEnd())
    expect(inChat).toBe(cli.out.trimEnd())
    expect(inChat).toContain(`App demo in ${running.root}.`)
  })

  it('fails a verb with the same code on every face', async () => {
    // No extensions service: the plugin verbs are unavailable.
    const running = await app()
    const cli = await operator(running.root, ['plugin', 'list'])
    expect(cli.code).toBe(1)
    expect(cli.err).toMatch(/^unavailable: /u)
    const overMcp = await mcpCall(running, 'plugin-list')
    expect(overMcp.isError).toBe(true)
    expect(overMcp.content[0]?.text).toBe(cli.err.trimEnd())
    await expect(running.tools.call(chatToolName('plugin-list'), {})).rejects.toThrow(cli.err.trimEnd())
    // An invalid argument too.
    const invalid = await mcpCall(running, 'act', {})
    expect(invalid).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/^invalid: /u) as string }] })
  })

  it('takes its tools out of the registry when the door stops, and puts them back when it starts again', async () => {
    const running = await app()
    const doorTools = (): number => running.tools.list().filter(tool => isDoorToolName(tool.name)).length
    expect(doorTools()).toBe(VERBS.length)
    let fiber = running.doorFiber
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await fiber.dispose()
      expect(running.tools.list().map(tool => tool.name)).toEqual(['add'])
      fiber = running.ctx.plugin(door, {})
      await until(() => doorTools() === VERBS.length, 'the door tools back in the registry')
    }
    expect(running.tools.list()).toHaveLength(VERBS.length + 1)
  })

  it('will not offer its own verbs as app tools', () => {
    expect(() => door.Config({ tools: { expose: ['door_brief'] } })).toThrow()
    expect(door.Config({ tools: { expose: ['add'] } })).toMatchObject({ tools: { expose: ['add'] } })
  })
})

describe('the MCP route', () => {
  it('needs this run\'s secret, answers a notification with 202, and names an unknown tool', async () => {
    const running = await app()
    expect((await mcp(running, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'wrong')).status).toBe(403)
    expect((await mcp(running, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, null)).status).toBe(403)
    expect((await mcp(running, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    const unknown = await mcp(running, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'shell', arguments: {} } })
    expect(await unknown.json()).toMatchObject({ id: 3, error: { code: -32602, message: expect.stringContaining('brief, look, act') as string } })
    const batch = await mcp(running, [{ jsonrpc: '2.0', id: 4, method: 'ping' }, { jsonrpc: '2.0', id: 5, method: 'nope' }])
    expect(await batch.json()).toMatchObject([{ id: 4, result: {} }, { id: 5, error: { code: -32601 } }])
  })
})
