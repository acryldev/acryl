import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { agent, memory, tools } from '../../agent/index.ts'
import { messagesFor, modelConfigFrom, modelConfigFromFile, openai } from '../index.ts'

/** A stand-in for an OpenAI-compatible server: answers with the scripted replies in order, and records what it was sent. */
async function fakeApi(replies: unknown[]) {
  const received: Array<{
    auth?: string
    body: { messages: unknown[]; tools: Array<{ function: { name: string } }> }
  }> = []
  const server = createServer(async (request: IncomingMessage, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk as Buffer)
    received.push({
      ...(request.headers.authorization ? { auth: request.headers.authorization } : {}),
      body: JSON.parse(Buffer.concat(chunks).toString()),
    })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ choices: [{ message: replies.shift() }] }))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
  return { url, received, close: () => new Promise<void>((done) => server.close(() => done())) }
}

test('drives a tool call and a final answer through the API, rebuilding the conversation each step', async () => {
  const api = await fakeApi([
    {
      content: null,
      reasoning_content: 'I should add.',
      tool_calls: [{ id: 'x', type: 'function', function: { name: 'add', arguments: '{"0":2}' } }],
    },
    { content: 'Done: 2.' },
  ])
  const root = new Context()
  for (const [plugin, config] of [
    [openai, { baseUrl: api.url, model: 'test', apiKey: 'k' }],
    [tools],
    [memory],
    [agent],
  ] as const) {
    await root.plugin(plugin as never, config as never).await()
  }
  const result = await root.agent.run('what is 2')
  assert.equal(result.status === 'completed' && result.output, 'Done: 2.')
  assert.equal(api.received[0]?.auth, 'Bearer k')
  assert.ok(api.received[0]?.body.tools.some((tool) => tool.function.name === 'add'))
  assert.equal(api.received[1]?.body.messages.length, 4)
  // A thinking model's reasoning for the call is sent back with it on the next step.
  assert.equal(
    ((api.received[1]?.body.messages ?? [])[2] as { reasoning_content?: string } | undefined)
      ?.reasoning_content,
    'I should add.',
  )
  await api.close()
})

test('messages carry each tool call and its result or error', () => {
  const messages = messagesFor(
    {
      question: 'q',
      step: 2,
      trace: [
        { tool: 'a', input: { x: 1 }, result: 3 },
        { tool: 'b', input: {}, error: 'nope' },
        { tool: 'look', input: {}, result: 'Page: Board\n- link "My tasks" [ref=1.6]' },
      ],
    },
    'sys',
  )
  assert.deepEqual(
    messages.map((message) => message.role),
    ['system', 'user', 'assistant', 'tool', 'assistant', 'tool', 'assistant', 'tool'],
  )
  assert.equal((messages[3] as { content: string }).content, '3')
  assert.equal((messages[5] as { content: string }).content, '{"error":"nope"}')
  // A text result reads as its lines, not as a quoted JSON string.
  assert.equal(
    (messages[7] as { content: string }).content,
    'Page: Board\n- link "My tasks" [ref=1.6]',
  )
})

test('the configuration comes from an environment-shaped object, and is absent when not set', () => {
  assert.deepEqual(
    modelConfigFrom({ ACRYLBLENDS_MODEL_URL: 'http://x/v1', ACRYLBLENDS_MODEL: 'm' }),
    {
      baseUrl: 'http://x/v1',
      model: 'm',
    },
  )
  assert.equal(modelConfigFrom({}), undefined)
})

test("the configuration comes from the home's model file: absent when there is none, refused when it holds a key others can read", () => {
  const home = mkdtempSync(join(tmpdir(), 'openai-model-'))
  try {
    const file = join(home, 'model.json')
    assert.equal(modelConfigFromFile(file), undefined)
    writeFileSync(
      file,
      JSON.stringify({ baseUrl: ' http://127.0.0.1:11435/v1 ', model: 'qwen2.5' }),
    )
    chmodSync(file, 0o644)
    // No key: nothing secret, so any mode will do.
    assert.deepEqual(modelConfigFromFile(file, 'darwin'), {
      baseUrl: 'http://127.0.0.1:11435/v1',
      model: 'qwen2.5',
    })
    writeFileSync(
      file,
      JSON.stringify({ baseUrl: 'https://api.example/v1', model: 'm', apiKey: 'k' }),
    )
    chmodSync(file, 0o644)
    assert.throws(() => modelConfigFromFile(file, 'darwin'), /chmod 600/)
    assert.deepEqual(modelConfigFromFile(file, 'win32'), {
      baseUrl: 'https://api.example/v1',
      model: 'm',
      apiKey: 'k',
    })
    chmodSync(file, 0o600)
    assert.deepEqual(modelConfigFromFile(file, 'darwin'), {
      baseUrl: 'https://api.example/v1',
      model: 'm',
      apiKey: 'k',
    })
    writeFileSync(file, JSON.stringify({ model: 'm' }))
    assert.throws(() => modelConfigFromFile(file, 'darwin'), /needs "baseUrl" and "model"/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
