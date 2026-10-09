#!/usr/bin/env node
/**
 * The packaged-app proof that an agent can extend ACRYL while it runs: boot a PACKAGED Desktop (a macOS .app, a Linux .deb install, a Windows install - no dev server, no
 * source checkout, the bundled Node and pnpm) in a throwaway home, and drive it through the same tools the agent has, over the tool gateway: verify a plugin the "agent"
 * wrote, install it, call the tool it added, rewrite and update it, call it again (the new behaviour must answer, with no restart), remove it, and see it gone.
 *
 * It needs no model. `scripts/verify-profile-boot.mjs` proves the same cycle on the assembled profile from source; this proves it survives packaging (asar, the bundled
 * package manager, Electron as Node, the per-OS profile and paths).
 *
 * Usage: node scripts/verify-packaged-self-extension.mjs <packaged-executable> [--arg <flag>]...   (Linux under a virtual display passes --arg --no-sandbox)
 *
 * Isolation: the app runs against a throwaway root (`scripts/lib/isolated-run.mjs`) and the real ACRYL and DSH homes are checked unchanged afterwards.
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertRealHomesUntouched, isolatedEnvironment, snapshotRealHomes } from '../../../scripts/lib/isolated-run.mjs'
import { osHomeDirectory } from '../../../scripts/lib/instance-module.mjs'

const args = process.argv.slice(2)
const executable = args[0] === undefined ? undefined : resolve(args[0])
const appArgs = []
for (let index = 1; index < args.length; index += 1) if (args[index] === '--arg' && args[index + 1] !== undefined) appArgs.push(args[++index])
if (executable === undefined || !existsSync(executable)) {
  console.error('usage: node scripts/verify-packaged-self-extension.mjs <packaged-executable> [--arg <flag>]...')
  process.exit(2)
}

const BOOT_TIMEOUT_MS = 180_000
/** One tool call. An install runs the app's own package manager, which can take a while on a cold machine, but never this long without something being wrong. */
const CALL_TIMEOUT_MS = 150_000
const example = fileURLToPath(new URL('../../../plugins/acryl-extension-context/example-plugins/packages/tool-basic/', import.meta.url))
const sleep = ms => new Promise(done => setTimeout(done, ms))

const iso = isolatedEnvironment({ label: 'selfext' })
const before = snapshotRealHomes(osHomeDirectory())
// An online tool gateway for this run only, with approvals off and the authored tool allowed through it: a profile patch layer in the throwaway engine home.
const profileDir = join(iso.home, '.dsh', 'profiles', 'desktop')
mkdirSync(profileDir, { recursive: true })
writeFileSync(join(profileDir, 'cordis.patch.yml'), [
  '- id: acryl-agent-control',
  '  config:',
  '    online: true',
  '    approval: none',
  '    tools:',
  '      expose: [acryl_verify_plugin, acryl_install_plugin, acryl_list_plugins, acryl_remove_plugin, authored_probe]',
  '',
].join('\n'))

const child = spawn(executable, appArgs, { env: iso.env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
let exited = false
child.once('exit', () => { exited = true })

/** Stop the app and everything it started. */
async function stop() {
  if (exited) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else {
    child.kill('SIGTERM')
    for (let waited = 0; waited < 10 && !exited; waited += 1) await sleep(500)
    if (!exited) child.kill('SIGKILL')
  }
}

function findPort(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = findPort(path)
      if (found !== undefined) return found
    } else if (/\.(log|jsonl)$/u.test(entry.name)) {
      const match = readFileSync(path, 'utf8').match(/127\.0\.0\.1:(\d{4,5})/u)
      if (match?.[1] !== undefined) return match[1]
    }
  }
  return undefined
}

let failure
const steps = []
try {
  const secretFiles = [join(iso.home, 'agent-control-secret'), join(iso.home, '.dsh', 'agent-control-secret')]
  let secret
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (secret === undefined && Date.now() < deadline && !exited) {
    await sleep(1000)
    const file = secretFiles.find(existsSync)
    if (file !== undefined) secret = readFileSync(file, 'utf8').trim()
  }
  if (secret === undefined) throw new Error(`the packaged app never mounted the tool gateway (${exited ? 'it exited' : 'timed out'})`)
  let port
  while (port === undefined && Date.now() < deadline && !exited) { port = findPort(iso.root); if (port === undefined) await sleep(1000) }
  if (port === undefined) throw new Error('no web port in the packaged app logs')
  const origin = `http://127.0.0.1:${port}`
  const call = async (name, toolArguments) => {
    const response = await fetch(`${origin}/api/acryl-agent-control/online/tools`, {
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      body: JSON.stringify({ name, arguments: toolArguments }),
    })
    return response.json()
  }
  const expectOk = (label, result) => {
    if (result.ok !== true || result.isError === true) throw new Error(`${label} failed: ${JSON.stringify(result).slice(0, 600)}`)
    steps.push(label)
    return String(result.text)
  }
  const expectText = (label, result, text) => {
    const body = expectOk(label, result)
    if (!body.includes(text)) throw new Error(`${label} did not answer ${JSON.stringify(text)}: ${body.slice(0, 400)}`)
  }

  const authored = join(iso.root, 'authored-plugin')
  cpSync(example, authored, { recursive: true })
  const write = (version) => {
    const manifest = JSON.parse(readFileSync(join(example, 'package.json'), 'utf8'))
    writeFileSync(join(authored, 'package.json'), JSON.stringify({ ...manifest, name: 'acryl-authored-probe', version: `1.0.${version}` }, null, 2))
    writeFileSync(join(authored, 'cordis.patch.yml'), readFileSync(join(example, 'cordis.patch.yml'), 'utf8').replaceAll('acryl-example-tool', 'acryl-authored-probe').replaceAll('example-tool', 'authored-probe'))
    writeFileSync(join(authored, 'index.js'), readFileSync(join(example, 'index.js'), 'utf8')
      .replace("'acryl-example-tool'", "'acryl-authored-probe'")
      .replace("name: 'example_echo'", "name: 'authored_probe'")
      .replace('return args.message.toUpperCase()', `return 'probe v${version}: ' + args.message.toUpperCase()`))
  }

  write(1)
  expectOk('verify the plugin the agent wrote', await call('acryl_verify_plugin', { path: authored }))
  const installed = expectOk('install it', await call('acryl_install_plugin', { path: authored }))
  if (!/"status":\s*"active"/u.test(installed)) throw new Error(`install did not report the plugin active: ${installed.slice(0, 400)}`)
  expectText('call the tool it added (live, no restart)', await call('authored_probe', { message: 'hi' }), 'probe v1: HI')
  expectText('list it', await call('acryl_list_plugins', {}), 'acryl-authored-probe')
  write(2)
  expectOk('update it from the rewritten source', await call('acryl_install_plugin', { path: authored }))
  expectText('call the updated tool (new behaviour, no restart)', await call('authored_probe', { message: 'hi' }), 'probe v2: HI')
  expectOk('remove it', await call('acryl_remove_plugin', { package: 'acryl-authored-probe' }))
  const gone = await call('authored_probe', { message: 'hi' })
  if (gone.ok === true && gone.isError !== true) throw new Error(`the removed tool still answered: ${JSON.stringify(gone).slice(0, 300)}`)
  steps.push('the removed tool is gone')
} catch (error) {
  failure = error
} finally {
  await stop()
}

try { assertRealHomesUntouched(before, 'packaged self-extension') } catch (error) { failure ??= error }
if (failure !== undefined) {
  const describeError = error => (error instanceof Error ? `${error.name}: ${error.message}${error.cause === undefined ? '' : ` (cause: ${String(error.cause)})`}` : String(error))
  console.error(`verify-packaged-self-extension: FAILED after ${steps.length} step(s) (${steps.join(' > ')}): ${describeError(failure)}`)
  console.error(`--- app output (tail) ---\n${output.slice(-2000)}`)
  // The app's own log files say what the install did; print the tail of each.
  const logs = []
  const collect = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) collect(path)
      else if (/\.(log|jsonl)$/u.test(entry.name)) logs.push(path)
    }
  }
  try { collect(iso.root) } catch { /* the folder can already be partly gone */ }
  for (const path of logs.slice(0, 6)) console.error(`--- ${path.replace(iso.root, '<throwaway>')} (tail) ---\n${readFileSync(path, 'utf8').slice(-1500)}`)
  iso.dispose()
  process.exit(1)
}
iso.dispose()
console.log(`verify-packaged-self-extension: OK on ${process.platform}-${process.arch} (${steps.join(' > ')})`)
