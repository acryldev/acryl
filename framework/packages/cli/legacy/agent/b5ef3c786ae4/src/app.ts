import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as door from '../plugins/acryl-door/src/index.ts'
import * as nodeServer from '../plugins/acryl-node-server/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import * as state from '../plugins/acryl-state/src/index.ts'
import { agent, memory, model, tools } from '../plugins/agent/index.ts'
import { builder } from '../plugins/builder/index.ts'
import { extensions } from '../plugins/extensions/index.ts'
import { type AppInstance, instance } from '../plugins/instance/index.ts'
import {
  blueprintsIn,
  compose,
  loadManifest,
  type ParameterValue,
} from '../plugins/manifest/index.ts'
import { type OpenAIConfig, openai } from '../plugins/openai/index.ts'
import { sandboxPlugin } from '../plugins/sandbox/index.ts'
import { save } from '../plugins/save/index.ts'
import { tasks } from '../plugins/tasks/index.ts'
import { routes } from './routes.ts'

/** The plugins this app's code provides. `blend.yaml` chooses, orders and configures them. */
export const registry = {
  tasks,
  model,
  tools,
  memory,
  agent,
  'acryl-router': router,
  'acryl-state': state,
  extensions,
  builder,
  save,
  sandbox: sandboxPlugin,
  routes,
  'acryl-node-server': nodeServer,
  'acryl-door': door,
}

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
  /** The address the server listens on; empty when the app was made with `listen: false`. */
  readonly url: string
  stop(): Promise<void>
}

/**
 * The app: `instance` first (where it lives, chosen at run time), then the manifest's rows in order. The app's `plugins/`
 * folder is trusted to install at start, and is where the builder writes.
 */
export async function createApp(
  chosen: AppInstance,
  options: {
    values?: Readonly<Record<string, ParameterValue>>
    /** A real model (any OpenAI-compatible API) in place of the offline scripted one. */
    model?: OpenAIConfig
    /** Start the HTTP server (default). Tests pass `false` and call `app.root.router.request(path)`: it needs no port, so it also runs where a sandbox forbids listening. */
    listen?: boolean
  } = {},
): Promise<App> {
  const read = readManifest(options.values)
  // Rows left out: the server (and so the door, which needs it) when the app is reached in process; the door in production and with ACRYL_DOOR=off (one process at a time
  // serves a folder's door, so the tests that start several apps set it).
  const listen = options.listen !== false
  const leaveOut = new Set<string>()
  if (!listen) leaveOut.add('acryl-node-server').add('acryl-door')
  if (process.env.NODE_ENV === 'production' || process.env.ACRYL_DOOR === 'off')
    leaveOut.add('acryl-door')
  const manifest = {
    ...read,
    plugins: read.plugins.map((row) => (leaveOut.has(row.use) ? { ...row, disabled: true } : row)),
  }
  const extensionsDir = join(chosen.root, 'plugins')
  // One release of grace: an app made before 0.7.8 kept what the agent wrote in `extensions/`. It is still installed, with a warning.
  const legacyDir = join(chosen.root, 'extensions')
  const legacy = existsSync(legacyDir)
  if (legacy)
    console.warn(
      'warning: extensions/ is the old folder for plugins the agent writes; move them to plugins/ ("git mv extensions/<name> plugins/<name>"). extensions/ is read for this release only.',
    )
  const root = new Context()
  const first = root.plugin(instance, chosen)
  await first.await()
  const fibers: Fiber[] = [
    first,
    // The `model` row mounts the scripted model, or the real one when a model is configured.
    ...(await compose(root, manifest, options.model ? { ...registry, model: openai } : registry, {
      ...(options.model ? { model: { ...options.model } } : {}),
      // Runtime values the manifest cannot hold: the manifest's own digest (every task records it), and who may install.
      tasks: { manifest: `sha256:${manifest.digest}` },
      // The `approval` parameter in blend.yaml (the extensions row) turns this source into one that asks.
      extensions: {
        sources: [
          { dir: extensionsDir, trust: 'install' },
          ...(legacy ? [{ dir: legacyDir, trust: 'install' as const }] : []),
        ],
      },
      builder: { dir: extensionsDir },
      server: { port: chosen.port.start, scan: chosen.port.scan ? 20 : 0, hostname: chosen.host },
    })),
  ]
  return {
    root,
    url: listen ? root.nodeServer.url : '',
    async stop() {
      for (const fiber of [...fibers].reverse()) await fiber.dispose()
    },
  }
}
