import assert from 'node:assert/strict'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import {
  FRAME_TOKEN_PATH,
  FRAME_URL_FILE,
  frameHome,
  frameUrlPath,
  openFrame,
  readFrameUrl,
  removeFrameUrl,
  writeFrameUrl,
} from '../src/frame-url'
import { ideProfilePlan } from '../src/ide-profile'
import type { Io } from '../src/io'

// `open` reads the frame home from the environment (the launcher's own rule); the tests decide it themselves and must not inherit a shell's.
const savedFrameHome = process.env.ACRYLBLENDS_HOME
const savedRoot = process.env.ACRYL_HOME
const root = mkdtempSync(join(tmpdir(), 'acrylblends-frame-url-root-'))
beforeAll(() => {
  delete process.env.ACRYLBLENDS_HOME
  process.env.ACRYL_HOME = root
})
afterAll(() => {
  if (savedFrameHome !== undefined) process.env.ACRYLBLENDS_HOME = savedFrameHome
  if (savedRoot === undefined) delete process.env.ACRYL_HOME
  else process.env.ACRYL_HOME = savedRoot
  rmSync(root, { recursive: true, force: true })
})

const scratch: string[] = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'acrylblends-frame-url-'))
  scratch.push(dir)
  return dir
}

/** A frame app's folder as far as `open` reads it: the app's own family (plugins/instance), which decides its home. */
function frameApp(): string {
  const app = folder()
  cpSync(
    join(import.meta.dirname, '..', '..', '..', 'plugins', 'instance'),
    join(app, 'plugins', 'instance'),
    {
      recursive: true,
      filter: (source) => !/[\\/]test$/u.test(source),
    },
  )
  writeFileSync(join(app, 'package.json'), '{"type":"module"}\n')
  return app
}

function fakeIo(cwd: string): { io: Io; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return {
    io: {
      stdout: { write: (text: string) => out.push(text) },
      stderr: { write: (text: string) => err.push(text) },
      cwd,
      ask: undefined,
      install: async () => 0,
    },
    out,
    err,
  }
}

/** A port nothing listens on: bind one, note it, and close it. */
function closedPort(): Promise<number> {
  return new Promise((done) => {
    const server = createNetServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => done(port))
    })
  })
}

describe('the frame address record', () => {
  it('round-trips the address and its token, owner-only, atomically and without temporary files', () => {
    const home = folder()
    writeFrameUrl(home, 'http://127.0.0.1:3240/?token=abc')
    const record = readFrameUrl(home)
    assert.equal(record?.url, 'http://127.0.0.1:3240/?token=abc')
    assert.equal(record?.token, 'abc')
    assert.equal(record?.pid, process.pid)
    assert.equal(record?.version, 1)
    // Owner-only: the file that carries the launch token is not readable by anyone else.
    if (process.platform !== 'win32') assert.equal(statSync(frameUrlPath(home)).mode & 0o777, 0o600)
    assert.deepEqual(readdirSync(home), [FRAME_URL_FILE])
    writeFrameUrl(home, 'http://127.0.0.1:3240/?token=def')
    assert.equal(readFrameUrl(home)?.token, 'def')
    assert.match(readFileSync(frameUrlPath(home), 'utf8'), /"writtenAt":/u)
  })

  it('reads a record written before tokens were stored, taking the token from the address', () => {
    const home = folder()
    writeFileSync(
      frameUrlPath(home),
      `${JSON.stringify({ version: 1, url: 'http://127.0.0.1:3240/?token=old', pid: 7, writtenAt: 'x' })}\n`,
    )
    assert.equal(readFrameUrl(home)?.token, 'old')
  })

  it('asks the app’s own family, as the launcher does: ACRYLBLENDS_HOME when set, else its data folder under ~/.acryl', () => {
    const app = frameApp()
    assert.match(
      frameHome(app, { ACRYL_HOME: root }).replaceAll('\\', '/'),
      /\/apps\/acrylblends-frame-url-[a-z0-9]+-[0-9a-f]{4}\/data$/u,
    )
    const pinned = folder()
    assert.equal(frameHome(app, { ACRYLBLENDS_HOME: pinned }), pinned)
    assert.throws(() => frameHome(folder(), {}), /not a frame app/u)
  })

  it('reads nothing from a malformed or foreign record, and removes only its own', () => {
    const home = folder()
    writeFileSync(frameUrlPath(home), 'not json')
    assert.equal(readFrameUrl(home), undefined)
    writeFrameUrl(home, 'http://127.0.0.1:1/?token=x', 4242)
    // A host that is stopping must not erase the address of a newer one that already started.
    removeFrameUrl(home, 4343)
    assert.equal(readFrameUrl(home)?.pid, 4242)
    removeFrameUrl(home, 4242)
    assert.equal(readFrameUrl(home), undefined)
  })
})

describe('acrylblends open', () => {
  it('prints the address of the running frame, and only the address', async () => {
    const app = frameApp()
    const home = frameHome(app, process.env)
    const server = createNetServer()
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const url = `http://127.0.0.1:${String(port)}/?token=running`
    writeFrameUrl(home, url)
    const { io, out, err } = fakeIo(app)
    try {
      assert.equal(await openFrame([], io), 0)
    } finally {
      server.close()
    }
    assert.equal(out.join(''), `${url}\n`)
    assert.equal(err.join(''), '')
  })

  it('explains a stopped frame instead of handing out a dead token', async () => {
    const app = frameApp()
    const home = frameHome(app, process.env)
    const port = await closedPort()
    writeFrameUrl(home, `http://127.0.0.1:${String(port)}/?token=gone`)
    const { io, out, err } = fakeIo(app)
    assert.equal(await openFrame([], io), 1)
    assert.equal(out.join(''), '')
    assert.match(err.join(''), /is not running/u)
    assert.match(err.join(''), /npm run dev/u)
    assert.doesNotMatch(err.join(''), /token=gone/u)
  })

  it('says a folder never ran a frame', async () => {
    const home = folder()
    const { io, out, err } = fakeIo(home)
    assert.equal(await openFrame([], io), 1)
    assert.equal(out.join(''), '')
    assert.match(err.join(''), /no frame has run/u)
  })

  it('--new rotates the token in the running host and keeps the new address', async () => {
    const app = frameApp()
    const home = frameHome(app, process.env)
    let current = 'stored-token'
    const seen: string[] = []
    const server = createServer((request, response) => {
      if (request.method !== 'POST' || request.url !== FRAME_TOKEN_PATH) {
        response.writeHead(404).end()
        return
      }
      const presented = String(request.headers['x-frame-token'] ?? '')
      seen.push(presented)
      if (presented !== current) {
        response.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden')
        return
      }
      current = `rotated-${String(Math.random()).slice(2)}`
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ url: `http://127.0.0.1:${String(port)}/?token=${current}` }))
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const oldUrl = `http://127.0.0.1:${String(port)}/?token=stored-token`
    writeFrameUrl(home, oldUrl)
    const { io, out, err } = fakeIo(app)
    try {
      assert.equal(await openFrame(['--new'], io), 0)
    } finally {
      server.close()
    }
    const rotated = readFrameUrl(home)
    assert.equal(seen[0], 'stored-token')
    assert.notEqual(rotated?.token, 'stored-token')
    assert.equal(out.join(''), `${rotated?.url ?? ''}\n`)
    assert.equal(err.join(''), '')
  })

  it('--new with nothing running forgets the address, and the next start mints a new one', async () => {
    const app = frameApp()
    const home = frameHome(app, process.env)
    const port = await closedPort()
    writeFrameUrl(home, `http://127.0.0.1:${String(port)}/?token=gone`)
    const { io, out, err } = fakeIo(app)
    assert.equal(await openFrame(['--new'], io), 0)
    assert.equal(out.join(''), '')
    assert.equal(existsSync(frameUrlPath(home)), false)
    assert.match(err.join(''), /forgotten/u)
  })

  it('refuses more than one folder', async () => {
    const { io } = fakeIo(folder())
    assert.equal(await openFrame(['a', 'b'], io), 2)
  })
})

describe('the launcher', () => {
  it('reuses the stored token, keeps the address owner-only, and mounts the rotation route without depending on the installed framework', () => {
    const plan = ideProfilePlan({
      appName: 'My App',
      dshVersion: '0.2.0-rc.2',
      frameworkVersion: '^1.2.0',
    })
    assert.match(plan.hostScript, /const frameRecordPath = join\(home, 'frame-url\.json'\)/u)
    assert.match(plan.hostScript, /connectionAuth\.launchToken = previousAddress\.token/u)
    assert.match(plan.hostScript, /writeFrameRecord\(url\)/u)
    assert.match(plan.hostScript, /restrictFrameRecord\(frameRecordPath\)/u)
    assert.match(plan.hostScript, /new Acryl\(\)\.post\("\/token\/new"/u)
    assert.match(plan.hostScript, /sameToken\(presented, connectionAuth\.launchToken\)/u)
    assert.match(plan.hostScript, /frameRouterHttp\.mount\("\/api\/acryl-frame"\)/u)
    // The launcher is self-contained: an app whose installed acrylblends predates the address helpers still gets the stable token.
    assert.doesNotMatch(plan.hostScript, /acrylblends\/cli/u)
  })
})
