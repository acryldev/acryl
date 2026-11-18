import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
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
export const registry = { 'acryl-router': router, 'acryl-node-server': nodeServer, routes }

/** The manifest next to this app's source. */
export const MANIFEST = join(fileURLToPath(new URL('..', import.meta.url)), 'blend.yaml')

/**
 * The app's manifest, resolved. A Blend finds its Blueprint in `blueprints/<id>.yaml`; an app that is itself a Blueprint never looks.
 * `createApp` and the tests read it the same way.
 */
export function readManifest(values?: Readonly<Record<string, ParameterValue>>) {
  return loadManifest(MANIFEST, {
    known: Object.keys(registry),
    getBlueprint: blueprintsIn(join(fileURLToPath(new URL('..', import.meta.url)), 'blueprints')),
    ...(values ? { values } : {}),
  })
}

export interface App {
  readonly root: Context
  readonly url: string
  stop(): Promise<void>
}

/** The app: `instance` first (where it lives, chosen at run time), then the manifest's rows in order. */
export async function createApp(
  chosen: AppInstance,
  options: { values?: Readonly<Record<string, ParameterValue>> } = {},
): Promise<App> {
  const manifest = readManifest(options.values)
  const root = new Context()
  const first = root.plugin(instance, chosen)
  await first.await()
  const fibers: Fiber[] = [
    first,
    ...(await compose(root, manifest, registry, {
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
