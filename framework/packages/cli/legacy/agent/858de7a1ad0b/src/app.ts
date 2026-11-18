import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context, type Fiber } from '@deepseek-ai/cordis'
import * as door from '../plugins/acryl-door/src/index.ts'
import * as nodeServer from '../plugins/acryl-node-server/src/index.ts'
import * as router from '../plugins/acryl-router/src/index.ts'
import * as state from '../plugins/acryl-state/src/index.ts'
import { agent, memory, model, scripted, tools } from '../plugins/agent/index.ts'
import * as panel from '../plugins/agent-panel/index.ts'
import { builder } from '../plugins/builder/index.ts'
import { extensions } from '../plugins/extensions/index.ts'
import { type AppInstance, instance } from '../plugins/instance/index.ts'
import {
  appPluginNames,
  blueprintsIn,
  compose,
  loadAppPlugins,
  loadManifest,
  type ParameterValue,
} from '../plugins/manifest/index.ts'
import { ASSISTANT_PROMPT, type OpenAIConfig, openai } from '../plugins/openai/index.ts'
import { pluginShare } from '../plugins/plugin-share/index.ts'
import { sandboxPlugin } from '../plugins/sandbox/index.ts'
import { save } from '../plugins/save/index.ts'
import { tasks } from '../plugins/tasks/index.ts'
import { FRAME_MOUNT_PREFIX, routes } from './routes.ts'

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
  'plugin-share': pluginShare,
  save,
  sandbox: sandboxPlugin,
  routes,
  'acryl-node-server': nodeServer,
  'agent-panel': panel,
  'acryl-door': door,
}

/** The manifest next to this app's source. */
export const MANIFEST = join(fileURLToPath(new URL('..', import.meta.url)), 'blend.yaml')
/** The app's own plugins (a feature each), which `blend.yaml` mounts by their folder name next to the library copies `registry` imports. */
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

export interface App {
  readonly root: Context
  /** The address the server listens on; empty when the app was made with `listen: false`. */
  readonly url: string
  stop(): Promise<void>
}

/**
 * The development rows, and what each one gives a visitor. Production leaves the agent and the builder out. The extensions row is not left out: it starts again, read-only,
 * the extensions in the app's `plugins/` folder (what the agent built and installed in development, committed with the app), so a deployed app has its own features; nothing
 * can be installed, updated or approved while it runs, and `/ask`, `/extensions*` and `/tasks*` stay unmounted (they need the agent). `ACRYL_PRODUCTION_KEEP=extensions` keeps the
 * live install itself.
 */
const DEVELOPMENT_ROWS: Record<string, string> = {
  agent: 'POST /ask runs the agent, which spends the model key and calls its tools',
  builder: 'the agent can write plugin source into plugins/',
  'plugin-share': 'a plugin pulled from a release runs in this process',
  extensions:
    'a plugin installed live runs in this process, and POST /extensions/approve decides installs',
}

/** The only tools the production Assistant's agent may call: look at the page and act on it. */
const ASSISTANT_TOOLS = ['door_look', 'door_act']

/** The most tokens one answer of the Assistant's model may use: with the step budget, what one visitor's question can cost at most. */
const ASSISTANT_MAX_TOKENS = 1024

/** Model calls per visitor question: look, open a page, look, filter, look and answer is six, with room for one wrong turn. */
const ASSISTANT_STEPS = 10

/** What the Assistant says while the app has no model: the scripted one cannot use the page. */
export const ASSISTANT_NO_MODEL =
  "This assistant is not set up yet: the app's owner has not chosen a model for it."

/**
 * The app's rows in the manifest's order, composed into `ctx`: the app's own server calls this from `createApp`, and the generated frame layer mounts it
 * as one row, so the frame runs the app exactly as the app's own server does (same rows, same order, same config). `host: true` leaves the server and the
 * door to the frame host, which mounts its own.
 */
export async function composeInto(
  ctx: Context,
  chosen: AppInstance,
  options: {
    values?: Readonly<Record<string, ParameterValue>>
    model?: OpenAIConfig
    listen?: boolean
    host?: boolean
  } = {},
): Promise<Fiber[]> {
  const read = readManifest(options.values)
  // Rows left out: the server (and so the door, which needs it) when the app is reached in process; the door in production and with ACRYL_DOOR=off (one process at a time
  // serves a folder's door, so the tests that start several apps set it).
  const listen = options.listen !== false && options.host !== true
  const leaveOut = new Set<string>()
  let extensionsReadOnly = false
  // In the frame host the infrastructure rows are the host's own (its server, its web-server port, its router, the app instance, the door): the app
  // contributes only the plugins that are its own.
  if (!listen || options.host === true) leaveOut.add('acryl-node-server').add('acryl-door')
  if (options.host === true)
    for (const row of [
      'instance',
      'acryl-router',
      'acryl-web-server',
      'acryl-page',
      'manifest',
      'save',
    ])
      leaveOut.add(row)
  // The Assistant (production, ACRYL_ASSISTANT=on): the agent panel docked for the app's visitors. Its agent keeps only the page tools and the door only the page,
  // so it uses the app for a visitor (opens pages, filters, fills in forms) and cannot change the app, its code or its secrets. Not in the frame host.
  const assistant =
    process.env.NODE_ENV === 'production' &&
    process.env.ACRYL_ASSISTANT === 'on' &&
    process.env.ACRYL_DOOR !== 'off' &&
    listen
  if (!assistant && (process.env.NODE_ENV === 'production' || process.env.ACRYL_DOOR === 'off'))
    leaveOut.add('acryl-door')
  // Production: the rows that give a visitor power over the running app or the owner's model key are left out too. The agent (`POST /ask` spends the model key and runs tools),
  // the builder and the extensions (live plugin install runs code in this process, and `POST /extensions/approve` decides it) are development tools. `ACRYL_PRODUCTION_KEEP`
  // names the ones to keep (`agent,builder,extensions`); each one kept is announced at start, because none of them is behind a login.
  if (process.env.NODE_ENV === 'production') {
    const keep = new Set(
      (process.env.ACRYL_PRODUCTION_KEEP ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    )
    for (const name of keep)
      if (!(name in DEVELOPMENT_ROWS))
        console.warn(
          `WARNING: ACRYL_PRODUCTION_KEEP names "${name}", which is not one of ${Object.keys(DEVELOPMENT_ROWS).join(', ')}`,
        )
    for (const [row, danger] of Object.entries(DEVELOPMENT_ROWS)) {
      if (keep.has(row))
        console.warn(
          `WARNING: the "${row}" row runs in production because ACRYL_PRODUCTION_KEEP names it: ${danger}. Nothing here is behind a login; put the app behind your own.`,
        )
      else if (row === 'extensions') extensionsReadOnly = true
      else if (!(assistant && row === 'agent')) leaveOut.add(row)
    }
  }
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
  // The Assistant's model is told it helps a visitor through the page alone, and each answer is capped, unless the app's model configuration says otherwise.
  const modelConfig =
    options.model && assistant
      ? {
          ...options.model,
          system: options.model.system ?? ASSISTANT_PROMPT,
          maxTokens: options.model.maxTokens ?? ASSISTANT_MAX_TOKENS,
        }
      : options.model
  if (assistant && !options.model)
    console.warn(
      `WARNING: the Assistant has no model, so it answers every visitor "${ASSISTANT_NO_MODEL}" Set the app's model (ACRYLBLENDS_MODEL_URL and ACRYLBLENDS_MODEL, or model.json in the app's home).`,
    )
  // The rows that name one of the app's own plugin folders (a feature: plugins/<name>/ and its row) rather than a registry import. Each one that runs
  // is imported here; all of them, off or on, belong to their row, so the extensions row never starts them a second time.
  const ownRows = [
    ...new Set(read.plugins.map((row) => row.use).filter((use) => !Object.hasOwn(registry, use))),
  ]
  const ownPlugins = await loadAppPlugins(
    PLUGINS_DIR,
    ownRows.filter((use) => manifest.plugins.some((row) => row.use === use && !row.disabled)),
  )
  const fibers: Fiber[] = [
    // The `model` row mounts the scripted model, or the real one when a model is configured.
    ...(await compose(
      ctx,
      manifest,
      { ...registry, ...ownPlugins, ...(modelConfig ? { model: openai } : {}) },
      {
        ...(modelConfig ? { model: { ...modelConfig } } : {}),
        // Runtime values the manifest cannot hold: the manifest's own digest (every task records it), and who may install.
        tasks: { manifest: `sha256:${manifest.digest}` },
        // The `approval` parameter in blend.yaml (the extensions row) turns this source into one that asks.
        extensions: {
          ...(extensionsReadOnly ? { readOnly: true } : {}),
          sources: [
            { dir: extensionsDir, trust: 'install' },
            ...(legacy ? [{ dir: legacyDir, trust: 'install' as const }] : []),
          ],
          rows: ownRows,
        },
        builder: { dir: extensionsDir },
        'plugin-share': { dir: extensionsDir },
        ...(assistant
          ? {
              // Every answer comes right after a look, so it says what the visitor's page shows now.
              agent: { tools: ASSISTANT_TOOLS, steps: ASSISTANT_STEPS, answerAfter: 'door_look' },
              'acryl-door': { pageOnly: true },
              'agent-panel': { assistant: true },
              // The visitor reaches the agent through the panel only: no /ask, /tasks or /extensions routes.
              routes: { agentRoutes: false },
            }
          : {}),
        // The rows that serve routes of their own mount them under the app's prefix, as makeApp does. On the app's own server that prefix is the root (the
        // row's default); the frame host serves the app at FRAME_MOUNT_PREFIX, and its own `/api` routes would answer for a row left at the root. The
        // app's own routes row takes the same prefix for its mount and for the absolute URLs its pages write, so the page and its assets answer at `/app`.
        ...(options.host === true
          ? {
              'agent-panel': { mount: FRAME_MOUNT_PREFIX },
              'driver-pty': { mount: FRAME_MOUNT_PREFIX },
              feedback: { mount: FRAME_MOUNT_PREFIX },
              routes: { prefix: FRAME_MOUNT_PREFIX, ...(assistant ? { agentRoutes: false } : {}) },
            }
          : {}),
        // The frame host runs the server itself and its app instance carries no port; only the app's own server configures one.
        ...(options.host === true
          ? {}
          : {
              server: {
                port: chosen.port.start,
                scan: chosen.port.scan ? 20 : 0,
                hostname: chosen.host,
              },
            }),
      },
    )),
  ]
  // Without a model the scripted one would echo the visitor's words back: it says in one sentence that the Assistant is not set up.
  if (assistant && !options.model)
    scripted(ctx.get('model') as Parameters<typeof scripted>[0])?.teach(() => ({
      text: ASSISTANT_NO_MODEL,
    }))
  return fibers
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
