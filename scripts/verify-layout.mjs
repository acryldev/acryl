import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const fail = message => { throw new Error(`verify-layout: ${message}`) }

const workspace = readJson('package.json')
const pnpmWorkspace = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8')
const npmrc = readFileSync(resolve(root, '.npmrc'), 'utf8')
const upstream = readJson('upstream.json')
const plugin = readJson('acryl-desktop/package.json')
const canvas = readJson('acryl-development-canvas/package.json')
const control = readJson('acryl-control/package.json')
const tui = readJson('acryl-tui/package.json')
const web = readJson('acryl-web/package.json')
const fabric = readJson('dsh-community-fabric/package.json')
const market = readJson('dsh-community-market/package.json')
const upstreamPackage = readJson('deepseek-harness/package.json')

if (!workspace.packageManager?.match(/^pnpm@11\.\d+\.\d+$/)) {
  fail('the product workspace must pin pnpm@11.x.x (patch updates permitted)')
}
if (workspace.workspaces !== undefined) fail('workspace membership belongs only in pnpm-workspace.yaml')
if (!npmrc.includes('node-linker=isolated\n')) fail('the product workspace must use the documented PNPM isolated linker')
if (!npmrc.includes('TUI owns its independent React 19 graph.')) {
  fail('the PNPM linker policy must record the separate React peer graphs')
}
if (pnpmWorkspace !== `nodeLinker: isolated

packages:
  - acryl-control
  - acryl-harness-runtime
  - acryl-npm-launcher
  - acryl-tui
  - acryl-web
  - acryl-desktop
  - acryl-development-canvas
  - dsh-community-fabric
  - dsh-community-market
  - '!deepseek-harness/**'

allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  electron: true
  electron-winstaller: false
  esbuild: true
  koffi: true
  node-pty: true
  protobufjs: false

overrides:
  koffi: 3.1.5

# Published DSH client packages declare React types in generated public APIs but
# omit the type package from their manifests. Their web surface is React 18;
# acryl-tui separately owns Ink's React 19 types.
packageExtensions:
  '@deepseek-ai/dsh-client-ui-primitives@0.1.1-rc.2':
    dependencies:
      '@types/react': 18.3.31
  '@deepseek-ai/dsh-client-ui-slots@0.1.1-rc.2':
    dependencies:
      '@types/react': 18.3.31
  'lucide-react@1.34.0':
    dependencies:
      '@types/react': 18.3.31

patchedDependencies:
  '@deepseek-ai/dsh-app-boot@0.1.1-rc.2': patches/dsh-app-boot@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-client-ui-directory-picker-browse@0.1.1-rc.2': patches/dsh-client-ui-directory-picker-browse@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-client-ui-settings-models@0.1.1-rc.2': patches/dsh-client-ui-settings-models@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-client-ui-trajectory@0.1.1-rc.2': patches/dsh-client-ui-trajectory@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-client-ui-workspace@0.1.1-rc.2': patches/dsh-client-ui-workspace@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-llm-deepseek@0.1.1-rc.2': patches/dsh-llm-deepseek@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-sandbox-windows-acl@0.1.1-rc.2': patches/dsh-sandbox-windows-acl@0.1.1-rc.2.patch
  '@deepseek-ai/dsh-web-app@0.1.1-rc.2': patches/dsh-web-app@0.1.1-rc.2.patch
  '@earendil-works/pi-tui@0.84.2': patches/@earendil-works__pi-tui@0.84.2.patch
  app-builder-lib@26.15.7: patches/app-builder-lib@26.15.7.patch
  dshmarket@1.17.1: patches/dshmarket@1.17.1.patch
  node-pty@1.2.0-beta.15: patches/node-pty@1.2.0-beta.15.patch

supportedArchitectures:
  os:
    - current
  cpu:
    - current
    - x64
    - arm64
`) {
  fail('pnpm-workspace.yaml must define the owned workspace, patch, native-build, and universal macOS policies')
}
for (const [name, manifest] of [
  ['acryl-desktop', plugin],
  ['acryl-development-canvas', canvas],
  ['acryl-control', control],
  ['acryl-harness-runtime', readJson('acryl-harness-runtime/package.json')],
  ['acryl-npm-launcher', readJson('acryl-npm-launcher/package.json')],
  ['acryl-tui', tui],
  ['acryl-web', web],
  ['dsh-community-fabric', fabric],
  ['dsh-community-market', market],
]) {
  if (manifest.packageManager !== undefined) fail(`${name} must inherit the root PNPM release`)
}
if (canvas.name !== 'acryl-development-canvas') fail('the Canvas workspace must own acryl-development-canvas')
if (control.name !== 'acryl-control') fail('the control workspace must own acryl-control')
if (readJson('acryl-npm-launcher/package.json').name !== 'acryl') fail('the npm selector workspace must own the public acryl selector package')
if (tui.name !== 'acryl-tui') fail('the TUI workspace must own acryl-tui')
if (web.name !== 'acryl-web') fail('the Web workspace must own acryl-web')
if (fabric.name !== 'dsh-community-fabric') fail('the Fabric workspace must own dsh-community-fabric')
if (market.name !== 'dsh-community-market') fail('the market workspace must own dsh-community-market')
const claudePath = resolve(root, 'CLAUDE.md')
const claudeStat = lstatSync(claudePath)
// Windows checkouts materialize the symlink as a regular file holding the
// target name; accept both forms so the pointer stays verified on every host.
const claudeTarget = claudeStat.isSymbolicLink()
  ? readlinkSync(claudePath)
  : readFileSync(claudePath, 'utf8').trim()
if (claudeTarget !== 'AGENTS.md') {
  fail('CLAUDE.md must link to the outer repository AGENTS.md')
}
for (const obsoleteFile of [
  'yarn.lock',
  '.yarnrc.yml',
  '.yarn',
  'acryl-desktop/yarn.lock',
  'acryl-desktop/.yarnrc.yml',
  'acryl-development-canvas/yarn.lock',
  'acryl-development-canvas/.yarnrc.yml',
  'acryl-control/yarn.lock',
  'acryl-control/.yarnrc.yml',
  'acryl-harness-runtime/yarn.lock',
  'acryl-harness-runtime/.yarnrc.yml',
  'acryl-tui/yarn.lock',
  'acryl-tui/.yarnrc.yml',
  'dsh-community-fabric/yarn.lock',
  'dsh-community-fabric/.yarnrc.yml',
  'dsh-community-market/yarn.lock',
  'dsh-community-market/.yarnrc.yml',
]) {
  if (existsSync(resolve(root, obsoleteFile))) fail(`${obsoleteFile} must not exist`)
}
if (run('git', ['config', '-f', '.gitmodules', '--get', 'submodule.deepseek-harness.path']) !== 'deepseek-harness') {
  fail('the upstream submodule path must be deepseek-harness')
}
if (run('git', ['config', '-f', '.gitmodules', '--get', 'submodule.deepseek-harness.url']) !== upstream.repository) {
  fail('the upstream submodule URL differs from upstream.json')
}
if (typeof upstreamPackage.packageManager !== 'string' || !upstreamPackage.packageManager.startsWith('pnpm@')) {
  fail('the upstream checkout must retain its pnpm package manager')
}

for (const [owner, manifest] of [
  ['root', workspace],
  ['desktop', plugin],
  ['canvas', canvas],
  ['control', control],
  ['tui', tui],
  ['fabric', fabric],
  ['market', market],
]) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'resolutions']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range !== 'string') continue
      if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
        && (/^(?:workspace|portal|link):/u.test(range)
          || (range.startsWith('file:') && range.includes('deepseek-harness')))) {
        fail(`${owner} ${field}.${name} bypasses the published DSH package boundary`)
      }
    }
  }
}

const [mode, object] = run('git', ['ls-files', '--stage', '--', 'deepseek-harness']).split(/\s+/u)
if (mode !== '160000') fail('deepseek-harness must be tracked as a Git submodule')
if (object !== upstream.commit) fail(`submodule index is ${object}, expected ${upstream.commit}`)

const upstreamDir = resolve(root, 'deepseek-harness')
if (run('git', ['rev-parse', 'HEAD'], upstreamDir) !== upstream.commit) {
  fail('checked-out upstream commit differs from upstream.json')
}
if (run('git', ['status', '--porcelain'], upstreamDir) !== '') {
  fail('deepseek-harness contains local changes')
}
if (run('git', ['remote', 'get-url', 'origin'], upstreamDir) !== upstream.repository) {
  fail('deepseek-harness origin differs from upstream.json')
}
if (upstreamPackage.version !== upstream.sourceVersion) {
  fail('deepseek-harness package version differs from upstream.json')
}
for (const name of Object.keys(plugin.dependencies).filter(name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))) {
  if (plugin.dependencies[name] !== upstream.runtimePackageVersion) {
    fail(`${name} must use the recorded DSH runtime package family`)
  }
}

process.stdout.write(`verify-layout: PNPM workspace and upstream ${upstream.commit.slice(0, 10)} are consistent\n`)
