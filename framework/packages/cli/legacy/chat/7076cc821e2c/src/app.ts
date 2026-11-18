import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as db from '../plugins/acryl-db-sqlite/src/index.ts'
import * as nodeServer from '../plugins/acryl-node-server/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import { type AppInstance, instance } from '../plugins/instance/index.ts'
import {
  blueprintsIn,
  compose,
  loadManifest,
  type ParameterValue,
} from '../plugins/manifest/index.ts'
import { routes } from './routes.ts'

/** The plugins this app's code provides. `blend.yaml` chooses, orders and configures them. */
export const registry = { 'acryl-router': router, 'acryl-db-sqlite': db, 'acryl-node-server': nodeServer, routes }

const projectRoot = fileURLToPath(new URL('..', import.meta.url))

/** The manifest next to this app's source. */
export const MANIFEST = join(projectRoot, 'blend.yaml')

/** The manifest, resolved. `createApp` and the tests read it the same way. */
export function readManifest(values?: Readonly<Record<string, ParameterValue>>) {
  return loadManifest(MANIFEST, {
    known: Object.keys(registry),
    getBlueprint: blueprintsIn(join(projectRoot, 'blueprints')),
    ...(values ? { values } : {}),
  })
}

export interface App {
  readonly root: Context
  readonly url: string
  stop(): Promise<void>
}

export interface AppOptions {
  readonly values?: Readonly<Record<string, ParameterValue>>
  /** The SQLite file, relative to the app folder; `:memory:` for a database that lives and dies with the process (tests). Default: ${'data/chat.sqlite'}. */
  readonly database?: string
}

/**
 * The app: `instance` first (where it lives, chosen at run time), then the manifest's rows in order. The `db` row opens the database and applies
 * `migrations/`; the one place that names the SQLite provider is this file (`acrylblends check-deps`), so a different provider is a change here.
 */
export async function createApp(chosen: AppInstance, options: AppOptions = {}): Promise<App> {
  const manifest = readManifest(options.values)
  const file = options.database ?? 'data/chat.sqlite'
  const root = new Context()
  const first = root.plugin(instance, chosen)
  await first.await()
  const fibers: Fiber[] = [
    first,
    ...(await compose(root, manifest, registry, {
      db: {
        path: file === ':memory:' || isAbsolute(file) ? file : resolve(projectRoot, file),
        migrations: join(projectRoot, 'migrations'),
      },
      server: { port: chosen.port.start, scan: chosen.port.scan ? 20 : 0 },
    })),
  ]
  return {
    root,
    url: root.nodeServer.url,
    async stop() {
      for (const fiber of [...fibers].reverse()) await fiber.dispose()
    },
  }
}
