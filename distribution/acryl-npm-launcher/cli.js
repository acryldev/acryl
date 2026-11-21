// The selector itself, loaded by bin.js once the Node version is known to be new enough.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stderr } from 'node:process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createdAppName, forwardCommand, launcherCommand } from './forward.js'
import { readSecret } from './secret-input.js'
import { forwardStopSignals, runtimeCommand, runtimeLauncher, targetFor, targetPackageName } from './runtime.js'
import { MANAGED, managedSteps, openFolderEnv, runtimeInstallStep, runtimePrefix, surfaceFrom } from './managed.js'
import { acquireDesktopInstaller } from './desktop-runtime.js'
import { firstAddress, installedControlCenter, opensBrowser } from './control-center.js'
import { DESKTOP_MOVED, HELP } from './help.js'
import { routeArgs } from './route.js'

const require = createRequire(import.meta.url)
const selectorVersion = require('./package.json').version
/** The release the prepared runtimes (terminal agent, old Web, desktop installer) come from; it moves only when they are rebuilt (spec 050 D14). */
const runtimeVersion = require('./package.json').acrylRuntime ?? selectorVersion
const args = process.argv.slice(2)
// `npx --package=<spec> acryl` leaves the package list in the environment, and every `npm exec <package>` acryl starts (create-acrylblends, acrylblends)
// would read it and run its argument as a command instead ("create-acrylblends@latest: command not found"). It names this package, never theirs.
delete process.env.npm_config_package

function run({ command, args: commandArgs }) {
  const child = spawn(command, commandArgs, { stdio: 'inherit' })
  const stopForwarding = forwardStopSignals(child)
  child.once('error', cause => {
    stopForwarding()
    console.error(`acryl: ${cause.message}`)
    process.exitCode = 1
  })
  child.once('exit', code => {
    stopForwarding()
    process.exitCode = code ?? 1
  })
}

function openPath(path) {
  const opener = process.platform === 'darwin' ? ['open', [path]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', path]]
    : ['xdg-open', [path]]
  const child = spawn(...opener, { stdio: 'ignore' })
  child.once('error', () => {})
}

async function runDesktop(desktopArgs) {
  if (!desktopArgs.includes('--installer')) {
    console.log(DESKTOP_MOVED)
    return
  }
  const noOpen = desktopArgs.includes('--no-open')
  const result = await acquireDesktopInstaller({
    version: runtimeVersion,
    ...(noOpen ? {} : { open: openPath }),
  })
  console.log(`ACRYL desktop installer ${result.version}: ${result.path}`)
  if (noOpen) console.log("downloaded only (--no-open)")
}

/** The launcher (spec 050), bundled into this package as one file at pack time (tui/bundle.mjs). */
const LAUNCHER = fileURLToPath(new URL('./launcher.js', import.meta.url))

/** ACRYL's own folder: the list of apps, the keys, the Blends acryl keeps (new apps are suggested beside it, in ~/ACRYL). HOME moves it, which is how tests isolate. */
const ACRYL_HOME = join(homedir(), '.acryl')

const loadLauncher = () => import(pathToFileURL(LAUNCHER).href)

/** After `acryl new`, put the new app in the list (spec 050 D6). The list is a convenience: a failure says so and never fails the command. */
async function listCreatedApp(commandArgs, cwd) {
  const name = createdAppName(commandArgs)
  // The app is made before it starts, and a person stops a running app with Ctrl-C, so the exit code says nothing: the folder does.
  if (name === undefined || !existsSync(LAUNCHER) || !existsSync(join(resolve(cwd, name), 'blend.yaml'))) return
  try {
    const { addApp } = await loadLauncher()
    addApp(ACRYL_HOME, { path: resolve(cwd, name) })
  } catch (cause) {
    console.error(`acryl: ${name} was made but could not be added to the list of apps: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
}

/** `acryl` or `acryl --tui` in a terminal: ACRYL Control Center; a command it hands back (the terminal agent) then runs exactly as if it had been typed. */
async function openLauncher() {
  const { runLauncher } = await loadLauncher()
  const chosen = await runLauncher({ home: ACRYL_HOME, version: selectorVersion })
  if (!chosen) return
  const target = launcherCommand(await desktopWhenListed(chosen.command), {
    env: process.env, platform: process.platform, cwd: process.cwd(), execPath: process.execPath, bin: fileURLToPath(new URL('./bin.js', import.meta.url)), exists: existsSync,
  })
  if (target.error) throw new Error(target.error)
  // A new app's folder may not exist yet (the suggested ~/ACRYL on a first run): make it, so the command has somewhere to run.
  if (chosen.command.ensureCwd === true) mkdirSync(target.cwd, { recursive: true })
  console.log(`\n$ ${chosen.line}\n`)
  const child = spawn(target.command, target.args, { stdio: 'inherit', cwd: target.cwd, shell: target.shell === true, env: await appEnvironment() })
  const stopForwarding = forwardStopSignals(child)
  child.once('error', cause => { stopForwarding(); console.error(`acryl: ${cause.message}`); process.exitCode = 1 })
  child.once('exit', code => {
    stopForwarding()
    process.exitCode = code ?? 1
    void listCreatedApp(chosen.command.args, target.cwd)
  })
}

/**
 * "Open an app" runs `npm run dev`, which serves the app to a browser. An app the list records as a Desktop app (made from the desktop or web screen with that
 * surface) is opened the way that screen opens it: `npm run desktop`, which starts the same app in its own window.
 */
async function desktopWhenListed(command) {
  if (command.program !== 'npm' || command.args.join(' ') !== 'run dev') return command
  try {
    const { readApps } = await loadLauncher()
    const folder = resolve(process.cwd(), command.cwd)
    const app = readApps(ACRYL_HOME).find(entry => resolve(entry.path) === folder)
    return app?.surface === 'desktop' ? { ...command, args: ['run', 'desktop'] } : command
  } catch { return command } // the list is a convenience: without it the app starts in the browser as before
}

/** The environment an app the `acryl` command starts gets: this one, plus the stored model key when the environment names none (acryl model). */
async function appEnvironment() {
  if (!existsSync(LAUNCHER)) return process.env
  try {
    const { modelEnv } = await loadLauncher()
    return { ...process.env, ...modelEnv(ACRYL_HOME, process.env) }
  } catch { return process.env }
}

/** `acryl model [set deepseek | set orcarouter | clear [provider]]`: the machine's model key, asked for without echo and never in an argument. */
async function runModel(modelArgs) {
  if (!existsSync(LAUNCHER)) throw new Error('the launcher is not part of this install; install acryl from npm')
  const { runModelCommand } = await loadLauncher()
  process.exitCode = await runModelCommand(modelArgs, {
    home: ACRYL_HOME, env: process.env, out: line => console.log(line), err: line => console.error(line), readSecret,
  })
}

/** `acryl apps ...`: the list the launcher shows, as commands. */
async function runApps(appsArgs) {
  if (!existsSync(LAUNCHER)) throw new Error('the launcher is not part of this install; install acryl from npm')
  const { runAppsCommand } = await loadLauncher()
  process.exitCode = runAppsCommand(appsArgs, { home: ACRYL_HOME, cwd: process.cwd(), out: line => console.log(line), err: line => console.error(line) })
}

const context = () => ({ env: process.env, platform: process.platform, cwd: process.cwd(), execPath: process.execPath, exists: existsSync })

/** Run each step in turn, its label first; the exit code of the first that fails, else 0. */
async function runSteps(steps, env) {
  for (const step of steps) {
    console.log(`acryl: ${step.label}`)
    const code = await new Promise(done => {
      const child = spawn(step.command, step.args, { stdio: 'inherit', cwd: step.cwd, shell: step.shell === true, env })
      const stopForwarding = forwardStopSignals(child)
      child.once('error', cause => { stopForwarding(); console.error(`acryl: ${cause.message}`); done(1) })
      child.once('exit', exitCode => { stopForwarding(); done(exitCode ?? 1) })
    })
    if (code !== 0) return code
  }
  return 0
}

/**
 * Run the steps; the last one (the app starting in the browser) also has its output read, and the first address it prints, with its token, opens in the
 * browser. Its output still reaches this terminal as it comes.
 */
async function runStepsOpening(steps, env) {
  const code = await runSteps(steps.slice(0, -1), env)
  if (code !== 0) return code
  const step = steps.at(-1)
  console.log(`acryl: ${step.label}`)
  return new Promise(done => {
    const child = spawn(step.command, step.args, { stdio: ['inherit', 'pipe', 'pipe'], cwd: step.cwd, shell: step.shell === true, env })
    const stopForwarding = forwardStopSignals(child)
    const open = opensBrowser(process.env)
    let seen = false
    const read = to => chunk => {
      to.write(chunk)
      const address = seen ? undefined : firstAddress(chunk.toString('utf8'))
      if (!address) return
      seen = true
      console.log(`acryl: it is up at ${address}${open ? ', opening your browser' : ''}`)
      if (open) openPath(address)
    }
    child.stdout.on('data', read(process.stdout))
    child.stderr.on('data', read(process.stderr))
    child.once('error', cause => { stopForwarding(); console.error(`acryl: ${cause.message}`); done(1) })
    child.once('exit', exitCode => { stopForwarding(); done(exitCode ?? 1) })
  })
}

/**
 * `acryl --gui` / `acryl --web`: ACRYL Control Center. In a window it is the installed app when there is one; otherwise, and always in the browser, the Blend
 * acryl.control-center kept in ~/.acryl/control-center, made and installed on first use, brought up to date with --update.
 */
async function openLauncherBlend({ surface, update }) {
  const installed = surface === 'gui' && !update ? installedControlCenter({ platform: process.platform, env: process.env }) : undefined
  if (installed) {
    console.log(`acryl: opening ${MANAGED.launcher.title} (${installed.at})`)
    const child = spawn(installed.command, installed.args, { stdio: 'ignore', detached: true, windowsHide: true })
    child.once('error', cause => fail(new Error(`${MANAGED.launcher.title} did not open: ${cause.message}`)))
    child.unref()
    return
  }
  mkdirSync(ACRYL_HOME, { recursive: true })
  const steps = managedSteps(MANAGED.launcher, surface, { home: ACRYL_HOME, context: context(), update })
  process.exitCode = surface === 'web' ? await runStepsOpening(steps, await appEnvironment()) : await runSteps(steps, await appEnvironment())
}

/** `acryl store [words]`: the Blends `acryl make <name> --from <id>` can make, one per line (id, name, category, Official or Community), the words narrowing it. */
async function runStore(words) {
  if (!existsSync(LAUNCHER)) throw new Error('the store is not part of this install; install acryl from npm')
  const { readBlends } = await loadLauncher()
  const query = words.join(' ').toLowerCase()
  const blends = (await readBlends()).filter(blend => query === '' || `${blend.id} ${blend.name} ${blend.category} ${blend.description}`.toLowerCase().includes(query))
  for (const blend of blends) console.log([blend.source ?? blend.id, blend.name, blend.category || '-', blend.origin === 'official' ? 'Official' : 'Community'].join('\t'))
  if (blends.length === 0) console.error(query === '' ? 'acryl store: the store is empty' : `acryl store: no Blend matches "${query}"`)
}

/** `acryl ade [--web | --gui | --tui]`: ACRYL ADE, kept in ~/.acryl/ade, made and installed on first use. */
async function openAde(adeArgs) {
  const chosen = surfaceFrom(adeArgs)
  if (chosen.error) throw new Error(chosen.error)
  if (chosen.surface === 'tui') return openTerminalAgent(chosen.rest)
  mkdirSync(ACRYL_HOME, { recursive: true })
  const env = { ...(await appEnvironment()), ...openFolderEnv(process.cwd(), { userHome: homedir(), acrylHome: ACRYL_HOME }) }
  process.exitCode = await runSteps(managedSteps(MANAGED.ade, chosen.surface, { home: ACRYL_HOME, context: context() }), env)
}

/** The terminal runtime: beside the selector (an install that still carries it), else the one acryl installed in ~/.acryl/runtime. */
function terminalRuntime() {
  try { return runtimeLauncher({ require, version: runtimeVersion }) } catch { /* not beside the selector: look in ~/.acryl */ }
  return runtimeLauncher({ require: createRequire(join(runtimePrefix(ACRYL_HOME, runtimeVersion), 'package.json')), version: runtimeVersion })
}

async function confirmRuntimeDownload() {
  if (!stdin.isTTY || !stderr.isTTY) return false
  const prompt = createInterface({ input: stdin, output: stderr })
  try {
    return (await prompt.question(`The ACRYL terminal agent ${runtimeVersion} is a one-time download of about 450 MB into ${join(ACRYL_HOME, 'runtime')}. Continue? [y/N] `)).trim().toLowerCase() === 'y'
  } finally { prompt.close() }
}

/** The ACRYL terminal coding agent with these words; downloaded on first use, after the person says yes. */
async function openTerminalAgent(agentArgs) {
  let launcher
  try { launcher = terminalRuntime() } catch {
    if (!(await confirmRuntimeDownload())) throw new Error('the terminal agent is not downloaded yet; run acryl ade --tui in a terminal and answer y')
    mkdirSync(ACRYL_HOME, { recursive: true })
    const packageName = targetPackageName(targetFor({ platform: process.platform, arch: process.arch }))
    const code = await runSteps([runtimeInstallStep({ home: ACRYL_HOME, version: runtimeVersion, packageName, context: context() })], process.env)
    if (code !== 0) throw new Error(`the download of ${packageName}@${runtimeVersion} failed (exit ${code})`)
    launcher = terminalRuntime()
  }
  run(runtimeCommand(launcher, agentArgs))
}

const fail = cause => {
  console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
  process.exitCode = 1
}

// The short commands (acryl new, plugin, blends, update) run the part that owns them (forward.js).
const forwarded = forwardCommand(args, { env: process.env, platform: process.platform, cwd: process.cwd(), execPath: process.execPath, exists: existsSync })
if (forwarded?.error) {
  console.error(`acryl: ${forwarded.error}`)
  process.exitCode = 2
} else if (forwarded) {
  appEnvironment().then(env => {
    const child = spawn(forwarded.command, forwarded.args, { stdio: 'inherit', cwd: forwarded.cwd, shell: forwarded.shell === true, env })
    child.once('error', cause => { console.error(`acryl: ${cause.message}`); process.exitCode = 1 })
    child.once('exit', code => {
      process.exitCode = code ?? 1
      void listCreatedApp(args, forwarded.cwd ?? process.cwd())
    })
  }, fail)
} else {
  const route = routeArgs(args, { terminal: Boolean(stdin.isTTY && process.stdout.isTTY) })
  if (route.kind === 'error') { console.error(`acryl: ${route.message}`); process.exitCode = 2 }
  // The selector's own version: it is what `npx acryl` installed, and it answers without the terminal agent.
  else if (route.kind === 'version') console.log(selectorVersion)
  else if (route.kind === 'help') process.stdout.write(HELP)
  else if (route.kind === 'tui') {
    if (!existsSync(LAUNCHER)) fail(new Error('the terminal Control Center is not part of this install; install acryl from npm'))
    else openLauncher().catch(fail)
  } else if (route.kind === 'control-center') openLauncherBlend(route).catch(fail)
  else if (route.kind === 'model') runModel(route.args).catch(fail)
  else if (route.kind === 'apps') runApps(route.args).catch(fail)
  else if (route.kind === 'store') runStore(route.args).catch(fail)
  else if (route.kind === 'desktop') runDesktop(route.args).catch(fail)
  // `acryl ade` is ACRYL ADE (spec 050 D14): the Blend in the browser, `--gui` in a window, `--tui` the terminal agent. `acryl code` is its earlier name.
  else if (route.kind === 'ade') openAde(route.args).catch(fail)
  // Any other words (`acryl -p "..."`): the terminal agent, as before.
  else openTerminalAgent(route.args).catch(fail)
}
