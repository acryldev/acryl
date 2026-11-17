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
import { installedDesktop } from './desktop-open.js'
import { readSecret } from './secret-input.js'
import { forwardStopSignals, runtimeCommand, runtimeLauncher, targetFor, targetPackageName } from './runtime.js'
import { MANAGED, managedSteps, runtimeInstallStep, runtimePrefix, surfaceFrom } from './managed.js'
import { acquireDesktopInstaller } from './desktop-runtime.js'
import { acquireWebRuntime, fetchReleaseManifest, hasVerifiedWebRuntime, manifestUrl, managedWebRoot, selectWebArtifact, webRuntimeCommand } from './web-runtime.js'

const require = createRequire(import.meta.url)
const selectorVersion = require('./package.json').version
/** The release the prepared runtimes (terminal agent, old Web, desktop installer) come from; it moves only when they are rebuilt (spec 050 D14). */
const runtimeVersion = require('./package.json').acrylRuntime ?? selectorVersion
const args = process.argv.slice(2)

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

async function confirmDownload() {
  if (!stdin.isTTY || !stderr.isTTY) return false
  const prompt = createInterface({ input: stdin, output: stderr })
  try {
    return (await prompt.question('ACRYL Web will download a verified matching runtime. Continue? [y/N] ')).trim().toLowerCase() === 'y'
  } finally { prompt.close() }
}

function openInstaller(path) {
  const opener = process.platform === 'darwin' ? ['open', [path]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', path]]
    : ['xdg-open', [path]]
  const child = spawn(...opener, { stdio: 'ignore' })
  child.once('error', () => {})
}

async function runDesktop(desktopArgs) {
  const noOpen = desktopArgs.includes('--no-open')
  const result = await acquireDesktopInstaller({
    version: runtimeVersion,
    ...(noOpen ? {} : { open: openInstaller }),
  })
  console.log(`ACRYL desktop installer ${result.version}: ${result.path}`)
  if (noOpen) console.log('use --no-open to download without launching')
}

async function runWeb(webArgs) {
  const yes = webArgs.includes('--yes') || webArgs.includes('-y')
  const forwarded = webArgs.filter(arg => arg !== '--yes' && arg !== '-y')
  const target = targetFor({ platform: process.platform, arch: process.arch })
  const root = join(managedWebRoot(), runtimeVersion, target)
  const manifest = await fetchReleaseManifest(manifestUrl(runtimeVersion))
  const artifact = selectWebArtifact(manifest, { version: runtimeVersion, target })
  const cached = hasVerifiedWebRuntime(root, { version: runtimeVersion, target, sha256: artifact.sha256 })
  if (!cached && !yes && !(await confirmDownload())) {
    throw new Error('Web runtime acquisition requires confirmation. Re-run with: acryl web --yes')
  }
  const result = await acquireWebRuntime({ root: managedWebRoot(), version: runtimeVersion, target, manifest })
  run(webRuntimeCommand(result.root, forwarded))
}

/** The launcher (spec 050), bundled into this package as one file at pack time (apps/acryl-launcher-tui/scripts/bundle.mjs). */
const LAUNCHER = fileURLToPath(new URL('./launcher.js', import.meta.url))

/** ACRYL's own folder (the list of apps lives here) and the visible folder new apps are suggested in (spec 050 D8). HOME moves both, which is how tests isolate. */
const ACRYL_HOME = join(homedir(), '.acryl')
const APPS_FOLDER = join(homedir(), 'ACRYL')

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

/** `acryl` or `acryl --tui` in a terminal: the ACRYL app screen; what the person chose then runs exactly as if they had typed it. */
async function openLauncher() {
  const { runLauncher } = await loadLauncher()
  const chosen = await runLauncher({ home: ACRYL_HOME, appsFolder: APPS_FOLDER })
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

/** `acryl --gui`: open the installed ACRYL desktop app; when none is installed, fetch the installer for this version and open that. */
async function openDesktop() {
  const installed = installedDesktop({ platform: process.platform, env: process.env, home: homedir(), exists: existsSync })
  if (installed === undefined) {
    console.log('ACRYL desktop is not installed on this machine yet: fetching the installer.')
    return runDesktop([])
  }
  const child = spawn(installed.command, installed.args, { stdio: 'ignore', detached: true })
  child.once('error', cause => { console.error(`acryl: could not open ${installed.command}: ${cause.message}`); process.exitCode = 1 })
  child.unref()
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

/** `acryl ade [--web | --gui | --tui]`: ACRYL ADE, kept in ~/.acryl/ade, made and installed on first use. */
async function openAde(adeArgs) {
  const chosen = surfaceFrom(adeArgs)
  if (chosen.error) throw new Error(chosen.error)
  if (chosen.surface === 'tui') return openTerminalAgent(chosen.rest)
  mkdirSync(ACRYL_HOME, { recursive: true })
  process.exitCode = await runSteps(managedSteps(MANAGED.ade, chosen.surface, { home: ACRYL_HOME, context: context() }), await appEnvironment())
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
} else if (args[0] === 'model') {
  runModel(args.slice(1)).catch(fail)
} else if (args[0] === 'apps') {
  runApps(args.slice(1)).catch(fail)
} else if (args[0] === '--gui') {
  openDesktop().catch(fail)
} else if (args[0] === '--tui') {
  if (!stdin.isTTY || !process.stdout.isTTY) fail(new Error('acryl --tui needs a terminal; to open the app window instead run: acryl --gui'))
  else if (!existsSync(LAUNCHER)) fail(new Error('the terminal screen is not part of this install; install acryl from npm'))
  else openLauncher().catch(fail)
} else if (args[0] === 'web' || args[0] === '--web') {
  // `acryl --web` is the third launcher flag beside `--tui` and `--gui`: the same ACRYL screen, served to a browser.
  runWeb(args.slice(1)).catch(cause => {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
} else if (args[0] === 'desktop') {
  runDesktop(args.slice(1)).catch(cause => {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
} else if (args.length === 0 && stdin.isTTY && process.stdout.isTTY && existsSync(LAUNCHER)) {
  openLauncher().catch(cause => {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  })
} else if (args[0] === 'ade' || args[0] === 'code') {
  // `acryl ade` is ACRYL ADE (spec 050 D14): the Blend in the browser, `--gui` in a window, `--tui` the terminal agent. `acryl code` is its earlier name.
  openAde(args.slice(1)).catch(fail)
} else {
  // Any other words (`acryl -p "..."`), or a bare `acryl` with no terminal: the terminal agent, as before.
  openTerminalAgent(args).catch(fail)
}
