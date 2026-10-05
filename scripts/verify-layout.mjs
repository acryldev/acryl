import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { relative, resolve } from 'node:path'

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
const plugin = readJson('apps/acryl-desktop/package.json')
const control = readJson('runtime/acryl-control/package.json')
const harness = readJson('runtime/acryl-harness-runtime/package.json')
const cli = readJson('apps/acryl-cli/package.json')
const web = readJson('apps/acryl-web/package.json')
const fabric = readJson('plugins/dsh-community-fabric/package.json')
const market = readJson('plugins/cordis-plugin-market/package.json')
const upstreamPackage = readJson('deepseek-harness/package.json')

if (!workspace.packageManager?.match(/^pnpm@11\.\d+\.\d+$/)) {
  fail('the product workspace must pin pnpm@11.x.x (patch updates permitted)')
}
if (workspace.workspaces !== undefined) fail('workspace membership belongs only in pnpm-workspace.yaml')
if (!npmrc.includes('node-linker=isolated\n')) fail('the product workspace must use the documented PNPM isolated linker')
if (!npmrc.includes('TUI owns its independent React 19 graph.')) {
  fail('the PNPM linker policy must record the separate React peer graphs')
}
// Checked as a prefix, not full-file equality: pnpm appends its own
// auto-managed `minimumReleaseAgeExclude:` list (every currently-resolved
// package, regenerated on install) after this point, which is pnpm's
// responsibility to keep correct, not a hand-authored policy this gate owns.
const OWNED_WORKSPACE_POLICY = `nodeLinker: isolated

packages:
  - examples/acryl-blend-demo
  - runtime/acryl-control
  - runtime/acryl-diagnostics
  - runtime/acryl-harness-runtime
  - runtime/blends-core
  - runtime/app-persistence
  - runtime/acryl-loopback-http
  - distribution/acryl-npm-launcher
  - apps/acryl-cli
  - apps/acryl-web
  - apps/acryl-desktop
  - plugins/dsh-client-ui-brand-acryl
  - plugins/dsh-community-fabric
  - plugins/cordis-plugin-market
  - plugins/acryl-extension-context
  - plugins/acryl-system-prompt
  - plugins/acryl-ui
  - plugins/acryl-ui-tui
  - plugins/acryl-mount-anchors
  - plugins/acryl-shortcuts
  - plugins/acryl-settings
  - plugins/acryl-brand
  - plugins/acryl-app-save
  - plugins/acryl-app-shell
  - plugins/acryl-workspace
  - plugins/acryl-plugin-admin
  - plugins/acryl-support
  - plugins/acryl-agent-control
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
# acryl-cli separately owns Ink's React 19 types.
packageExtensions:
  '@deepseek-ai/dsh-client-ui-primitives@${upstream.runtimePackageVersion}':
    dependencies:
      '@types/react': 18.3.31
      '@types/mdast': ^4.0.4
  '@deepseek-ai/dsh-client-ui-slots@${upstream.runtimePackageVersion}':
    dependencies:
      '@types/react': 18.3.31
  'lucide-react@1.34.0':
    dependencies:
      '@types/react': 18.3.31
  # ${upstream.runtimePackageVersion} types import this package but the manifest does not declare it (found 2026-10-02, spec 001 R24).
  '@deepseek-ai/dsh-session@${upstream.runtimePackageVersion}':
    dependencies:
      '@deepseek-ai/dsh-typert-protocol': ${upstream.runtimePackageVersion}
  # The browser bundle imports \`zustand\` and \`immer\`, which upstream lists only as devDependencies; Node-side tests load it.
  '@deepseek-ai/dsh-client-store@${upstream.runtimePackageVersion}':
    dependencies:
      zustand: ~4.4.7
      immer: ^10.1.1
  # Its types import \`lexical\` through the draft-editor contract, but upstream lists it only as a devDependency.
  '@deepseek-ai/dsh-client-ui-conversation@${upstream.runtimePackageVersion}':
    dependencies:
      lexical: ^0.49.0
  # The types of dsh-client-modules import these two packages without declaring them (R24).
  '@deepseek-ai/dsh-client-modules@${upstream.runtimePackageVersion}':
    dependencies:
      '@deepseek-ai/dsh-package-manifest': ${upstream.runtimePackageVersion}
      '@deepseek-ai/dsh-host-webserver': ${upstream.runtimePackageVersion}

patchedDependencies:
`
if (!pnpmWorkspace.startsWith(OWNED_WORKSPACE_POLICY)) {
  fail('pnpm-workspace.yaml must define the owned workspace, patch, and native-build policies')
}
if (!pnpmWorkspace.includes(`
supportedArchitectures:
  os:
    - current
  cpu:
    - current
    - x64
    - arm64
`)) {
  fail('pnpm-workspace.yaml must define the universal macOS/native-build policy')
}
for (const [name, manifest] of [
  ['acryl-desktop', plugin],
  ['acryl-control', control],
  ['acryl-harness-runtime', harness],
  ['acryl-npm-launcher', readJson('distribution/acryl-npm-launcher/package.json')],
  ['acryl-cli', cli],
  ['acryl-web', web],
  ['dsh-community-fabric', fabric],
  ['cordis-plugin-market', market],
]) {
  if (manifest.packageManager !== undefined) fail(`${name} must inherit the root PNPM release`)
}
if (control.name !== 'acryl-control') fail('the control workspace must own acryl-control')
if (readJson('distribution/acryl-npm-launcher/package.json').name !== 'acryl') fail('the npm selector workspace must own the public acryl selector package')
if (cli.name !== 'acryl-cli') fail('the CLI workspace must own acryl-cli')
if (web.name !== 'acryl-web') fail('the Web workspace must own acryl-web')
if (fabric.name !== 'dsh-community-fabric') fail('the Fabric workspace must own dsh-community-fabric')
if (market.name !== 'cordis-plugin-market') fail('the market workspace must own cordis-plugin-market')
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
  'apps/acryl-desktop/yarn.lock',
  'apps/acryl-desktop/.yarnrc.yml',
  'runtime/acryl-control/yarn.lock',
  'runtime/acryl-control/.yarnrc.yml',
  'runtime/acryl-harness-runtime/yarn.lock',
  'runtime/acryl-harness-runtime/.yarnrc.yml',
  'apps/acryl-cli/yarn.lock',
  'apps/acryl-cli/.yarnrc.yml',
  'plugins/dsh-community-fabric/yarn.lock',
  'plugins/dsh-community-fabric/.yarnrc.yml',
  'plugins/cordis-plugin-market/yarn.lock',
  'plugins/cordis-plugin-market/.yarnrc.yml',
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
  ['control', control],
  ['harness-runtime', harness],
  ['cli', cli],
  ['web', web],
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
for (const [owner, manifest] of [
  ['desktop', plugin],
  ['harness-runtime', harness],
  ['cli', cli],
  ['web', web],
  ['control', control],
  ['market', market],
]) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'resolutions']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range !== 'string') continue
      if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
        && range !== upstream.runtimePackageVersion) {
        fail(`${owner} ${field}.${name} must use the recorded DSH runtime package family (${upstream.runtimePackageVersion})`)
      }
    }
  }
}

// DSH 0.2 ships each agent preset as a patch file of the `dsh-web-app` bundle, and ACRYL's terminal layers those same four files in
// (`terminalPresetPatches` in acryl-harness-runtime). Make that dependency loud: if upstream drops or renames one, the terminal roster
// would silently shrink, so fail here when the submodule is initialized but a file is gone.
for (const preset of ['standard', 'ptc', 'minimal', 'cordis']) {
  const presetPatch = resolve(upstreamDir, 'packages', 'bundle', 'web-app', 'presets', `${preset}.patch.yml`)
  if (!existsSync(presetPatch)) {
    fail(`the shipped agent preset patch is missing: ${presetPatch}`)
  }
}

// The DSH import ratchet (spec 001 T046). ACRYL's own code reaches DeepSeek Harness only through the engine seam; every other direct
// `from '@deepseek-ai/dsh...'` line in non-test source is coupling that has to shrink. The seam is named here, as files, so "outside the seam" has one
// definition: the engine files, the Desktop Electron entry, and the `@acryl/ui` facades (contract adapters and `frame.ts`); a plugin whose sole capability is the DSH chat would
// also belong, and none is declared: if one seems to qualify, record it as a finding instead of adding it. Both ceilings only move down: when a
// change lowers a count, this gate says so and the ceiling is lowered in the same commit.
const DSH_IMPORT_CEILING = { total: 134, outsideSeam: 106 }
const SEAM_FILES = [
  /^runtime\/acryl-harness-runtime\/src\/engine-[a-z-]+\.ts$/,
  /^apps\/acryl-desktop\/src\/(main|electron-runtime|preload|engine-[a-z-]+)\.ts$/,
  /^apps\/acryl-desktop\/src\/shell\/electron-[a-z-]+\.ts$/,
  /^plugins\/acryl-ui\/src\/(frame\.ts|client\/(contract-adapters\.tsx|registry\/.*))$/,
]
const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'lib' ? [] : sourceFiles(path)
  return /\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
})
const dshImports = { total: 0, outsideSeam: 0 }
for (const group of ['runtime', 'apps', 'plugins']) {
  for (const entry of readdirSync(resolve(root, group), { withFileTypes: true })) {
    const src = resolve(root, group, entry.name, 'src')
    if (!entry.isDirectory() || !existsSync(src)) continue
    for (const file of sourceFiles(src)) {
      const count = (readFileSync(file, 'utf8').match(/from '@deepseek-ai\/dsh[^']*'/g) ?? []).length
      if (count === 0) continue
      dshImports.total += count
      if (!SEAM_FILES.some(pattern => pattern.test(relative(root, file)))) dshImports.outsideSeam += count
    }
  }
}
for (const [key, ceiling] of Object.entries(DSH_IMPORT_CEILING)) {
  const now = dshImports[key]
  if (now > ceiling) fail(`direct DSH import lines (${key}) are ${now}, above the ceiling ${ceiling}; reach DSH through the engine seam instead`)
  if (now < ceiling) fail(`direct DSH import lines (${key}) are ${now}, below the ceiling ${ceiling}: lower DSH_IMPORT_CEILING.${key} to ${now} in scripts/verify-layout.mjs`)
}

// Isolation fails closed (spec 001, T058). A `verify-*` script that spawns a process able to boot an app (a packed or built bin, Electron, a launcher) must
// either build its environment with `scripts/lib/isolated-run.mjs` or visibly pin a throwaway HOME / ACRYL_HOME / DSH_HOME: the packed-web smoke once booted
// against the machine's real ~/.acryl because nothing made it say where its home was. A new script that does neither fails here, in the gate that runs everywhere.
const BOOTS_AN_APP = /\b(spawn|spawnSync|execFile|execFileSync|fork)\b[\s\S]*(acryl-web|acryl-cli|lib\/bin\.js|launch-dev|electron|ELECTRON_RUN_AS_NODE|\.bin)/u
const PINS_A_HOME = /isolated-run|\bHOME:|\bACRYL_HOME\b|\bDSH_HOME\b|\bDSH_DESKTOP_USER_DATA\b/u
const scriptDirectories = ['scripts', ...['apps', 'runtime', 'plugins', 'distribution', 'examples'].flatMap(group => (existsSync(resolve(root, group)) ? readdirSync(resolve(root, group)).map(name => `${group}/${name}/scripts`) : []))]
for (const directory of scriptDirectories) {
  if (!existsSync(resolve(root, directory))) continue
  for (const name of readdirSync(resolve(root, directory))) {
    if (!/^verify-.*\.(mjs|ts)$/u.test(name) || name === 'verify-layout.mjs') continue
    const text = readFileSync(resolve(root, directory, name), 'utf8')
    if (BOOTS_AN_APP.test(text) && !PINS_A_HOME.test(text)) fail(`${directory}/${name} can boot an app but pins no home: build its environment with scripts/lib/isolated-run.mjs (isolatedEnvironment) so it can never reach a real ACRYL or DSH home`)
  }
}

process.stdout.write(`verify-layout: PNPM workspace and upstream ${upstream.commit.slice(0, 10)} are consistent; DSH import lines ${dshImports.total} (${dshImports.outsideSeam} outside the seam)\n`)
