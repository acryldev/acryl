// D3/D7 soft spot: a real Harness agent turn on the Deno-hosted ACRYL engine host, with a local MOCK model (no key, no network, no cost).
//
//   T=$(mktemp -d); mkdir -p $T/home $T/acryl
//   HOME=$T/home ACRYL_HOME=$T/acryl deno run -A --node-modules-dir=manual specs/042-.../probes/harness-session.mjs
//
// Boots the web engine host exactly like d1b-diagnose-fibers.mjs, points the DeepSeek provider at a mock Anthropic-style Messages endpoint
// (DEEPSEEK_BASE_URL, a fake DEEPSEEK_API_KEY), then calls ctx.sessionController.create() and .prompt() - the same service the browser client uses.
// Pass = the mock received a real /messages request carrying the prompt AND its streamed reply was recorded in the Harness's own session log
// under the throwaway DSH_HOME. Refuses to run without a throwaway ACRYL_HOME. Stops everything it starts.
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.on('unhandledRejection', (r) => console.error('[unhandledRejection]', r instanceof Error ? (r.stack ?? r.message) : r))
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
if (!process.env.ACRYL_HOME) { console.error('set ACRYL_HOME (and HOME) to a throwaway folder'); process.exit(2) }

const REPLY = 'MOCK-REPLY-7431 the fake model says hello from Deno'
const PROMPT = 'Please reply with a greeting, probe 8802.'
const requests = []
const sse = (events) => events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('')

const server = Deno.serve({ hostname: '127.0.0.1', port: 0, onListen() {} }, async (req) => {
  const url = new URL(req.url)
  const body = req.method === 'POST' ? await req.json().catch(() => undefined) : undefined
  requests.push({ method: req.method, path: url.pathname, model: body?.model, stream: body?.stream, tools: body?.tools?.length, hasPrompt: JSON.stringify(body ?? {}).includes('probe 8802') })
  if (req.method === 'POST' && url.pathname.endsWith('/messages')) {
    const id = 'msg_mock_1', model = body?.model ?? 'mock'
    if (body?.stream === false) {
      return Response.json({ id, type: 'message', role: 'assistant', model, content: [{ type: 'text', text: REPLY }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 12, output_tokens: 11 } })
    }
    const stream = sse([
      ['message_start', { type: 'message_start', message: { id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } } }],
      ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY.slice(0, 20) } }],
      ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY.slice(20) } }],
      ['content_block_stop', { type: 'content_block_stop', index: 0 }],
      ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 11 } }],
      ['message_stop', { type: 'message_stop' }],
    ])
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
  }
  return new Response('not found', { status: 404 })
})
const mockPort = server.addr.port
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
  notes.push(`mock saw ${served.length} /messages request(s); carried the prompt: ${served.some((r) => r.hasPrompt)}; tools offered: ${served[0]?.tools}`)
  verdict = hit && served.some((r) => r.hasPrompt) ? 'PASS' : 'FAIL'
} catch (e) {
  notes.push(`error: ${e instanceof Error ? (e.stack ?? e.message).split('\n').slice(0, 4).join(' | ') : e}`)
}
console.log(`harness session on Deno: ${verdict}\n  ` + notes.join('\n  ') + `\n  other mock requests: ${JSON.stringify(requests.filter((r) => !r.path.endsWith('/messages')).slice(0, 5))}`)
await host.dispose()
await server.shutdown()
process.exit(verdict === 'PASS' ? 0 : 1)
