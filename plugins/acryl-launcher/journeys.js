// The things a person can do from the launcher (spec 050), written once for every face. A journey is a short list of steps and one command: the
// faces draw the steps, the session (session.js) walks them, and the command it ends with is the same data that is shown and that runs, so the
// command a person learns from the last screen is exactly what ran. Nothing here touches the disk or the network: a step that needs a list
// (the apps here, the registry's Blends, an app's plugins) asks the context it is given (node-context.js in a terminal, a fake in tests).

/** The starters `acryl new` makes (create-acrylblends TEMPLATES, same order and words). */
export const STARTERS = Object.freeze([
  { value: 'blank', label: 'Blank', description: 'the router, a server and one route: the smallest app' },
  { value: 'nodejs', label: 'Node.js', description: 'a web app with a page and a client component' },
  { value: 'notes', label: 'Notes', description: 'a multi-user notes app (sign-up, log-in, sessions)' },
  { value: 'chat', label: 'Chat', description: 'a chat app that streams an answer' },
  { value: 'todo', label: 'To-do', description: 'a to-do list on the router and state' },
  { value: 'agent', label: 'Agent', description: 'the blank app with an agent that builds plugins into the running app' },
])

/** The rule create-acrylblends applies to a new app's name. */
export const APP_NAME = /^[a-z][a-z0-9-]*$/u

/** Why `name` cannot be a new app's name (in the folder the `where` answer names, else here), or undefined when it can. */
export function appNameProblem(name, context, answers = {}) {
  if (!APP_NAME.test(name)) return 'lower case letters, digits and dashes, starting with a letter'
  const path = answers.where && answers.where !== '.' ? `${answers.where}/${name}` : name
  if (context.exists(path)) return `there is already a folder named ${name} ${answers.where && answers.where !== '.' ? `in ${answers.where}` : 'here'}`
  return undefined
}

/** Why `folder` cannot hold new apps, or undefined when it can (it need not exist yet: the launcher makes it). */
export function whereProblem(folder) {
  if (folder.startsWith('~')) return 'type the whole folder path (the default shown is one), not one starting with ~'
  return folder === '' ? 'say which folder the app goes in' : undefined
}

/** A name for an app made from a registry id: its last part (`acrylblends.notes-desktop` gives `notes-desktop`). */
export const nameFromId = id => id.split('.').at(-1).replace(/[^a-z0-9-]/gu, '-').replace(/^[^a-z]+/u, '') || 'my-app'

const choose = (id, label, options, more = {}) => ({ kind: 'choose', id, label, options, ...more })
const text = (id, label, more = {}) => ({ kind: 'text', id, label, ...more })
const chooseApp = choose('app', 'Which app', context => context.listApps(), {
  empty: 'No app here. Create one first, or start the launcher in the folder that holds your apps.',
})

/**
 * A command: the program (`acryl` is the command the person typed, `npm` for an app's own scripts), its arguments, and the folder it runs in
 * (`cwd`, relative to where the launcher started; '.' when there).
 */
const acryl = (args, cwd = '.') => ({ program: 'acryl', args, cwd })

export const JOURNEYS = Object.freeze([
  {
    id: 'create',
    title: 'Create an app',
    summary: 'a new app, installed and started',
    steps: [
      text('where', 'Which folder should it live in', {
        initial: (_answers, context) => context.defaultAppsFolder?.() ?? '.',
        hint: 'a new folder is made if needed; Enter keeps the suggestion',
        check: whereProblem,
      }),
      text('name', 'Name of the app', { initial: () => 'my-app', check: appNameProblem }),
      choose('starter', 'Start from', () => STARTERS),
    ],
    command: answers => ({ ...acryl(['new', answers.name, answers.starter], answers.where), ensureCwd: answers.where !== '.' }),
  },
  {
    id: 'blend',
    title: 'Install a Blend',
    summary: 'a ready app from the registry',
    steps: [
      choose('blend', 'Which Blend', context => context.listBlends(), { empty: 'The registry could not be read. Check the network and try again.' }),
      text('where', 'Which folder should it live in', {
        initial: (_answers, context) => context.defaultAppsFolder?.() ?? '.',
        hint: 'a new folder is made if needed; Enter keeps the suggestion',
        check: whereProblem,
      }),
      text('name', 'Name of the app', { initial: answers => nameFromId(answers.blend), check: appNameProblem }),
    ],
    command: answers => ({ ...acryl(['new', answers.name, '--from', answers.blend], answers.where), ensureCwd: answers.where !== '.' }),
  },
  {
    id: 'open',
    title: 'Open an app',
    summary: 'start one of your apps and open it',
    steps: [chooseApp],
    command: answers => ({ program: 'npm', args: ['run', 'dev'], cwd: answers.app }),
  },
  {
    id: 'pull',
    title: 'Pull a plugin',
    summary: 'add someone\'s plugin to an app',
    steps: [
      chooseApp,
      text('source', 'Plugin to pull', {
        hint: 'github:owner/repo@version, or an npm package name',
        check: source => (source.trim() === '' ? 'say where the plugin is, e.g. github:someone/pomodoro@0.1.0' : undefined),
      }),
    ],
    command: answers => acryl(['plugin', 'pull', answers.source.trim()], answers.app),
  },
  {
    id: 'share',
    title: 'Share a plugin',
    summary: 'publish a plugin so others can pull it',
    steps: [
      chooseApp,
      choose('plugin', 'Which plugin', (context, answers) => context.listPlugins(answers.app), { empty: 'This app has no plugins of its own yet.' }),
    ],
    command: answers => acryl(['plugin', 'publish', answers.plugin], answers.app),
  },
  {
    id: 'update',
    title: 'Update an app',
    summary: 'the newest frame and library plugins',
    steps: [chooseApp],
    command: answers => acryl(['update'], answers.app),
  },
  {
    id: 'add',
    title: 'Add an app folder',
    summary: 'put an app you already have in the list',
    steps: [
      text('folder', 'The app\'s folder', {
        hint: 'a folder with a blend.yaml in it',
        check: (folder, context) => (folder.trim() === '' ? 'say which folder' : context.exists(`${folder}/blend.yaml`) ? undefined : `no blend.yaml in ${folder}: this is not an app folder`),
      }),
    ],
    command: answers => acryl(['apps', 'add', answers.folder]),
  },
  {
    id: 'model',
    title: 'Set up a model',
    summary: 'your DeepSeek key, once, for every app',
    steps: [],
    command: () => acryl(['model', 'set', 'deepseek']),
  },
  {
    id: 'check',
    title: 'Check this machine',
    summary: 'Node, npm, git, an agent, a free port',
    steps: [],
    command: () => acryl(['blends', 'preflight']),
  },
  {
    id: 'code',
    title: 'Open ACRYL Code',
    summary: 'the coding IDE, in this terminal',
    steps: [],
    command: () => acryl(['code']),
  },
])

/** The journey with this id; throws for an unknown one, which is a bug in the face that asked. */
export function journey(id) {
  const found = JOURNEYS.find(entry => entry.id === id)
  if (!found) throw new Error(`acryl-launcher: no journey "${id}"`)
  return found
}

const quote = arg => (/^[\w@%+=:,./-]+$/u.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`)

/** The one line a person types to do the same next time: `cd shop && acryl plugin pull github:a/b`. */
export function commandLine(command) {
  const line = [command.program, ...command.args].map(quote).join(' ')
  return command.cwd === '.' ? line : `cd ${quote(command.cwd)} && ${line}`
}
