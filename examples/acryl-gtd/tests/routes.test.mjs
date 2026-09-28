/**
 * The board's Host routes (state/capture/triage): same-origin loopback checks, cwd validation, and that they
 * read/write the same `.acryl/gtd.json` the tools use. Routes are captured straight from `apply(ctx)` - no real
 * HTTP server needed, since `kind: 'exact'` registration hands back the plain handler function.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'

const PORT = 45123
const ORIGIN = `http://127.0.0.1:${PORT}`

function fakeCtx(home) {
  const routes = new Map()
  const tools = new Map()
  return {
    effect: fn => fn(),
    webServer: {
      port: PORT,
      register: route => { routes.set(route.path, route.handler); return () => routes.delete(route.path) },
    },
    tools: { register: tool => { tools.set(tool.name, tool); return () => tools.delete(tool.name) } },
    // The app's own bulkhead (docs/acryl/APP-INSTANCES-AND-BULKHEADS.md) - never process.cwd(). Caught live: an
    // earlier version fell back to process.cwd(), which inside a real engine process is the shared monorepo
    // checkout that launched it, not the per-app folder - every app's board data landed in one shared file.
    appInstance: { home, dshHome: join(home, '.dsh') },
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
  const res = { statusCode: 0, headers: {}, body: undefined, rawBody: undefined }
  res.setHeader = (key, value) => { res.headers[key] = value }
  res.end = text => {
    res.rawBody = text
    if (text === undefined) return
    try { res.body = JSON.parse(text) } catch { /* not JSON, e.g. the board page's HTML - rawBody carries it */ }
  }
  return res
}

async function withCtx(run) {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-gtd-routes-'))
  try {
    const ctx = fakeCtx(dir)
    apply(ctx)
    await run(ctx, dir)
  } finally {
    rmSync(dir, { force: true, recursive: true })
  }
}

test('state: empty for a fresh workspace, rejects a relative cwd', async () => {
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

test('the board page is served at /gtd as HTML, not gated by the mutating-style same-origin check', async () => {
  await withCtx(async ctx => {
    const handler = ctx.routes.get('/gtd')
    // No Origin header at all: a pasted or bookmarked URL is a top-level navigation, never a fetch() call, and
    // never carries one - the API routes' strict same-origin check is right for them and wrong for this page.
    const req = fakeReq({ url: '/gtd' })
    delete req.headers.origin
    delete req.headers['sec-fetch-site']
    const res = fakeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['content-type'], /text\/html/)
    assert.match(res.rawBody, /GTD Board/)
    assert.match(res.rawBody, /api\/acryl-gtd\/state/)
  })
})

test('the board page refuses a request whose socket is not on the loopback interface', async () => {
  // /gtd deliberately skips the same-origin check (see above) - it must not fall through to no check at all.
  // Caught live: an early version served the page to a bare `curl` from a non-loopback remote address with
  // zero gate. This is the floor, not defense in depth.
  await withCtx(async ctx => {
    const handler = ctx.routes.get('/gtd')
    const req = fakeReq({ url: '/gtd' })
    req.socket = { remoteAddress: '203.0.113.5' }
    const res = fakeRes()
    await handler(req, res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.rawBody, undefined)
  })
})

test('state with no cwd defaults to the app\'s own instance home, never process.cwd()', async () => {
  await withCtx(async (ctx, dir) => {
    const handler = ctx.routes.get('/api/acryl-gtd/state')
    const res = fakeRes()
    await handler(fakeReq({ url: '/api/acryl-gtd/state' }), res)
    assert.equal(res.statusCode, 200)
    assert.ok(Array.isArray(res.body.items))
    // Prove it actually resolved to ctx.appInstance.home (dir), not this test process's own cwd - a capture
    // with no cwd given must land in dir/.acryl/gtd.json, not wherever `node --test` happens to run from.
    const capture = ctx.routes.get('/api/acryl-gtd/capture')
    const captured = fakeRes()
    await capture(fakeReq({ method: 'POST', url: '/api/acryl-gtd/capture', body: { title: 'lands in the app home' } }), captured)
    assert.equal(readFileSync(join(dir, '.acryl', 'gtd.json'), 'utf8').includes('lands in the app home'), true)
  })
})
