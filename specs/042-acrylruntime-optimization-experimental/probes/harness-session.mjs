// D3/D7 / B7: a real Harness agent turn on the ACRYL engine host (any runtime: node, deno or bun), with a local MOCK model (no key, no network, no cost).
//
//   T=$(mktemp -d); mkdir -p $T/home $T/acryl
//   HOME=$T/home ACRYL_HOME=$T/acryl deno run -A --node-modules-dir=manual specs/042-.../probes/harness-session.mjs
//
// Boots the web engine host exactly like d1b-diagnose-fibers.mjs, points the DeepSeek provider at a mock Anthropic-style Messages endpoint
// (DEEPSEEK_BASE_URL, a fake DEEPSEEK_API_KEY), then calls ctx.sessionController.create() and .prompt() - the same service the browser client uses.
// Pass = the mock received a real /messages request carrying the prompt AND its streamed reply was recorded in the Harness's own session log
// under the throwaway DSH_HOME. Refuses to run without a throwaway ACRYL_HOME. Stops everything it starts.
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r instanceof Error ? (r.stack ?? r.message) : r))
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const webPort = Number(process.env.ACRYL_WEB_PORT)
if (!process.env.ACRYL_HOME || !Number.isInteger(webPort) || webPort === 3080) { console.error('set ACRYL_HOME (and HOME) to a throwaway folder and ACRYL_WEB_PORT to a spare port (never 3080: the web engine host binds it by default)'); process.exit(2) }

const REPLY = 'MOCK-REPLY-7431 the fake model says hello'
const PROMPT = 'Please run the command and then reply, probe 8802.'
const SHELL_MARK = 'SHELL-OK-5521'
const requests = []
const sse = (events) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')

// A mock Anthropic-style model: the first turn asks for the bash tool (so the shell, subprocess and sandbox services must really work), the turn after the tool result replies.
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const body = req.method === 'POST' && raw !== '' ? JSON.parse(raw) : undefined
  const sawToolResult = raw.includes('tool_result')
  const bashTool = (body?.tools ?? []).map((t) => t.name).find((n) => /^bash$/i.test(n)) ?? (body?.tools ?? []).map((t) => t.name).find((n) => /bash/i.test(n))
  requests.push({ method: req.method, path: url.pathname, tools: body?.tools?.length, bashTool, sawToolResult, markerCount: raw.split(SHELL_MARK).length - 1, hasPrompt: raw.includes('probe 8802') })
  if (req.method === 'POST' && url.pathname.endsWith('/messages')) {
    const id = `msg_mock_${requests.length}`, model = body?.model ?? 'mock'
    const start = ['message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } } }]
    const events = !sawToolResult && bashTool !== undefined
      ? [start,
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_mock_1', name: bashTool, input: {} } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ command: `echo ${SHELL_MARK}` }) } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 11 } }],
        ['message_stop', { type: 'message_stop' }]]
      : [start,
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY.slice(0, 20) } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY.slice(20) } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 11 } }],
        ['message_stop', { type: 'message_stop' }]]
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    res.end(sse(events))
    return
  }
  res.writeHead(404).end('not found')
})
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
const mockPort = server.address().port
process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${mockPort}/anthropic`
process.env.DEEPSEEK_API_KEY = 'test-key-not-real'
console.error(`mock model on 127.0.0.1:${mockPort}`)

const anchorPackage = process.env.PAYLOAD ? join(process.env.PAYLOAD, 'package.json') : join(repo, 'apps/acryl-web/package.json') // PAYLOAD: a d6-payload.mjs output with acryl-harness-runtime copied into its node_modules
const anchor = createRequire(pathToFileURL(anchorPackage))
const { createAcrylEngineHost, createWebEngineDefinition } = await import(pathToFileURL(anchor.resolve('acryl-harness-runtime')).href)
const { provideCmdline } = await import(pathToFileURL(anchor.resolve('@deepseek-ai/dsh-cmdline')).href)

const host = await createAcrylEngineHost({
  engines: [createWebEngineDefinition(pathToFileURL(anchorPackage).href)],
  initialEngine: 'dsh',
  prepare: (c) => provideCmdline(c, { args: [], exit: () => {} }),
})
const ctx = host.ctx
await new Promise((r) => setTimeout(r, 3000))
const controller = ctx.get('sessionController')
let verdict = 'FAIL'
const notes = []
try {
  if (controller === undefined) throw new Error('ctx.sessionController is missing')
  const created = await controller.create({})
  notes.push(`session ${created.sessionId}`)
  const accepted = await controller.prompt({ requestId: 'req-probe-1', sessionId: created.sessionId, mode: 'queue', content: [{ type: 'text', text: PROMPT }] }, new AbortController().signal)
  notes.push(`prompt accepted=${accepted?.accepted}`)
  for (let i = 0; i < 40 && !requests.some((r) => r.path.endsWith('/messages')); i++) await new Promise((r) => setTimeout(r, 500))
  await new Promise((r) => setTimeout(r, 4000))

  const root = process.env.DSH_HOME ?? join(process.env.ACRYL_HOME, '.dsh')
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isSymbolicLink() || e.name === 'profiles' || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)])
  const logs = walk(root).filter((f) => statSync(f).size < 5_000_000)
  const hit = logs.find((f) => readFileSync(f, 'utf8').includes('MOCK-REPLY-7431'))
  notes.push(`session log with the reply: ${hit ? hit.replace(root, '$DSH_HOME') : 'NOT FOUND'}`)
  const served = requests.filter((r) => r.path.endsWith('/messages'))
  notes.push(`mock saw ${served.length} /messages request(s); carried the prompt: ${served.some((r) => r.hasPrompt)}; tools offered: ${Math.max(0, ...served.map((r) => r.tools ?? 0))}`)
  notes.push(`bash tool offered: ${served.find((r) => r.bashTool)?.bashTool}; second turn saw a tool result: ${served.some((r) => r.sawToolResult)}; the command output reached the model: ${served.some((r) => r.markerCount >= 2)}`)
  verdict = hit && served.some((r) => r.hasPrompt) && served.some((r) => r.markerCount >= 2) ? 'PASS' : 'FAIL'
} catch (e) {
  notes.push(`error: ${e instanceof Error ? (e.stack ?? e.message).split('\n').slice(0, 4).join(' | ') : e}`)
}
const runtimeName = globalThis.Bun ? 'Bun' : globalThis.Deno ? 'Deno' : 'Node'
console.log(`harness session on ${runtimeName}: ${verdict}\n  ` + notes.join('\n  ') + `\n  other mock requests: ${JSON.stringify(requests.filter((r) => !r.path.endsWith('/messages')).slice(0, 5))}`)
await host.dispose()
server.close()
process.exit(verdict === 'PASS' ? 0 : 1)
