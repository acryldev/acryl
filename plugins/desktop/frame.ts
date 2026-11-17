/**
 * The desktop window on the ACRYL frame (docs/plans/ide-host-inversion.md, section 27). An app with `scripts/ide-host.mjs` runs inside the frame on `npm run dev`;
 * `npm run desktop` shows that same frame: it attaches to a host that already runs (the host's address record, `frame-url.json` in the app's data folder), or starts the host
 * the way `npm run dev` does and loads the address it prints. Nothing here imports electron: `main.ts` decides with these functions and owns the window.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appDataHome } from '../instance/index.ts'

/** The launcher every frame app has; without it the app runs on its own server (made before the frame). */
export const HOST_SCRIPT = join('scripts', 'ide-host.mjs')

/** The line the host prints once it serves the frame, with the launch token in the address. */
const HOST_LINE = /acrylblends host: (http:\/\/\S+)/u

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

/** How long a stopping host gets before its tree is killed. */
export const HOST_STOP_GRACE_MS = 5_000

export function isFrameApp(root: string, exists: (path: string) => boolean = existsSync): boolean {
  return exists(join(root, HOST_SCRIPT))
}

/** The app home the host uses: `ACRYLBLENDS_HOME` when set, else the app's data folder under ~/.acryl (`appDataHome`, the one place that decides it). */
export function frameHome(root: string, env: Record<string, string | undefined>): string {
  const pinned = env.ACRYLBLENDS_HOME?.trim()
  return pinned === undefined || pinned === ''
    ? appDataHome(resolve(root), process.platform, env)
    : resolve(pinned)
}

/** The frame address in the host's output so far, or `undefined` while it has not printed it. */
export function hostAddress(output: string): string | undefined {
  return HOST_LINE.exec(output)?.[1]
}

/** A loopback `http:` address, or `undefined` for anything else: the window only ever opens a frame on this machine. */
export function loopbackAddress(url: unknown): URL | undefined {
  if (typeof url !== 'string') return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname) ? parsed : undefined
  } catch {
    return undefined
  }
}

export interface RecordDeps {
  readonly read?: (file: string) => string
  /** Whether something accepts a connection at the address. */
  readonly listening?: (url: URL) => Promise<boolean>
}

const tcpListening = (url: URL, timeoutMs = 500): Promise<boolean> =>
  new Promise((done) => {
    const socket = connect({
      host: url.hostname.replace(/^\[|\]$/gu, ''),
      port: Number(url.port || 80),
    })
    const finish = (listening: boolean) => {
      socket.destroy()
      done(listening)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })

/**
 * The frame that already runs for this app: the host's address record, when it names a loopback address and something listens there. A record a stopped host
 * left behind is not a running frame.
 */
export async function runningFrame(
  home: string,
  deps: RecordDeps = {},
): Promise<string | undefined> {
  const read = deps.read ?? ((file: string) => readFileSync(file, 'utf8'))
  let record: { url?: unknown }
  try {
    record = JSON.parse(read(join(home, 'frame-url.json'))) as { url?: unknown }
  } catch {
    return undefined
  }
  const url = loopbackAddress(record.url)
  if (url === undefined) return undefined
  return (await (deps.listening ?? tcpListening)(url)) ? url.href : undefined
}

/** An address as the door may show it: the frame's launch token removed (the token is the way into the frame, so it never goes to a log). */
export function withoutToken(href: string): string {
  try {
    const parsed = new URL(href)
    if (!parsed.searchParams.has('token')) return href
    parsed.searchParams.delete('token')
    return parsed.href
  } catch {
    return href
  }
}

/**
 * What the Settings... menu item runs in a frame window: the window event the page's root owner opens its own Settings on (`acryl-blends-frame`'s
 * `OPEN_SETTINGS_EVENT`, and the IDE's `acryl-workspace`; keep the string in step). The same dialog as the top bar's gear, never a second one.
 */
export const openFrameSettings = "window.dispatchEvent(new Event('acryl:open-settings'))"

/** What the window does with a navigation: stay on the frame's origin, hand the address to the system browser, or refuse it. */
export type Navigation = 'stay' | 'external' | 'block'

/**
 * ACRYL Desktop's rule (`electron-shell-generation.ts`): only the main frame is checked, so the frame's tiles (the app's page in an iframe) navigate freely;
 * the frame's own origin stays in the window, an `http(s)` or `mailto` address goes to the system browser, anything else is refused.
 */
export function navigation(target: string, origin: string, mainFrame = true): Navigation {
  if (!mainFrame) return 'stay'
  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return 'block'
  }
  if (parsed.origin === origin) return 'stay'
  return parsed.protocol === 'http:' ||
    parsed.protocol === 'https:' ||
    parsed.protocol === 'mailto:'
    ? 'external'
    : 'block'
}

/** How the host is started: the npm and Node that ran `npm run desktop`, never Electron's Node (node-pty and DSH's rows are built for Node's ABI). */
export function hostCommand(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
): { file: string; args: string[]; shell: boolean } {
  const node = env.npm_node_execpath
  const npm = env.npm_execpath
  if (node !== undefined && node !== '' && npm !== undefined && npm !== '')
    return /\.c?js$/u.test(npm)
      ? { file: node, args: [npm, 'run', 'dev'], shell: false }
      : { file: npm, args: ['run', 'dev'], shell: platform === 'win32' }
  // Started without npm (Electron run by hand): npm from the PATH, `npm.cmd` through the shell on Windows (scripts/lib/platform.mjs, npmSpawn).
  return platform === 'win32'
    ? { file: 'npm.cmd', args: ['run', 'dev'], shell: true }
    : { file: 'npm', args: ['run', 'dev'], shell: false }
}

/** How a host ended: its exit, the last of its output, and whether the window asked for it (`stop`) or it ended by itself. */
export interface HostEnd {
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
  readonly tail: string
  readonly requested: boolean
}

export interface FrameHost {
  /** The frame address the host printed, or a rejection with the host's output when it ended first. */
  readonly ready: Promise<string>
  /** Resolves once, when the host has ended, whenever that is: after it served the frame too (a stop it did not get asked for is a death). */
  readonly ended: Promise<HostEnd>
  /** Stop the host and what it started; resolves once it has exited. */
  stop(): Promise<void>
}

export interface FrameHostLaunch {
  /**
   * A packaged product has no npm to run `npm run dev` with: the host runs on the app's own Electron runtime as Node, with the same loader the dev script uses.
   */
  readonly runtime?: string
  /**
   * Where the Program is when it is not in the app folder: a product's bundle. The host, its loader and the resolver that serves the Program from there
   * and the person's files from the app's source (plugins/instance/bundle-overlay.ts) start from it; the host still runs in the app folder.
   */
  readonly program?: string
}

/**
 * What a packaged host watches: the person's own files that make the app, and nothing else. `node --watch` alone follows only the modules the host has loaded,
 * so a new plugin folder, or a row added to `blend.yaml`, stayed unseen until some loaded file changed (found on a packed app: a plugin written into
 * `plugins/notes/` was not served after 15 s). Naming a path turns the module watching off, so the folders are named whole; `.git` (a commit must not restart
 * the app) and the app's data are not among them.
 */
export const WATCHED_IN_SOURCE = ['src', 'plugins', 'blend.yaml'] as const

/**
 * The arguments of a packaged product's host (the runtime is Electron as Node): `--watch` first, as the app's `dev` script has it, so a saved change in the
 * person's source or plugins restarts the host and the app shows it, with no extensions plugin in the frame to do it (found on a packed app: an edit of
 * `src/routes.ts` stayed unseen until the app was quit). Then the loader and, when the Program is in a bundle, the overlay that serves it.
 */
export function packagedHostArgs(
  program: string,
  root: string,
  exists: (path: string) => boolean = existsSync,
): string[] {
  return [
    '--watch',
    ...WATCHED_IN_SOURCE.map((name) => join(root, name))
      .filter((path) => exists(path))
      .map((path) => `--watch-path=${path}`),
    // The loader first and the overlay second: a hook registered later runs first, so the overlay sees every import before the loader's aliases.
    '--import',
    pathToFileURL(join(program, 'plugins', 'acryl-node-server', 'src', 'register.ts')).href,
    ...(program === root
      ? []
      : [
          '--import',
          pathToFileURL(join(program, 'plugins', 'instance', 'bundle-overlay.ts')).href,
        ]),
    join(program, HOST_SCRIPT),
  ]
}

/** Start the app's frame host as `npm run dev` does, in the app folder; its output is passed through to `write`. */
export function startFrameHost(
  root: string,
  env: NodeJS.ProcessEnv,
  write: (text: string) => void,
  platform: NodeJS.Platform = process.platform,
  launch: FrameHostLaunch = {},
): FrameHost {
  const program = launch.program ?? root
  const command =
    launch.runtime === undefined
      ? hostCommand(env, platform)
      : { file: launch.runtime, args: packagedHostArgs(program, root), shell: false }
  // The host leads its own process group on macOS and Linux, so a stop reaches npm, the host and every terminal it runs; Windows stops the tree with taskkill.
  const child: ChildProcess = spawn(command.file, command.args, {
    cwd: root,
    env: {
      ...env,
      ...(launch.runtime === undefined
        ? { ELECTRON_RUN_AS_NODE: undefined }
        : { ELECTRON_RUN_AS_NODE: '1' }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: command.shell,
    detached: platform !== 'win32',
    windowsHide: true,
  })
  let output = ''
  let exited = false
  let requested = false
  let outcome: Pick<HostEnd, 'code' | 'signal'> = { code: null, signal: null }
  const exit = new Promise<void>((done) => {
    child.once('exit', (code, signal) => {
      exited = true
      outcome = { code, signal }
      done()
    })
    child.once('error', (cause) => {
      exited = true
      output += `\n${cause.message}`
      done()
    })
  })
  const ended = exit.then((): HostEnd => ({ ...outcome, tail: output.slice(-3000), requested }))
  const ready = new Promise<string>((done, fail) => {
    const take = (chunk: Buffer) => {
      const text = chunk.toString()
      write(text)
      if (output.length < 200_000) output += text
      const address = hostAddress(output)
      if (address !== undefined) done(address)
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    void exit.then(() =>
      fail(new Error(`the frame host ended before it served the frame:\n${output.slice(-3000)}`)),
    )
  })
  const signal = (name: NodeJS.Signals) => {
    if (child.pid === undefined) return
    // Windows has no process groups and no SIGTERM a console process can answer: the whole tree (npm, the host, its terminals) is ended at once.
    if (platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      return
    }
    try {
      process.kill(-child.pid, name)
    } catch {
      // The group is already gone.
    }
  }
  // What the host left running (its terminals, the watcher's child) does not outlive a host that ended by itself.
  void exit.then(() => {
    if (!requested) signal('SIGTERM')
  })
  return {
    ready,
    ended,
    async stop() {
      requested = true
      if (exited) return
      signal('SIGTERM')
      const graceful = await Promise.race([
        exit.then(() => true),
        new Promise<boolean>((done) => setTimeout(() => done(false), HOST_STOP_GRACE_MS).unref()),
      ])
      if (!graceful) {
        signal('SIGKILL')
        await exit
      }
    },
  }
}
