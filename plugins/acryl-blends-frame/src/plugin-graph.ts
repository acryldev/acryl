/**
 * The plugin graph, Host side: the numbered list of fiber changes the browser listens to, where each plugin's code is, and the port the frame's routes use.
 * The reading of the context itself is `./graph-inspect.ts` (ported from cordis-plugin-graph, MIT); the recorder and the source finder are new: that plugin
 * kept a ring of tool calls and had the browser ask for the whole graph every two seconds, while here a fiber's own `internal/status` and `internal/plugin`
 * events are recorded, and the browser's request waits until one happens.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { GraphEvent, GraphEventsAnswer, GraphSource, GraphView } from './graph-contract.ts'
import { clamp, inspectCordisContext, PHASE, type SourceOf } from './graph-inspect.ts'

export { inspectCordisContext, type SourceOf } from './graph-inspect.ts'

const MAX_EVENTS = 200
/** How long a request for events waits for one before it answers with none; the browser asks again at once. */
export const EVENTS_WAIT_MS = 20_000

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The numbered list of fiber changes

/** What a Cordis fiber looks like to the recorder: its id, its name and its state. */
interface FiberLike { readonly uid: number | null; readonly name: string; readonly state: number }

/** The recent fiber changes, numbered; a request for those after a number waits for the next change when there are none. */
export class GraphRecorder {
  private seq = 0
  private readonly events: GraphEvent[] = []
  private readonly waiting = new Set<() => void>()

  /** The newest event number; 0 before the first. */
  get head(): number {
    return this.seq
  }

  record(event: Omit<GraphEvent, 'seq' | 'at'>, at: number = Date.now()): void {
    this.seq += 1
    this.events.push({ ...event, seq: this.seq, at })
    if (this.events.length > MAX_EVENTS) this.events.shift()
    for (const wake of [...this.waiting]) wake()
  }

  /** Every recorded event after `after`, oldest first. */
  since(after: number): GraphEventsAnswer {
    return { seq: this.seq, events: this.events.filter(event => event.seq > after) }
  }

  /** The events after `after`, as soon as there are some; none when `ms` passes first or `signal` aborts (the browser left). */
  async wait(after: number, ms: number, signal?: AbortSignal): Promise<GraphEventsAnswer> {
    if (this.seq > after || ms <= 0 || signal?.aborted === true) return this.since(after)
    await new Promise<void>((done) => {
      const finish = (): void => {
        clearTimeout(timer)
        this.waiting.delete(finish)
        signal?.removeEventListener('abort', finish)
        done()
      }
      const timer = setTimeout(finish, ms)
      this.waiting.add(finish)
      signal?.addEventListener('abort', finish, { once: true })
    })
    return this.since(after)
  }

  /** Wake every waiting request now (the Host is stopping); each answers with what it has. */
  release(): void {
    for (const wake of [...this.waiting]) wake()
  }
}

/** Record every fiber of `ctx`'s tree changing: created, removed, or moved to another phase. Returns the stop. */
export function recordFibers(ctx: Context, recorder: GraphRecorder): () => void {
  const root = ctx.root
  const offPlugin = root.on('internal/plugin', (fiber: FiberLike) => {
    try {
      recorder.record({ uid: fiber.uid ?? 0, name: clamp(fiber.name), kind: fiber.uid === null ? 'removed' : 'created' })
    } catch {
      // Watching never disturbs the plugin being watched.
    }
  })
  const offStatus = root.on('internal/status', (fiber: FiberLike, before: number) => {
    try {
      recorder.record({ uid: fiber.uid ?? 0, name: clamp(fiber.name), kind: 'status', from: PHASE[before] ?? 'pending', to: PHASE[fiber.state] ?? 'pending' })
    } catch {
      // As above.
    }
  })
  return () => {
    offPlugin()
    offStatus()
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Where a plugin's code is

const MAIN_FILES = ['index.ts', 'index.mts', 'index.js', 'index.mjs', 'src/index.ts', 'src/index.js']
const FILE_ENDINGS = ['', '.ts', '.mts', '.tsx', '.js', '.mjs', '.cjs']

const isFile = (path: string): boolean => {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}
const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The main file of a plugin folder: the manifest's `main` when it names one, else the first index file. */
function mainOfFolder(folder: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(folder, 'plugin.json'), 'utf8')) as { main?: unknown }
    if (typeof manifest.main === 'string' && isFile(join(folder, manifest.main))) return join(folder, manifest.main)
  } catch {
    // No manifest: the index files decide.
  }
  return MAIN_FILES.map(name => join(folder, name)).find(isFile)
}

/** The file a path names: the file itself, the file with an ending, or the main file of the folder. */
function fileOf(path: string): string | undefined {
  if (isDirectory(path)) return mainOfFolder(path)
  return FILE_ENDINGS.map(ending => path + ending).find(isFile)
}

/** The folder of the package a file belongs to: the nearest parent with a package.json, else the file's own folder. */
function packageFolderOf(file: string): string {
  let dir = dirname(file)
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return dirname(file)
    dir = parent
  }
}

/**
 * Find where a Loader entry's code is. In the order the app itself finds it: a folder of the app's `plugins/` named like the row, then a path from the app's
 * folder (`./src/frame.ts`), then a package the app or the frame (for the DSH packages, which the frame's own install carries) can resolve.
 */
export function sourceFinder(appRoot: string): SourceOf {
  const root = (() => {
    try {
      return realpathSync(appRoot)
    } catch {
      return resolve(appRoot)
    }
  })()
  const fromApp = createRequire(join(root, 'package.json'))
  const fromFrame = createRequire(import.meta.url)
  const cache = new Map<string, GraphSource | undefined>()

  const describe = (file: string, folder: string): GraphSource => {
    const real = (() => {
      try {
        return realpathSync(file)
      } catch {
        return file
      }
    })()
    const realFolder = (() => {
      try {
        return realpathSync(folder)
      } catch {
        return folder
      }
    })()
    const inside = relative(root, real)
    const inApp = inside !== '' && !inside.startsWith('..') && !isAbsolute(inside) && !inside.split(sep).includes('node_modules')
    return { file: real, folder: realFolder, ...(inApp ? { inApp: inside.split(sep).join('/') } : {}) }
  }

  const find = (moduleName: string): GraphSource | undefined => {
    if (moduleName.startsWith('file:')) moduleName = moduleName.slice('file:'.length)
    if (isAbsolute(moduleName) || moduleName.startsWith('./') || moduleName.startsWith('../')) {
      const file = fileOf(isAbsolute(moduleName) ? moduleName : resolve(root, moduleName))
      if (file === undefined) return undefined
      const base = isAbsolute(moduleName) ? moduleName : resolve(root, moduleName)
      return describe(file, isDirectory(base) ? base : dirname(file))
    }
    // The app's own plugins/<name>/ (the template's rows name a plugin by its folder).
    const local = join(root, 'plugins', moduleName)
    if (isDirectory(local)) {
      const file = mainOfFolder(local)
      if (file !== undefined) return describe(file, local)
    }
    for (const requireFrom of [fromApp, fromFrame]) {
      try {
        const file = requireFrom.resolve(moduleName)
        return describe(file, packageFolderOf(file))
      } catch {
        // Not resolvable from here; the next place.
      }
    }
    return undefined
  }

  return (moduleName, name) => {
    for (const candidate of [moduleName, name]) {
      if (candidate === null || candidate === '' || candidate === 'root') continue
      if (!cache.has(candidate)) cache.set(candidate, find(candidate))
      const found = cache.get(candidate)
      if (found !== undefined) return found
    }
    return undefined
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// The port the frame's routes use

/** What the routes need: the graph now, and the changes after a number. */
export interface GraphPort {
  read(): GraphView
  events(after: number, signal?: AbortSignal): Promise<GraphEventsAnswer>
}

/** The graph of the Host's context, with its recorder started. `stop` ends the recording and answers every waiting request. */
export function createGraphPort(ctx: Context, appRoot: string): { readonly port: GraphPort; readonly stop: () => void } {
  const recorder = new GraphRecorder()
  const stopRecording = recordFibers(ctx, recorder)
  const sourceOf = sourceFinder(appRoot)
  return {
    port: {
      // The number first: a change while the graph is read is then heard by the next request, not lost.
      read: () => {
        const seq = recorder.head
        return { snapshot: inspectCordisContext(ctx, 'host', sourceOf), seq }
      },
      events: (after, signal) => recorder.wait(after, EVENTS_WAIT_MS, signal),
    },
    stop: () => {
      stopRecording()
      recorder.release()
    },
  }
}
