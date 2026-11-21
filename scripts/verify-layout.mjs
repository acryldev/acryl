import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { directionViolations, findCycles, FOUNDATION, FRAMEWORK_PLUGINS, readGraph, unlistedFoundation } from './dependency-direction.mjs'
import { uncoveredLibraryPlugins } from './lint-coverage.mjs'

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
const control = readJson('runtime/control/package.json')
const harness = readJson('runtime/harness-runtime/package.json')
const fabric = readJson('plugins/dsh-community-fabric/package.json')
const market = readJson('plugins/cordis-plugin-market/package.json')
const upstreamPackage = readJson('deepseek-harness/package.json')

if (!workspace.packageManager?.match(/^pnpm@12\.\d+\.\d+$/)) {
  fail('the product workspace must pin pnpm@12.x.x (patch updates permitted)')
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
  - examples/framework-starter
  - examples/todo
  - runtime/control
  - runtime/diagnostics
  - runtime/harness-runtime
  - runtime/blends-core
  - runtime/app-persistence
  - runtime/plugin-hub-core
  - runtime/loopback-http
  - runtime/web
  - distribution/acryl-npm-launcher
  # Every Cordis plugin package: ACRYL's own and the framework library's app plugins (spec 051 T017, the Pi model's flat plugins folder).
  - plugins/*
  # The framework (acrylblends), imported with its history (spec 051): its CLI and create, and the frame's own packages. The frame packages it shares with ACRYL live once,
  # above (plugins/, runtime/), and framework/frame/packages.json names their folders.
  - framework
  - framework/packages/*
  - '!deepseek-harness/**'

allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  electron: true
  electron-winstaller: false
  esbuild: true
  koffi: true
  # msw comes in as an optional peer of vitest's mocker; its postinstall only copies a service worker for browser apps.
  msw: false
  node-pty: true
  protobufjs: false

overrides:
  koffi: 3.1.5
  # Nothing loads DeepSeek Harness's native internals add-on: ACRYL's profile resolution (runtime/harness-runtime/src/profile-resolution)
  # runs on Node's public module hooks, and the Cordis Loader falls back to plain import() without it. The add-on accepts only the Electron
  # builds named in its binary, so leaving it installed would tie Desktop to them again.
  node-addon-require-builtin: '-'
  # DSH 0.2.0-rc.2 pins pi-ai ^0.87.1, whose catalog stops at Claude Haiku 4.5, Sonnet 5 and Opus 5; 1.1.0 adds the 5.5 models (owner, 2026-10-11).
  '@earendil-works/pi-ai': 1.1.0

# Published DSH client packages declare React types in generated public APIs but
# omit the type package from their manifests. Their web surface is React 18;
# the terminal agent (acryldev/acryl-terminal) separately owns its React 19 types.
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
  # pi-ai 1.x's "Sign in with ChatGPT" needs a stable installation id; the patched adapter passes this harness home's anonymous id.
  '@deepseek-ai/dsh-llm-pi-ai@${upstream.runtimePackageVersion}':
    dependencies:
      '@deepseek-ai/dsh-anonymous-user-id': ${upstream.runtimePackageVersion}

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
  ['@acryldev/control', control],
  ['@acryldev/harness-runtime', harness],
  ['acryl-npm-launcher', readJson('distribution/acryl-npm-launcher/package.json')],
  ['@acryldev/dsh-community-fabric', fabric],
  ['@acryldev/cordis-plugin-market', market],
]) {
  if (manifest.packageManager !== undefined) fail(`${name} must inherit the root PNPM release`)
}
if (control.name !== '@acryldev/control') fail('the control workspace must own @acryldev/control')
if (readJson('distribution/acryl-npm-launcher/package.json').name !== 'acryl') fail('the npm selector workspace must own the public acryl selector package')
if (fabric.name !== '@acryldev/dsh-community-fabric') fail('the Fabric workspace must own @acryldev/dsh-community-fabric')
if (market.name !== '@acryldev/cordis-plugin-market') fail('the market workspace must own @acryldev/cordis-plugin-market')
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
  'runtime/control/yarn.lock',
  'runtime/control/.yarnrc.yml',
  'runtime/harness-runtime/yarn.lock',
  'runtime/harness-runtime/.yarnrc.yml',
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
  ['control', control],
  ['harness-runtime', harness],
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
  ['harness-runtime', harness],
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
// (`terminalPresetPatches` in @acryldev/harness-runtime). Make that dependency loud: if upstream drops or renames one, the terminal roster
// would silently shrink, so fail here when the submodule is initialized but a file is gone.
for (const preset of ['standard', 'ptc', 'minimal', 'cordis']) {
  const presetPatch = resolve(upstreamDir, 'packages', 'bundle', 'web-app', 'presets', `${preset}.patch.yml`)
  if (!existsSync(presetPatch)) {
    fail(`the shipped agent preset patch is missing: ${presetPatch}`)
  }
}

// The DSH import ratchet (spec 001 T046). ACRYL's own code reaches DeepSeek Harness only through the engine seam; every other direct
// `from '@deepseek-ai/dsh...'` line in non-test source is coupling that has to shrink. The seam is named here, as files, so "outside the seam" has one
// definition: the engine files and the ported DSH profile resolution, the Desktop Electron entry, and the `@acryldev/ui` facades (contract adapters, `frame.ts` and the `acrylChat` service in `client/chat.ts`); a plugin whose sole capability is the DSH chat would
// also belong, and none is declared: if one seems to qualify, record it as a finding instead of adding it. Both ceilings only move down: when a
// change lowers a count, this gate says so and the ceiling is lowered in the same commit.
// One deliberate raise: total went from 133 to 135 when DSH's profile package resolution was ported into the runtime (2026-10-25), because the port
// subclasses DSH's PluginPackages and routes DSH's own resolution table; it serves only the DSH engine, so it is part of the seam.
// The seam grew by two lines, total 135 to 137 with outside the seam unchanged at 104, for `@acryldev/ui`'s `acrylChat` service (spec 049 T002,
// 2026-10-28): `frame.ts` re-exports DSH's `command/executed` event type and `client/chat.ts` reads DSH's own conversation phase, so a client plugin such
// as @acryldev/command-reply reads the chat's phase and posts a composer notice without naming a DSH package.
// Spec 051 (2026-11-18), total 137 to 138 with outside the seam unchanged: the Blends frame's @acryldev/app-shell came home with a Settings launcher
// for DSH's `sidebar.settings` slot, whose types `frame.ts` now re-exports (one line); and the acrylWeb adapter moved from the engine's own
// engine-web.ts into runtime/web, which ACRYL's engine and every Blends app mount, so that one file is the same seam under a new path.
// Spec 051 T018 (2026-11-19), total 138 to 146 and outside the seam 104 to 112: the Blends frame's own plugins (@acryldev/blends-frame,
// @acryldev/app-context) moved from framework/ide into the flat plugins/ folder, so their existing DSH imports (chat, sidebars, dsh-tools, dsh-llm;
// eight lines, none new) are counted for the first time. Routing them through @acryldev/ui's seam is its own task.
const DSH_IMPORT_CEILING = { total: 77, outsideSeam: 47 }
const SEAM_FILES = [
  /^runtime\/harness-runtime\/src\/engine-[a-z-]+\.ts$/,
  /^runtime\/web\/src\/index\.ts$/,
  /^runtime\/harness-runtime\/src\/profile-resolution\/[a-z-]+\.ts$/,
  /^plugins\/ui\/src\/(frame\.ts|client\/(contract-adapters\.tsx|chat\.ts|registry\/.*))$/,
]
const sourceFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = resolve(dir, entry.name)
  if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'lib' ? [] : sourceFiles(path)
  return /\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
})
const dshImports = { total: 0, outsideSeam: 0 }
for (const group of ['runtime', 'plugins', 'framework/packages']) {
  for (const entry of readdirSync(resolve(root, group), { withFileTypes: true })) {
    const src = resolve(root, group, entry.name, 'src')
    if (!entry.isDirectory() || !existsSync(src)) continue
    for (const file of sourceFiles(src)) {
      const count = (readFileSync(file, 'utf8').match(/from '@deepseek-ai\/dsh[^']*'/g) ?? []).length
      if (count === 0) continue
      dshImports.total += count
      if (!SEAM_FILES.some(pattern => pattern.test(relative(root, file).replaceAll('\\', '/')))) dshImports.outsideSeam += count
    }
  }
}
for (const [key, ceiling] of Object.entries(DSH_IMPORT_CEILING)) {
  const now = dshImports[key]
  if (now > ceiling) fail(`direct DSH import lines (${key}) are ${now}, above the ceiling ${ceiling}; reach DSH through the engine seam instead`)
  if (now < ceiling) fail(`direct DSH import lines (${key}) are ${now}, below the ceiling ${ceiling}: lower DSH_IMPORT_CEILING.${key} to ${now} in scripts/verify-layout.mjs`)
}

// The webServer registration ratchet (spec 048 T009). ACRYL's own HTTP routes are served by the framework's router (`ctx.router.route` plus one
// `ctx.routerHttp.mount(prefix)` per plugin); every `register` or `registerUpgrade` call on DSH's `webServer` or ACRYL's `acrylWeb` carrier in shipped
// source is a route the router does not own. What DSH registers on its own `webServer` (its pages and RPC) is DSH's and lives in the submodule, which
// is not counted. Tests, docs, build output and scripts are not counted either. Like the DSH import ceiling it only moves down, and a lower count must
// lower it in the same commit. It reached 0 with spec 048 T007 and T008: the workspace terminal's WebSocket is a router route upgraded by
// `routerHttp`, and `acrylWeb` carries only the address, so a new call site has nowhere to hide.
const WEB_REGISTRATION_CEILING = 0
const WEB_REGISTRATION = /(acrylWeb|webServer|[^a-zA-Z]web)[?]?[.](register|registerUpgrade)[(]/
const NOT_SHIPPED = /\/tests?\/|\/lib\/|lib-publish\/|\.md$|\/docs\/|\/scripts\/|\.spec\.|\.test\./
let webRegistrations = 0
// The foundation's own folders, by package name (pnpm's list), so a look-alike folder elsewhere is not exempt.
const foundationFolders = [...readGraph(root)].filter(([name]) => FOUNDATION.has(name)).map(([, { folder }]) => folder)
for (const file of run('git', ['ls-files', '--', 'plugins', 'runtime', 'framework/packages']).split('\n')) {
  if (file === '' || NOT_SHIPPED.test(file) || !existsSync(resolve(root, file))) continue
  // The framework foundation implements the web layer (@acryldev/router-http mounts routers on the web server, @acryldev/page serves the page): the
  // rule is for code that uses it.
  if (foundationFolders.some(folder => file.startsWith(`${folder}/`))) continue
  for (const line of readFileSync(resolve(root, file), 'utf8').split('\n')) if (WEB_REGISTRATION.test(line)) webRegistrations += 1
}
if (webRegistrations > WEB_REGISTRATION_CEILING) fail(`webServer and acrylWeb registration call sites are ${webRegistrations}, above the ceiling ${WEB_REGISTRATION_CEILING}; serve the route on the router instead (ctx.router.route('/', app) and ctx.routerHttp.mount(prefix), see plugins/plugin-context/docs/extending/host-route.md)`)
if (webRegistrations < WEB_REGISTRATION_CEILING) fail(`webServer and acrylWeb registration call sites are ${webRegistrations}, below the ceiling ${WEB_REGISTRATION_CEILING}: lower WEB_REGISTRATION_CEILING to ${webRegistrations} in scripts/verify-layout.mjs`)

// Isolation fails closed (spec 001, T058). A `verify-*` script that spawns a process able to boot an app (a packed or built bin, Electron, a launcher) must
// visibly pin a throwaway HOME / ACRYL_HOME / DSH_HOME: the packed-web smoke once booted
// against the machine's real ~/.acryl because nothing made it say where its home was. A new script that does neither fails here, in the gate that runs everywhere.
const BOOTS_AN_APP = /\b(spawn|spawnSync|execFile|execFileSync|fork)\b[\s\S]*(acryl-web|acryl-cli|lib\/bin\.js|launch-dev|electron|ELECTRON_RUN_AS_NODE|\.bin)/u
const PINS_A_HOME = /isolated-run|\bHOME:|\bACRYL_HOME\b|\bDSH_HOME\b|\bDSH_DESKTOP_USER_DATA\b/u
const scriptDirectories = ['scripts', ...['runtime', 'plugins', 'distribution', 'examples'].flatMap(group => (existsSync(resolve(root, group)) ? readdirSync(resolve(root, group)).map(name => `${group}/${name}/scripts`) : []))]
for (const directory of scriptDirectories) {
  if (!existsSync(resolve(root, directory))) continue
  for (const name of readdirSync(resolve(root, directory))) {
    if (!/^verify-.*\.(mjs|ts)$/u.test(name) || name === 'verify-layout.mjs') continue
    const text = readFileSync(resolve(root, directory, name), 'utf8')
    if (BOOTS_AN_APP.test(text) && !PINS_A_HOME.test(text)) fail(`${directory}/${name} can boot an app but pins no home: pin a throwaway HOME / ACRYL_HOME / DSH_HOME (scripts/live-run.mjs in acryldev/acryl-terminal shows the isolated environment to build) so it can never reach a real ACRYL or DSH home`)
  }
}

// Build output is never committed (spec 001, T072). A package whose `build` writes `lib/` (every one with a build script) has no tracked file there:
// a committed bundle goes stale the moment its source changes without a rebuild in the same commit. Packages without a build script keep
// hand-written sources in `lib/` (@acryldev/plugin-context, @acryldev/brand, @acryldev/system-prompt) and are not affected.
const trackedLib = run('git', ['ls-files', '--', ':(glob)*/*/lib/**', ':(glob)framework/*/*/lib/**']).split('\n').filter(Boolean)
for (const group of ['runtime', 'plugins', 'distribution', 'examples', 'framework/packages']) {
  if (!existsSync(resolve(root, group))) continue
  for (const name of readdirSync(resolve(root, group))) {
    const manifest = resolve(root, group, name, 'package.json')
    if (!existsSync(manifest) || JSON.parse(readFileSync(manifest, 'utf8')).scripts?.build === undefined) continue
    const committed = trackedLib.filter(path => path.startsWith(`${group}/${name}/lib/`))
    if (committed.length > 0) fail(`${group}/${name} builds its lib/ but ${committed.length} file(s) there are tracked in git (${committed[0]}): add ${group}/${name}/lib/ to .gitignore and git rm --cached them`)
  }
}

// Tests clean up their temporary directories (spec 001, T063): the suites had left over 4,000 `acryl-*` and `dsh-*` folders in the temp
// directory. A test file that creates one (`mkdtemp`) must also remove it in a teardown (`afterEach`, `afterAll`, node:test's `after` or `finally` with `rm`/`rmSync`),
// or say why it keeps them with a `keeps-temporary-directories:` comment (an opt-in run whose files are its evidence).
// Every depth, framework/ included. The CLI's app templates are excluded: their tests are copied into people's apps and follow the app's
// own conventions, so changing them is a change to what users receive.
const testFiles = run('git', ['ls-files', '--', ':(glob)**/tests/**', ':(glob)**/test/**']).split('\n')
  .filter(path => /\.(spec\.tsx?|test\.mjs|test\.ts)$/u.test(path) && !path.startsWith('framework/packages/cli/templates/') && !path.includes('/legacy/') && existsSync(resolve(root, path)))
for (const path of testFiles) {
  const text = readFileSync(resolve(root, path), 'utf8')
  if (!text.includes('mkdtemp') || text.includes('keeps-temporary-directories:')) continue
  if (!(/\b(afterEach|afterAll|after)\s*\(|\bfinally\s*[{(]/u.test(text) && /\brm(Sync)?\(/u.test(text))) {
    fail(`${path} creates temporary directories (mkdtemp) but never removes them: remove each in afterEach/afterAll/after/finally, or mark the file with a keeps-temporary-directories: comment saying why`)
  }
}

// Dependency direction (spec 051, the Pi model): no cycles between workspace packages, and nothing points the wrong way
// (scripts/dependency-direction.mjs says which rules and why).
const packageGraph = readGraph(root)
// There is no apps/ group any more: the terminal agent and the earlier browser surface are products and live in acryldev/acryl-terminal, a Blend app in its own
// acrylblends repository. The monorepo keeps only the building blocks (owner, 2026-11-21: ACRYL Control Center and ACRYL ADE moved out).
if (existsSync(resolve(root, 'apps'))) fail('apps/ is gone: a product lives in its own repository (acryldev/acryl-terminal, an acrylblends app repository), not in the monorepo')
const cycles = findCycles(packageGraph)
if (cycles.length > 0) fail(`dependency cycles between workspace packages (each must point one way):\n${cycles.map(cycle => `  ${cycle.join(' -> ')}`).join('\n')}`)
const unlisted = unlistedFoundation(packageGraph)
if (unlisted.length > 0) fail(`framework packages with no role (scripts/dependency-direction.mjs):\n${unlisted.map(line => `  ${line}`).join('\n')}`)
// The plugin library (spec 051 T027): every plugins/<name> folder with a plugin.json is a workspace package with a role, so the copy source and the graph
// cannot drift apart again (until T017 the plain app plugins were not packages and the direction guard never saw them).
const libraryProblems = []
const pluginsRoot = resolve(root, 'plugins')
for (const entry of readdirSync(pluginsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory() || !existsSync(resolve(pluginsRoot, entry.name, 'plugin.json'))) continue
  const manifest = resolve(pluginsRoot, entry.name, 'package.json')
  if (!existsSync(manifest)) {
    libraryProblems.push(`plugins/${entry.name} has a plugin.json but no package.json`)
    continue
  }
  const name = readJson(`plugins/${entry.name}/package.json`).name
  if (!packageGraph.has(name)) libraryProblems.push(`${name} (plugins/${entry.name}) is not a workspace package`)
  else if (!FOUNDATION.has(name) && !FRAMEWORK_PLUGINS.has(name)) libraryProblems.push(`${name} (plugins/${entry.name}) is a library plugin but neither FOUNDATION nor FRAMEWORK_PLUGINS names it`)
}
if (libraryProblems.length > 0) fail(`library plugins outside the graph (scripts/dependency-direction.mjs):\n${libraryProblems.map(line => `  ${line}`).join('\n')}`)

// Lint coverage (spec 051 T017): the root lint:library runs biome over plugins/, and biome.json names every root-source library plugin (the app
// plugins; the vendored src/-shape ones stay out, as they always did). A new app plugin that is not named there would be silently unlinted.
const lintConfig = readJson('biome.json').files?.includes ?? []
const uncoveredLint = uncoveredLibraryPlugins(resolve(root, 'plugins'), lintConfig)
if (uncoveredLint.length > 0) fail(`library plugins missing from the lint config (biome.json):\n${uncoveredLint.map(line => `  ${line}`).join('\n')}`)
const wrongWay = directionViolations(packageGraph)
if (wrongWay.length > 0) fail(`dependencies that point the wrong way:\n${wrongWay.map(line => `  ${line}`).join('\n')}`)

process.stdout.write(`verify-layout: PNPM workspace and upstream ${upstream.commit.slice(0, 10)} are consistent; DSH import lines ${dshImports.total} (${dshImports.outsideSeam} outside the seam); webServer registration call sites ${webRegistrations}; ${packageGraph.size} packages, no cycles, all dependencies point down\n`)
