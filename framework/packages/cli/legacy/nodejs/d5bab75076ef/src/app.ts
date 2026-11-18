import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as door from '../plugins/acryl-door/src/index.ts'
import * as nodeServer from '../plugins/acryl-node-server/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import { extensions } from '../plugins/extensions/index.ts'
import { type AppInstance, instance } from '../plugins/instance/index.ts'
import {
  blueprintsIn,
  compose,
  loadManifest,
  type ParameterValue,
} from '../plugins/manifest/index.ts'
import { doorEnabled } from './door.ts'
import { routes } from './routes.ts'

/** The plugins this app's code provides. `blend.yaml` chooses, orders and configures them. */
export const registry = {
  'acryl-router': router,
  'acryl-node-server': nodeServer,
  'acryl-door': door,
  extensions,
  routes,
}

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** The manifest next to this app's source. */
export const MANIFEST = join(projectRoot, 'blend.yaml')

/**
 * The app's manifest, resolved. A Blend finds its Blueprint in `blueprints/<id>.yaml`; an app that is itself a Blueprint never looks.
 * `createApp` and the tests read it the same way.
 */
export function readManifest(values?: Readonly<Record<string, ParameterValue>>) {
  return loadManifest(MANIFEST, {
    known: Object.keys(registry),
    getBlueprint: blueprintsIn(join(projectRoot, 'blueprints')),
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

/** The app: `instance` first (where it lives, chosen at run time), then the manifest's rows in order. */
export async function createApp(
  chosen: AppInstance,
  options: { values?: Readonly<Record<string, ParameterValue>>; listen?: boolean } = {},
): Promise<App> {
  const read = readManifest(options.values)
  const listen = options.listen
  // Rows left out: the server (and the door, which needs it) when the app is reached in process; the door when it is switched off; live plugin installs in production.
  const leaveOut = new Set<string>()
  if (listen === false) leaveOut.add('acryl-node-server').add('acryl-door')
  if (!doorEnabled()) leaveOut.add('acryl-door')
  if (process.env.NODE_ENV === 'production') leaveOut.add('extensions')
  const manifest = without(read, ...leaveOut)
  const root = new Context()
  const first = root.plugin(instance, chosen)
  await first.await()
  const fibers: Fiber[] = [
    first,
    ...(await compose(root, manifest, registry, {
      // What is installed while the app runs lives in plugins/, next to the plugins copied from the library (plugins/library.json lists those, so they are not installed twice).
      extensions: { sources: [{ dir: join(projectRoot, 'plugins'), trust: 'install' }] },
      server: { port: chosen.port.start, scan: chosen.port.scan ? 20 : 0 },
    })),
  ]
  return {
    root,
    url: listen === false ? '' : root.nodeServer.url,
    async stop() {
      for (const fiber of [...fibers].reverse()) await fiber.dispose()
    },
  }
}
