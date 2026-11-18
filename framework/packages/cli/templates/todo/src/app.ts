import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as door from '../plugins/acryl-door/src/index.ts'
import * as nodeServer from '../plugins/acryl-node-server/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import * as state from '../plugins/acryl-state/src/index.ts'
import { type AppInstance, instance } from '../plugins/instance/index.ts'
import {
  appPluginNames,
  blueprintsIn,
  compose,
  loadAppPlugins,
  loadManifest,
  type ParameterValue,
} from '../plugins/manifest/index.ts'
import { doorEnabled } from './door.ts'
import * as todo from './todo.ts'
import { FRAME_MOUNT_PREFIX } from './todo.ts'

/** The plugins this app's code provides. `blend.yaml` chooses, orders and configures them, and adds the app's own plugins from `plugins/` by name. */
export const registry = {
  'acryl-router': router,
  'acryl-state': state,
  todo,
  'acryl-node-server': nodeServer,
  'acryl-door': door,
}

export const APP_NAME = '__APP_NAME__'

/** The manifest next to this app's source. */
export const MANIFEST = join(fileURLToPath(new URL('..', import.meta.url)), 'blend.yaml')
/** The app's plugins: the library copies `registry` imports, and the app's own plugins (a feature each), which `blend.yaml` mounts by their folder name. */
const PLUGINS_DIR = join(fileURLToPath(new URL('..', import.meta.url)), 'plugins')

/**
 * The app's manifest, resolved. A Blend finds its Blueprint in `blueprints/<id>.yaml`; an app that is itself a Blueprint never looks.
 * `createApp` and the tests read it the same way.
 */
export function readManifest(values?: Readonly<Record<string, ParameterValue>>) {
  return loadManifest(MANIFEST, {
    known: [...Object.keys(registry), ...appPluginNames(PLUGINS_DIR)],
    getBlueprint: blueprintsIn(join(fileURLToPath(new URL('..', import.meta.url)), 'blueprints')),
    ...(values ? { values } : {}),
  })
}

/** The manifest without some rows: without its server (and so its door) the app is reached in process, through `root.router.request`; the door is also left out in production. */
function without<M extends { plugins: readonly { use: string }[] }>(
  manifest: M,
  ...uses: string[]
): M {
  return {
    ...manifest,
    plugins: manifest.plugins.map((row) =>
      uses.includes(row.use) ? { ...row, disabled: true } : row,
    ),
  }
}

export interface App {
  readonly root: Context
  /** The address the server listens on; empty when the app was made with `listen: false`. */
  readonly url: string
  stop(): Promise<void>
}

export interface AppOptions {
  readonly values?: Readonly<Record<string, ParameterValue>>
  /** The path the app is mounted at; absent on its own server, where it keeps `/todo`, and {@link FRAME_MOUNT_PREFIX} in the frame. */
  readonly prefix?: string
  /** Start the HTTP server (default). Tests pass `false` and call `app.root.router.request(path)`: it needs no port, so it also runs where a sandbox forbids listening. */
  readonly listen?: boolean
}

/** The rows the frame host provides: the app contributes only the plugins that are its own. */
const HOST_ROWS = [
  'instance',
  'acryl-router',
  'acryl-node-server',
  'acryl-web-server',
  'acryl-page',
  'manifest',
  'save',
  'acryl-door',
]

/**
 * The app's rows, composed into `ctx`: the app's own server calls this from `createApp`, and the generated frame layer mounts it as one row, so the frame
 * runs the app exactly as the app's own server does (same rows, same order, same config). `host: true` leaves the infrastructure rows to the frame host,
 * which is where the door lives too, and mounts the app at {@link FRAME_MOUNT_PREFIX}.
 */
export async function composeInto(
  ctx: Context,
  chosen: AppInstance,
  options: AppOptions & { readonly host?: boolean } = {},
): Promise<Fiber[]> {
  const read = readManifest(options.values)
  const own = options.host !== true && options.listen !== false
  // The frame host mounts the app under its own prefix; the app's own server keeps the app's old path.
  const prefix = options.prefix ?? (options.host === true ? FRAME_MOUNT_PREFIX : undefined)
  const leaveOut = new Set<string>(options.host === true ? HOST_ROWS : [])
  // The server, and the door that needs it, are not mounted when the app is reached in process or inside the frame host.
  if (!own) leaveOut.add('acryl-node-server').add('acryl-door')
  if (!doorEnabled()) leaveOut.add('acryl-door')
  const manifest = without(read, ...leaveOut)
  // The rows that name one of the app's own plugin folders (a feature: plugins/<name>/ and its row) rather than a registry import; each one that runs is imported here.
  const ownRows = [
    ...new Set(read.plugins.map((row) => row.use).filter((use) => !Object.hasOwn(registry, use))),
  ]
  const ownPlugins = await loadAppPlugins(
    PLUGINS_DIR,
    ownRows.filter((use) => manifest.plugins.some((row) => row.use === use && !row.disabled)),
  )
  return compose(
    ctx,
    manifest,
    { ...registry, ...ownPlugins },
    {
      // Runtime values the manifest cannot hold: where the list is kept (in the app's home) and, in the frame, the prefix the app answers at.
      todo: {
        file: join(chosen.home, 'todo.json'),
        ...(prefix === undefined ? {} : { prefix }),
      },
      // Only the app's own server listens; the frame host owns the server and its port.
      ...(own ? { server: { port: chosen.port.start, scan: chosen.port.scan ? 20 : 0 } } : {}),
    },
  )
}

/** The app: `instance` first (where it lives, chosen at run time), then the manifest's rows in order. */
export async function createApp(chosen: AppInstance, options: AppOptions = {}): Promise<App> {
  const root = new Context()
  const first = root.plugin(instance, chosen)
  await first.await()
  const fibers: Fiber[] = [first, ...(await composeInto(root, chosen, options))]
  return {
    root,
    url: options.listen === false ? '' : root.nodeServer.url,
    async stop() {
      for (const fiber of [...fibers].reverse()) await fiber.dispose()
    },
  }
}
