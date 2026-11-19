/**
 * The launcher as tools an agent can call (spec 050 D11, T013): the same operations the screen offers, through the same `LauncherService`, so what an agent
 * does and what a person clicks cannot drift apart. They go into ACRYL's tool registry (`acrylTools`): the DSH chat has them, and agents ACRYL does not run
 * (Claude Code, Codex) reach them through `acryl-agent-control`'s loopback gateway, where their names are on the default allowlist. Nothing outward happens
 * here: a publish only produces the plan the person reads, and the person's click on the screen is the yes.
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineAcrylTool, type AcrylToolDefinition } from 'acryl-control'
import type { AppView } from './contract.ts'
import type { LauncherService } from './service.ts'

export const LAUNCHER_TOOLS = [
  'acryl_launcher_help',
  'acryl_launcher_apps',
  'acryl_launcher_blends',
  'acryl_launcher_new_app',
  'acryl_launcher_start_app',
  'acryl_launcher_stop_app',
  'acryl_launcher_plugins',
  'acryl_launcher_pull_plugin',
  'acryl_launcher_publish_plan',
] as const

export const LAUNCHER_HELP = `The ACRYL launcher is the first screen of ACRYL (Web and Desktop). Where things are:
- My apps (left nav): every app made with ACRYL on this machine, as cards with a state (running, stopped), a surface (Web = served at an address, Desktop = a window of its own) and a Blend name. Select a card for its panel: Start or Stop, Open, Remove from list, its folder, and, while it runs, its Plugins.
- + New app (top): asks where, a name, a starter (Blank, Node.js, Notes, Chat, To-do, Agent) and a surface; it runs "acryl new <name> <starter>" and installs the app (about a minute), then starts it.
- Blends store (left nav): the public registry of ready-made apps (acrylblends.github.io/blends); "Make an app" on a card runs "acryl new <name> --from <id>".
- Add a folder (top): puts an app you already have in the list ("acryl apps add <folder>").
- Plugins of a running app (its card's panel): "Pull a plugin" takes github:owner/repo@version; "Share plugin" shows exactly what would be published and sends nothing until the person clicks "Yes, publish". An agent never publishes: it can only prepare the plan.
- Running, Made by agents, Updates (not built yet), WebBoxes.ai (deploy is coming), Health (Node, npm and the model key), Settings (the look: ACRYL ADE or acryl.dev).
- Assistant (left nav): this panel. ACRYL ADE (the agentic development environment) opens from its card on My apps.
Tools: acryl_launcher_apps lists the apps; acryl_launcher_new_app, _start_app and _stop_app change them; acryl_launcher_blends searches the registry; acryl_launcher_plugins and _pull_plugin work on a running app; acryl_launcher_publish_plan prepares a publish for the person to confirm.`

/** An app as an agent reads it: the address without its launch token (the token is a secret of the person's session). */
const describeApp = (app: AppView): Record<string, unknown> => ({
  id: app.id, name: app.name, folder: app.path, blend: app.blend, surface: app.surface, state: app.state, madeBy: app.madeBy,
  ...app.address === undefined ? {} : { address: app.address.replace(/\?.*$/u, '') },
  ...app.failure === undefined ? {} : { failure: app.failure },
})

const text = (value: string) => [{ type: 'text' as const, text: value }]
/** Every tool's value is the text an agent reads (JSON where it is data): a typed object output would need a schema per tool and gains nothing here. */
const asText = (value: unknown): string => JSON.stringify(value, null, 2)
const STRING = { type: 'string' } as const

/** The tool definitions over one service; separate from registering them so a test can call each. */
export function launcherTools(service: LauncherService): readonly AcrylToolDefinition[] {
  return [
    defineAcrylTool({
      name: 'acryl_launcher_help',
      description: 'How to use the ACRYL launcher and where to find what: its screens, buttons and the other launcher tools. Call it first when asked about the launcher.',
      parameters: {},
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: () => LAUNCHER_HELP,
    }),
    defineAcrylTool({
      name: 'acryl_launcher_apps',
      description: 'The apps in the launcher\'s list: id, folder, Blend, surface (web or desktop), state (running, starting, stopped, missing) and address when running; and the app being made, if any.',
      parameters: {},
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: () => {
        const state = service.state()
        return asText({ apps: state.apps.map(describeApp), making: state.job, newAppsGoIn: state.appsFolder })
      },
    }),
    defineAcrylTool({
      name: 'acryl_launcher_blends',
      description: 'Blends in the public registry that an app can be made from (id, name, category, description). Give a query to narrow it; at most 25 are returned.',
      parameters: { query: { type: 'string', description: 'words to look for in the name, id, category or description' } },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: async (args) => {
        const needle = (args.query ?? '').trim().toLowerCase()
        const all = await service.blends()
        const found = all.filter(blend => needle === '' || `${blend.name} ${blend.id} ${blend.category} ${blend.description}`.toLowerCase().includes(needle))
        return asText({ total: found.length, blends: found.slice(0, 25).map(blend => ({ id: blend.id, name: blend.name, category: blend.category, description: blend.description })) })
      },
    }),
    defineAcrylTool({
      name: 'acryl_launcher_new_app',
      description: 'Make a new app, as the launcher\'s + New app does: from a starter (blank, nodejs, notes, chat, todo, agent) or from a registry Blend id (acrylblends_launcher_blends), as a web or desktop app. It installs the app (about a minute) and starts it; watch with acryl_launcher_apps.',
      parameters: {
        name: { type: 'string', required: true, description: 'lower case letters, digits and dashes' },
        starter: { type: 'string', description: 'a starter; default blank. Not with blend.' },
        blend: { type: 'string', description: 'a registry Blend id such as acrylblends.csv-explorer. Not with starter.' },
        surface: { type: 'string', description: 'web (default) or desktop' },
        where: { type: 'string', description: 'the folder to make it in; default the launcher\'s apps folder' },
      },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: (args) => {
        const surface = args.surface === 'desktop' ? 'desktop' : args.surface === undefined || args.surface === 'web' ? 'web' : undefined
        if (surface === undefined) throw new Error('surface must be web or desktop')
        const where = args.where ?? service.state().appsFolder
        service.create({ where, name: args.name, surface, ...args.blend === undefined ? { starter: args.starter ?? 'blank' } : { blend: args.blend, ...args.starter === undefined ? {} : { starter: args.starter } } })
        return asText({ making: args.name, where, note: 'It is being made and installed (about a minute), then started. Call acryl_launcher_apps to watch.' })
      },
    }),
    defineAcrylTool({
      name: 'acryl_launcher_start_app',
      description: 'Start an app from the launcher\'s list (a desktop app opens its own window); installs its dependencies first if it has none.',
      parameters: { app: { type: 'string', required: true, description: 'the app\'s id from acryl_launcher_apps' } },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: (args) => { service.start(args.app); return asText({ starting: args.app }) },
    }),
    defineAcrylTool({
      name: 'acryl_launcher_stop_app',
      description: 'Stop an app the launcher started.',
      parameters: { app: { type: 'string', required: true, description: 'the app\'s id from acryl_launcher_apps' } },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: (args) => { service.stop(args.app); return asText({ stopped: args.app }) },
    }),
    defineAcrylTool({
      name: 'acryl_launcher_plugins',
      description: 'The plugins of a RUNNING app: the ones made in it (shareable) and the ones pulled from a registry, with their source.',
      parameters: { app: { type: 'string', required: true, description: 'the app\'s id' } },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: async (args) => asText({ plugins: await service.plugins(args.app) }),
    }),
    defineAcrylTool({
      name: 'acryl_launcher_pull_plugin',
      description: 'Pull a plugin from a registry source into a RUNNING app, as the launcher\'s Pull a plugin does. The source is github:owner/repo@version.',
      parameters: {
        app: { type: 'string', required: true, description: 'the app\'s id' },
        source: { type: 'string', required: true, description: 'github:owner/repo@version' },
      },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: async (args) => asText(await service.pullPlugin(args.app, args.source)),
    }),
    defineAcrylTool({
      name: 'acryl_launcher_publish_plan',
      description: 'Prepare publishing a plugin made in a RUNNING app: what would be sent (account, repository, version, license, files) and the line a friend pulls it with. Sends NOTHING: the person presses Share plugin on the app\'s card in the launcher and says yes.',
      parameters: {
        app: { type: 'string', required: true, description: 'the app\'s id' },
        plugin: { type: 'string', required: true, description: 'a plugin made in the app' },
        owner: { type: 'string', description: 'the GitHub account that would own the repository; default the signed-in one' },
      },
      output: { schema: STRING, render: (_args, value: string) => text(value) },
      execute: async (args) => asText({ plan: await service.publishPlan({ id: args.app, plugin: args.plugin, ...args.owner === undefined ? {} : { owner: args.owner } }), nextStep: 'Nothing was sent. Tell the person to press Share plugin on the app\'s card and confirm.' }),
    }),
  ]
}

/** Register the tools in the registry; the disposer removes them. @returns disposer. */
export function registerLauncherTools(ctx: Context, service: LauncherService): () => void {
  const disposers = launcherTools(service).map(definition => ctx.acrylTools.register(definition))
  return () => { for (const dispose of disposers.reverse()) dispose() }
}
