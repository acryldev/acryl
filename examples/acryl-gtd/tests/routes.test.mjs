/**
 * The board's Host routes (state/capture/triage): same-origin loopback checks, cwd validation, and that they
 * read/write the same `.acryl/gtd.json` the tools use. Routes are captured straight from `apply(ctx)` - no real
 * HTTP server needed, since `kind: 'exact'` registration hands back the plain handler function.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'

const PORT = 45123
const ORIGIN = `http://127.0.0.1:${PORT}`

function fakeCtx() {
  const routes = new Map()
  const tools = new Map()
  return {
    effect: fn => fn(),
    webServer: {
      port: PORT,
      register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) },
    },
    tools: { register: tool => { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    routes,
    tools_: tools,
  }
}

function fakeReq({ method = 'GET', url = '/', origin = ORIGIN, host = `127.0.0.1:${PORT}`, body } = {}) {
  const headers = { host, origin, 'sec-fetch-site': 'same-origin' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = {
    method, url, headers, socket: { remoteAddress: '127.0.0.1' },
    [Symbol.asyncIterator]: async function * () { for (const chunk of chunks) yield chunk },
  }
  return req
}

function fakeRes() {
  const res = { statusCode: 0, headers: {}, body: undefined }
  res.setHeader = (key, value) => { res.headers[key] = value }
  res.end = text => { res.body = text === undefined ? undefined : JSON.parse(text) }
  return res
}

async function withCtx(run) {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-gtd-routes-'))
  try {
    const ctx = fakeCtx()
    apply(ctx)
    await run(ctx, dir)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

test('state: empty for a fresh workspace, rejects a relative or missing cwd', async () => {
  await withCtx(async (ctx, dir) => {
    const handler = ctx.routes.get('/api/acryl-gtd/state')
    const res = fakeRes()
    await handler(fakeReq({ url: `/api/acryl-gtd/state?cwd=${encodeURIComponent(dir)}` }), res)
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body, { items: [], nextId: 1 })

    const bad = fakeRes()
    await handler(fakeReq({ url: '/api/acryl-gtd/state?cwd=relative/path' }), bad)
    assert.equal(bad.statusCode, 400)
  })
})

test('a cross-origin request is refused even with the right host header', async () => {
  await withCtx(async (ctx, dir) => {
    const handler = ctx.routes.get('/api/acryl-gtd/state')
    const res = fakeRes()
    await handler(fakeReq({ url: `/api/acryl-gtd/state?cwd=${encodeURIComponent(dir)}`, origin: 'http://evil.example' }), res)
    assert.equal(res.statusCode, 403)
  })
})

test('capture then triage round-trips through the same file the tools read', async () => {
  await withCtx(async (ctx, dir) => {
    const capture = ctx.routes.get('/api/acryl-gtd/capture')
    const triage = ctx.routes.get('/api/acryl-gtd/triage')
    const state = ctx.routes.get('/api/acryl-gtd/state')

    const captured = fakeRes()
    await capture(fakeReq({ method: 'POST', url: '/api/acryl-gtd/capture', body: { cwd: dir, title: 'Ship the board' } }), captured)
    assert.equal(captured.statusCode, 200)
    assert.equal(captured.body.items[0].status, 'inbox')

    const triaged = fakeRes()
    await triage(fakeReq({ method: 'POST', url: '/api/acryl-gtd/triage', body: { cwd: dir, id: 1, status: 'next', project: 'Board' } }), triaged)
    assert.equal(triaged.statusCode, 200)
    assert.equal(triaged.body.items[0].status, 'next')
    assert.equal(triaged.body.items[0].project, 'Board')

    const read = fakeRes()
    await state(fakeReq({ url: `/api/acryl-gtd/state?cwd=${encodeURIComponent(dir)}` }), read)
    assert.deepEqual(read.body, triaged.body)
  })
})

test('an unknown bucket is refused with 422, not silently accepted', async () => {
  await withCtx(async (ctx, dir) => {
    const capture = ctx.routes.get('/api/acryl-gtd/capture')
    const triage = ctx.routes.get('/api/acryl-gtd/triage')
    await capture(fakeReq({ method: 'POST', url: '/api/acryl-gtd/capture', body: { cwd: dir, title: 'x' } }), fakeRes())
    const res = fakeRes()
    await triage(fakeReq({ method: 'POST', url: '/api/acryl-gtd/triage', body: { cwd: dir, id: 1, status: 'lost' } }), res)
    assert.equal(res.statusCode, 422)
  })
})

test('gtd_board is registered alongside the other tools', async () => {
  await withCtx(async ctx => {
    assert.ok(ctx.tools_.has('gtd_board'))
  })
})
