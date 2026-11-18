import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  frameHome,
  hostAddress,
  hostCommand,
  isFrameApp,
  navigation,
  packagedHostArgs,
  runningFrame,
  startFrameHost,
  withoutToken,
} from '../frame.ts'

test('a frame app is one with the frame launcher', () => {
  assert.equal(
    isFrameApp('/app', (path) => path.replaceAll('\\', '/') === '/app/scripts/ide-host.mjs'),
    true,
  )
  assert.equal(
    isFrameApp('/app', () => false),
    false,
  )
})

test('the frame home is ACRYLBLENDS_HOME when set, else the app data folder under ACRYL_HOME', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-frame-home-'))
  try {
    const app = join(scratch, 'my-app')
    const root = join(scratch, 'acryl-root')
    const home = frameHome(app, { ACRYL_HOME: root }).replaceAll('\\', '/')
    assert.match(home, /\/acryl-root\/apps\/my-app-[0-9a-f]{4}\/data$/u)
    assert.equal(
      frameHome(app, { ACRYL_HOME: root, ACRYLBLENDS_HOME: '  ' }).replaceAll('\\', '/'),
      home,
    )
    assert.equal(
      frameHome(app, { ACRYLBLENDS_HOME: '/elsewhere' })
        .replaceAll('\\', '/')
        .endsWith('/elsewhere'),
      true,
    )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})

test('the host address is read from its printed line, token included', () => {
  assert.equal(hostAddress('booting\n'), undefined)
  assert.equal(
    hostAddress('x\nacrylblends host: http://127.0.0.1:3412/?token=abc\nmore'),
    'http://127.0.0.1:3412/?token=abc',
  )
  assert.equal(hostAddress('acrylblends host: no node server\n'), undefined)
})

test('a running frame is a loopback record something listens on', async () => {
  const record = (url: unknown) => ({ read: () => JSON.stringify({ version: 1, url, pid: 1 }) })
  const yes = { listening: async () => true }
  assert.equal(
    await runningFrame('/home', { ...record('http://127.0.0.1:3412/?token=t'), ...yes }),
    'http://127.0.0.1:3412/?token=t',
  )
  assert.equal(
    await runningFrame('/home', {
      ...record('http://127.0.0.1:3412/?token=t'),
      listening: async () => false,
    }),
    undefined,
  )
  for (const url of ['https://127.0.0.1:1/', 'http://example.com/', 'nonsense', 3])
    assert.equal(await runningFrame('/home', { ...record(url), ...yes }), undefined)
  assert.equal(
    await runningFrame('/home', {
      read: () => {
        throw new Error('ENOENT')
      },
      ...yes,
    }),
    undefined,
  )
  assert.equal(await runningFrame('/home', { read: () => '{', ...yes }), undefined)
})

test('the record check connects for real: a listening port counts, a closed one does not', async () => {
  const home = mkdtempSync(join(tmpdir(), 'desktop-frame-'))
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as { port: number }).port
  try {
    writeFileSync(
      join(home, 'frame-url.json'),
      JSON.stringify({ version: 1, url: `http://127.0.0.1:${String(port)}/?token=t`, pid: 1 }),
    )
    assert.equal(await runningFrame(home), `http://127.0.0.1:${String(port)}/?token=t`)
    await new Promise((done) => server.close(done))
    assert.equal(await runningFrame(home), undefined)
  } finally {
    server.close()
    rmSync(home, { recursive: true, force: true })
  }
})

test('navigation: the frame origin stays, tiles are free, the web goes to the browser, the rest nowhere', () => {
  const origin = 'http://127.0.0.1:3412'
  assert.equal(navigation('http://127.0.0.1:3412/app/', origin), 'stay')
  assert.equal(navigation('https://example.com/', origin), 'external')
  assert.equal(navigation('http://127.0.0.1:9999/', origin), 'external')
  assert.equal(navigation('mailto:a@example.com', origin), 'external')
  assert.equal(navigation('file:///etc/passwd', origin), 'block')
  assert.equal(navigation('javascript:alert(1)', origin), 'block')
  assert.equal(navigation('not a url', origin), 'block')
  // A tile (an iframe) is never checked: the app's page and whatever it links to load inside it.
  assert.equal(navigation('https://example.com/', origin, false), 'stay')
})

test('the token never reaches what the door shows', () => {
  assert.equal(
    withoutToken('http://127.0.0.1:3412/?token=secret&x=1'),
    'http://127.0.0.1:3412/?x=1',
  )
  assert.equal(withoutToken('http://127.0.0.1:3412/app'), 'http://127.0.0.1:3412/app')
  assert.equal(withoutToken('about:blank'), 'about:blank')
})

test('the host runs on the npm and Node that ran npm run desktop, never on Electron', () => {
  assert.deepEqual(
    hostCommand({ npm_node_execpath: '/node', npm_execpath: '/npm/bin/npm-cli.js' }, 'darwin'),
    { file: '/node', args: ['/npm/bin/npm-cli.js', 'run', 'dev'], shell: false },
  )
  assert.deepEqual(
    hostCommand(
      { npm_node_execpath: 'C:\\node.exe', npm_execpath: 'C:\\npm\\bin\\npm-cli.js' },
      'win32',
    ),
    { file: 'C:\\node.exe', args: ['C:\\npm\\bin\\npm-cli.js', 'run', 'dev'], shell: false },
  )
  assert.deepEqual(hostCommand({}, 'win32'), {
    file: 'npm.cmd',
    args: ['run', 'dev'],
    shell: true,
  })
  assert.deepEqual(hostCommand({}, 'linux'), { file: 'npm', args: ['run', 'dev'], shell: false })
})

/** A fake `npm` whose `run dev` prints the host line, then holds (a child of its own too, like the real host's terminals), or exits. */
function fakeNpm(dir: string, body: string): Record<string, string> {
  const script = join(dir, 'npm-cli.js')
  writeFileSync(script, body)
  chmodSync(script, 0o755)
  return { npm_node_execpath: process.execPath, npm_execpath: script }
}

test('a started host is ready with its address and stops with the processes it started', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-host-'))
  const pidFile = join(dir, 'grandchild.pid')
  try {
    const env = fakeNpm(
      dir,
      `const { spawn } = require('node:child_process')
const grandchild = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(grandchild.pid))
console.log('acrylblends host: http://127.0.0.1:3999/?token=abc')
setInterval(() => {}, 1000)
`,
    )
    let seen = ''
    const host = startFrameHost(dir, { ...process.env, ...env }, (text) => {
      seen += text
    })
    assert.equal(await host.ready, 'http://127.0.0.1:3999/?token=abc')
    assert.match(seen, /acrylblends host:/u)
    const grandchild = Number(readFileSync(pidFile, 'utf8'))
    await host.stop()
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    }
    // The tree goes: the terminal-like grandchild does not outlive the window.
    const end = Date.now() + 5000
    while (alive(grandchild) && Date.now() < end) await new Promise((r) => setTimeout(r, 100))
    assert.equal(alive(grandchild), false)
    await host.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a host that ends before it serves the frame rejects with its output', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-host-'))
  try {
    const env = fakeNpm(dir, `console.error('Error: the port is taken'); process.exit(3)\n`)
    const host = startFrameHost(dir, { ...process.env, ...env }, () => {})
    await assert.rejects(host.ready, /ended before it served the frame:\nError: the port is taken/u)
    await host.stop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a host that cannot start at all rejects instead of hanging', async () => {
  const host = startFrameHost(
    tmpdir(),
    { ...process.env, npm_node_execpath: join(tmpdir(), 'no-such-node'), npm_execpath: 'x.js' },
    () => {},
  )
  await assert.rejects(host.ready, /ended before it served the frame/u)
  await host.stop()
})

test("a packaged product watches the person's files and serves the Program from its bundle", () => {
  const args = packagedHostArgs(join('/bundle'), join('/person/source'))
  assert.equal(args[0], '--watch')
  assert.equal(args.filter((arg) => arg === '--import').length, 2)
  assert.match(args.at(-1) ?? '', /ide-host\.mjs$/u)
  // The Program in the app folder itself has no overlay to load.
  assert.equal(packagedHostArgs('/app', '/app').filter((arg) => arg === '--import').length, 1)
})

test("a packaged host watches the person's src, plugins and blend.yaml whole, so a new plugin folder is seen, and never .git or data", () => {
  const source = join('/person/source')
  const args = packagedHostArgs('/bundle', source, () => true)
  assert.deepEqual(
    args.filter((arg) => arg.startsWith('--watch-path=')),
    [
      `--watch-path=${join(source, 'src')}`,
      `--watch-path=${join(source, 'plugins')}`,
      `--watch-path=${join(source, 'blend.yaml')}`,
    ],
  )
  assert.equal(
    args.some((arg) => arg.includes('.git')),
    false,
  )
  // A path the app does not have is not named: node refuses to watch what is not there.
  assert.equal(
    packagedHostArgs('/bundle', source, (path) => path.endsWith('plugins')).filter((arg) =>
      arg.startsWith('--watch-path='),
    ).length,
    1,
  )
})

test('a host that dies after it served the frame is reported with its exit and its last output; a stop the window asked for is not a death', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-host-'))
  try {
    const dies = fakeNpm(
      dir,
      `console.log('acrylblends host: http://127.0.0.1:3999/?token=abc')
setTimeout(() => { console.error('TypeError: boom'); process.exit(7) }, 200)
`,
    )
    const host = startFrameHost(dir, { ...process.env, ...dies }, () => {})
    await host.ready
    const end = await host.ended
    assert.deepEqual([end.code, end.signal, end.requested], [7, null, false])
    assert.match(end.tail, /TypeError: boom/u)

    const holds = fakeNpm(
      dir,
      `console.log('acrylblends host: http://127.0.0.1:3998/?token=abc')
setInterval(() => {}, 1000)
`,
    )
    const stopped = startFrameHost(dir, { ...process.env, ...holds }, () => {})
    await stopped.ready
    await stopped.stop()
    assert.equal((await stopped.ended).requested, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
