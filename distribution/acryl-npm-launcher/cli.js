// The selector itself, loaded by bin.js once the Node version is known to be new enough.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { stdin, stderr } from 'node:process'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { forwardCommand, launcherCommand } from './forward.js'
import { forwardStopSignals, runtimeCommand, runtimeLauncher, targetFor } from './runtime.js'
import { acquireDesktopInstaller } from './desktop-runtime.js'
import { acquireWebRuntime, fetchReleaseManifest, hasVerifiedWebRuntime, manifestUrl, managedWebRoot, selectWebArtifact, webRuntimeCommand } from './web-runtime.js'

const require = createRequire(import.meta.url)
const selectorVersion = require('./package.json').version
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
    version: selectorVersion,
    ...(noOpen ? {} : { open: openInstaller }),
  })
  console.log(`ACRYL desktop installer ${result.version}: ${result.path}`)
  if (noOpen) console.log('use --no-open to download without launching')
}

async function runWeb(webArgs) {
  const yes = webArgs.includes('--yes') || webArgs.includes('-y')
  const forwarded = webArgs.filter(arg => arg !== '--yes' && arg !== '-y')
  const target = targetFor({ platform: process.platform, arch: process.arch })
  const root = join(managedWebRoot(), selectorVersion, target)
  let launcher
  try { launcher = runtimeLauncher({ require, platform: process.platform, arch: process.arch }) } catch (cause) {
    throw new Error(`matching CLI runtime is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`)
  }
  // The CLI runtime is resolved first so a partial/broken selector never downloads Web.
  void launcher
  const manifest = await fetchReleaseManifest(manifestUrl(selectorVersion))
  const artifact = selectWebArtifact(manifest, { version: selectorVersion, target })
  const cached = hasVerifiedWebRuntime(root, { version: selectorVersion, target, sha256: artifact.sha256 })
  if (!cached && !yes && !(await confirmDownload())) {
    throw new Error('Web runtime acquisition requires confirmation. Re-run with: acryl web --yes')
  }
  const result = await acquireWebRuntime({ root: managedWebRoot(), version: selectorVersion, target, manifest })
  run(webRuntimeCommand(result.root, forwarded))
}

/** The launcher (spec 050), bundled into this package as one file at pack time (apps/acryl-launcher-tui/scripts/bundle.mjs). */
const LAUNCHER = fileURLToPath(new URL('./launcher.js', import.meta.url))

/** A bare `acryl` in a terminal: every step offered; what the person chose then runs exactly as if they had typed it. */
async function openLauncher() {
  const { runLauncher } = await import(pathToFileURL(LAUNCHER).href)
  const chosen = await runLauncher()
  if (!chosen) return
  const target = launcherCommand(chosen.command, {
    env: process.env, platform: process.platform, cwd: process.cwd(), execPath: process.execPath, bin: fileURLToPath(new URL('./bin.js', import.meta.url)), exists: existsSync,
  })
  if (target.error) throw new Error(target.error)
  console.log(`\n$ ${chosen.line}\n`)
  const child = spawn(target.command, target.args, { stdio: 'inherit', cwd: target.cwd, shell: target.shell === true })
  const stopForwarding = forwardStopSignals(child)
  child.once('error', cause => { stopForwarding(); console.error(`acryl: ${cause.message}`); process.exitCode = 1 })
  child.once('exit', code => { stopForwarding(); process.exitCode = code ?? 1 })
}

// The short commands (acryl new, plugin, blends, update) run the part that owns them (forward.js).
const forwarded = forwardCommand(args, { env: process.env, platform: process.platform, cwd: process.cwd(), execPath: process.execPath, exists: existsSync })
if (forwarded?.error) {
  console.error(`acryl: ${forwarded.error}`)
  process.exitCode = 2
} else if (forwarded) {
  const child = spawn(forwarded.command, forwarded.args, { stdio: 'inherit', cwd: forwarded.cwd, shell: forwarded.shell === true })
  child.once('error', cause => { console.error(`acryl: ${cause.message}`); process.exitCode = 1 })
  child.once('exit', code => { process.exitCode = code ?? 1 })
} else if (args[0] === 'web') {
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
} else {
  // `acryl code` is ACRYL Code, the IDE (spec 050 Q1); with no terminal, or no launcher, a bare `acryl` keeps opening it as before.
  const ideArgs = args[0] === 'code' ? args.slice(1) : args
  try { run(runtimeCommand(runtimeLauncher(), ideArgs)) } catch (cause) {
    console.error(`acryl: ${cause instanceof Error ? cause.message : String(cause)}`)
    process.exitCode = 1
  }
}
