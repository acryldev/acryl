import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { parse } from 'yaml'
import { OMIT_PLACEHOLDER, OMITTED_PACKAGES } from '../src/frame-omit.ts'
import {
  AGENT_PRESET_ID,
  AGENT_PRESET_ROWS,
  applyIdeProfile,
  CLIENT_ROWS,
  DRIVER_ROWS,
  FRAME_PACKAGES,
  ideProfilePlan,
  planIdeProfileWrite,
  profileNameFor,
} from '../src/ide-profile.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const step of cleanups.splice(0).reverse()) step()
})

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ide-profile-'))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const SPECS: Record<string, string> = Object.fromEntries(
  FRAME_PACKAGES.map((entry) => [
    entry.row ?? entry.name,
    `file:../${entry.name.replaceAll('/', '-')}`,
  ]),
)
const input = {
  appName: 'My App',
  dshVersion: '0.2.0-rc.2',
  frameworkVersion: '^1.0.10',
  spec: (name: string) => SPECS[name],
}

test('one profile per app, named from the app and safe for a DSH profile', () => {
  assert.equal(profileNameFor('My App'), 'acrylblends-my-app')
  assert.equal(profileNameFor('notes'), 'acrylblends-notes')
  assert.notEqual(profileNameFor('a'), profileNameFor('b'))
  assert.match(
    ideProfilePlan(input).packageJson,
    /"dev": "node --import \.\/plugins\/acryl-node-server\/src\/register\.ts scripts\/ide-host\.mjs"/u,
  )
})

test("the frame's row is told the app's page, and the IDE's workbench is not mounted", () => {
  const overlay = ideProfilePlan(input).overlay
  assert.match(
    overlay,
    /- id: acryl-blends-frame\n {6}name: acryl-blends-frame\n {6}config:\n {8}appPage: \/app/u,
  )
  assert.doesNotMatch(overlay, /acryl-workspace/u)
})

test("the overlay mounts the frame rows and leaves DSH's own brand row out", () => {
  const overlay = ideProfilePlan(input).overlay
  for (const entry of FRAME_PACKAGES)
    assert.match(
      overlay,
      new RegExp(
        `- id: ${entry.row ?? entry.name}\\n\\s+name: ${entry.name.replaceAll('/', '\\/')}`,
        'u',
      ),
    )
  assert.match(overlay, /- id: ui-brand-official\n {2}disabled: true/u)
})

test("the frame leaves DSH's Office converter out: its row is off and npm installs the empty placeholder for its 153 MB engines", () => {
  assert.match(ideProfilePlan(input).overlay, /- id: office-to-pdf\n {2}disabled: true/u)
  const theirs = JSON.stringify({ name: 'my-app', overrides: { 'left-pad': '1.0.0' } })
  const manifest = JSON.parse(ideProfilePlan(input, theirs).packageJson)
  assert.equal(manifest.overrides['left-pad'], '1.0.0')
  for (const name of OMITTED_PACKAGES)
    assert.equal(manifest.overrides[name], `npm:${OMIT_PLACEHOLDER}`)
  assert.ok(OMITTED_PACKAGES.includes('@deepseek-ai/libreoffice-kit-darwin-arm64'))
})

test('the driver rows carry no DSH web surface: our node server and page serve the app', () => {
  for (const id of [
    'webserver',
    'web-startup',
    'web-runtime',
    'client-hmr',
    'ui-layout',
    'ui-sidebar',
    'ui-conversation',
  ])
    assert.ok(!DRIVER_ROWS.includes(id), `${id} must not be a driver row`)
  assert.doesNotMatch(ideProfilePlan(input).overlay, /- id: ui-layout/u)
  assert.doesNotMatch(ideProfilePlan(input).overlay, /- id: webserver/u)
})

test("the frame draws the left panel, so DSH's left sidebar is not mounted, its right sidebar is, and the chat starts dark like the frame", () => {
  const ids = CLIENT_ROWS.map((row) => row.id)
  assert.ok(!ids.includes('ui-sidebar'))
  for (const id of ['ui-sidebar-right', 'ui-plan', 'ui-deliverables'])
    assert.ok(
      ids.indexOf(id) > -1 &&
        (id === 'ui-sidebar-right' || ids.indexOf(id) > ids.indexOf('ui-sidebar-right')),
      `${id} is mounted after the right sidebar`,
    )
  assert.deepEqual(CLIENT_ROWS.find((row) => row.id === 'ui-theme')?.config, { preference: 'dark' })
})

test("the chat view's rows are mounted, so an answer and its tool calls are drawn, and the frame's own agent preset is the default", () => {
  const ids = CLIENT_ROWS.map((row) => row.id)
  for (const id of ['ui-chat', 'ui-tool', 'ui-approval', 'ui-attachment'])
    assert.ok(ids.includes(id), `${id} is a client row`)
  const [registry, preset] = AGENT_PRESET_ROWS
  assert.deepEqual(registry?.config, { default: AGENT_PRESET_ID })
  assert.equal(preset?.id, `preset-${AGENT_PRESET_ID}`)
  const tools = ((preset?.config.plugins ?? []) as { id: string }[]).map((plugin) => plugin.id)
  for (const id of ['tool-bash', 'tool-fs', 'tool-fs-search', 'tool-jobs'])
    assert.ok(tools.includes(id), `${id} is in the preset`)
  // The tools are the preset's own; the host rows they stand on are driver rows, and DSH's `standard` preset (and its host rows) is not mounted.
  for (const id of [
    'fs-observation-policy',
    'shell-env',
    'jobs',
    'workspace-changes',
    'subprocess',
  ])
    assert.ok(DRIVER_ROWS.includes(id), `${id} is a driver row`)
  for (const id of ['preset-standard', 'tool-fs', 'tool-bash', 'agent-preset-registry'])
    assert.ok(!DRIVER_ROWS.includes(id), `${id} must not be a driver row`)
  const script = ideProfilePlan(input).hostScript
  assert.match(script, /const agentRows = \[/u)
  assert.match(script, /\.\.\.agentRows,/u)
})

test('the frame router reads /app/ as /app, so the app root answers with or without the slash', () => {
  assert.match(
    ideProfilePlan(input).overlay,
    /- id: acryl-router\n {6}name: acrylblends\/cordis\/router\n {6}config:\n {8}trailingSlash: ignore\n/u,
  )
})

test("the overlay keeps the first chat's workspace in the app's own data home", () => {
  assert.match(
    ideProfilePlan(input).overlay,
    // The launcher sets DSH_HOME to the home the app's family chose, before any row loads: the overlay names no folder of its own.
    /- id: workspace-controller\n {2}config:\n {4}documentsDirectory: !!js process\.env\.DSH_HOME\n/u,
  )
})

test("the overlay gives the chat driver's connection our trust fact, not DSH's web runtime", () => {
  assert.match(
    ideProfilePlan(input).overlay,
    // The public host of a hosted app (ACRYL_PUBLIC_ORIGIN) is trusted beside the loopback, read when the row is composed.
    /- id: connection\n {2}inject: \[\]\n {2}config:\n {4}trustedHosts: !!js "\['127\.0\.0\.1', \.\.\.\(process\.env\.ACRYL_PUBLIC_ORIGIN \? \[new URL\(process\.env\.ACRYL_PUBLIC_ORIGIN\)\.host\] : \[\]\)\]"\n/u,
  )
})

test('the overlay parses, and the trusted hosts are one expression the loader evaluates, which names the public host when one is set', () => {
  const js = { tag: 'tag:yaml.org,2002:js', resolve: (source: string) => ({ js: source }) }
  const rows = parse(ideProfilePlan(input).overlay, { customTags: [js] }) as Array<{
    id: string
    config?: { trustedHosts?: { js: string } }
  }>
  const source = rows.find((row) => row.id === 'connection')?.config?.trustedHosts?.js
  assert.equal(typeof source, 'string')
  const hosts = (origin: string | undefined) =>
    new Function('process', `return ${String(source)}`)({
      env: origin === undefined ? {} : { ACRYL_PUBLIC_ORIGIN: origin },
    })
  assert.deepEqual(hosts(undefined), ['127.0.0.1'])
  assert.deepEqual(hosts('https://my-app.webboxes.ai'), ['127.0.0.1', 'my-app.webboxes.ai'])
})

test("the manifest carries the DSH pin, the framework, the frame packages, and keeps the app's own keys", () => {
  const existing = JSON.stringify({
    name: 'my-app',
    scripts: { start: 'node src/main.ts' },
    dependencies: { yaml: '^2.9.0' },
  })
  const manifest = JSON.parse(ideProfilePlan(input, existing).packageJson)
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-base'], '0.2.0-rc.2')
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-web-app'], '0.2.0-rc.2')
  assert.equal(manifest.dependencies['@deepseek-ai/dsh'], undefined)
  assert.equal(manifest.dependencies.acrylblends, '^1.0.10')
  assert.equal(manifest.dependencies['acryl-web-service'], 'file:../acryl-web-service')
  assert.equal(manifest.dependencies.yaml, '^2.9.0')
  assert.equal(manifest.scripts.start, 'node src/main.ts')
})

test("the launcher listens on the app's own stable port, so a restart keeps the frame's origin and its cookie", () => {
  const plan = ideProfilePlan(input)
  // The app's own family chooses the app, its home and its port once: this folder, or the source a desktop product names.
  assert.match(
    plan.hostScript,
    /const chosen = selectInstance\(\{ projectRoot: frameworkRoot, env: process\.env \}\)\nconst appRoot = chosen\.root\nconst home = chosen\.home\n/u,
  )
  assert.match(plan.hostScript, /const port = String\(chosen\.port\.start\)/u)
  assert.doesNotMatch(plan.hostScript, /process\.env\.ACRYLBLENDS_HOME/u)
  assert.doesNotMatch(plan.hostScript, /ACRYLBLENDS_PORT \?\? '0'/u)
})

test("the launcher installs the app's generation hook before DSH or any row of the app loads, so the app's code can be loaded again", () => {
  const { hostScript } = ideProfilePlan(input)
  const hook = hostScript.indexOf("import('acryl-blends-frame/app-generation')")
  assert.ok(hook > 0, "the launcher loads the frame package's hook")
  assert.match(hostScript, /installAppGeneration\(\{ appRoot \}\)/u)
  assert.ok(
    hook < hostScript.indexOf("import('@deepseek-ai/dsh-app-boot')"),
    'before the boot imports any row',
  )
  // A frame package that predates the hook is a missing subpath: tolerated; any other failure is not.
  assert.match(hostScript, /ERR_PACKAGE_PATH_NOT_EXPORTED/u)
  assert.match(hostScript, /throw error/u)
})

test("the launcher writes every layer's rows as absolute URLs, so a Settings write that re-reads the profile cannot point an app row into the bundle", () => {
  const { hostScript } = ideProfilePlan(input)
  // The composition is a profile bundle; DSH re-reads it through the bundle's own package and anchors a relative insert name at the bundle directory
  // (the rule this mirrors). A relative `./src/frame.ts` then becomes `<app>/.acrylblends/node_modules/acrylblends-frame/src/frame.ts` on the first
  // Settings write, and the frame's next reload reports "Not reloaded: Cannot find module ...". The launcher anchors each layer at the directory the
  // layer was written for, so boot, a Settings reconcile and a reload import the same file.
  assert.match(hostScript, /import \{ dirname, isAbsolute, join, resolve \} from 'node:path'/u)
  assert.match(hostScript, /function anchorRows\(patches, baseDir\) \{/u)
  assert.match(hostScript, /row\.name = pathToFileURL\(resolve\(baseDir, row\.name\)\)\.href/u)
  // The app's overlay and the host's own rows belong to the app folder; the overlay file is the framework's, read beside the launcher.
  assert.match(
    hostScript,
    /const frameLayer = anchorRows\(load\(readFileSync\(join\(frameworkRoot, 'cordis\.patch\.yml'\), 'utf8'\)\) \?\? \[\], appRoot\)/u,
  )
  assert.match(hostScript, /const hostLayer = anchorRows\(\[\{/u)
  assert.match(hostScript, /\}\], appRoot\)/u)
  // The settings document belongs to the app's home, and a DSH bundle's own relative rows belong to that package.
  assert.match(
    hostScript,
    /const settingsLayer = anchorRows\(load\(readFileSync\(settingsPath, 'utf8'\)\) \?\? \[\], home\)/u,
  )
  assert.match(
    hostScript,
    /return anchorRows\(list\.flatMap\(\(file\) => load\(readFileSync\(join\(dir, file\), 'utf8'\)\) \?\? \[\]\), dir\)/u,
  )
})

test('applying twice changes nothing the second time', () => {
  const root = folder()
  const first = applyIdeProfile(root, input)
  assert.deepEqual([...first.written].sort(), [
    'app/runtime.mjs',
    'cordis.patch.yml',
    'cordis.yml',
    'package.json',
    'pnpm-workspace.yaml',
    'scripts/ide-host.mjs',
  ])
  const bytes = [
    'app/runtime.mjs',
    'cordis.patch.yml',
    'cordis.yml',
    'package.json',
    'pnpm-workspace.yaml',
    'scripts/ide-host.mjs',
  ].map((file) => readFileSync(join(root, file), 'utf8'))
  const second = applyIdeProfile(root, input)
  assert.deepEqual(second.written, [])
  assert.deepEqual([...second.unchanged].sort(), [
    'app/runtime.mjs',
    'cordis.patch.yml',
    'cordis.yml',
    'package.json',
    'pnpm-workspace.yaml',
    'scripts/ide-host.mjs',
  ])
  assert.deepEqual(
    bytes,
    [
      'app/runtime.mjs',
      'cordis.patch.yml',
      'cordis.yml',
      'package.json',
      'pnpm-workspace.yaml',
      'scripts/ide-host.mjs',
    ].map((file) => readFileSync(join(root, file), 'utf8')),
  )
})

test('a hand edit to an unrelated key survives, and the generated fields are put back', () => {
  const root = folder()
  applyIdeProfile(root, input)
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  manifest.version = '0.2.0'
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const again = applyIdeProfile(root, input)
  assert.deepEqual(again.written, [])
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '0.2.0')
})

test('a product rooted in the workbench (acrylblends.root: workspace) keeps its workbench row when the overlay is regenerated (spec 051 T034)', () => {
  const rootRow = (overlay: string) =>
    (
      parse(overlay) as {
        insert?: { id: string; name: string; config?: Record<string, unknown> }[]
      }[]
    )
      .flatMap((block) => block.insert ?? [])
      .filter((row) => row.id === 'acryl-blends-frame' || row.id === 'acryl-workspace')
  const blend = folder()
  writeFileSync(join(blend, 'package.json'), '{ "name": "my-app", "private": true }\n')
  assert.deepEqual(
    rootRow(planIdeProfileWrite(blend, input).plan.overlay).map((row) => row.id),
    ['acryl-blends-frame'],
  )

  const product = folder()
  writeFileSync(
    join(product, 'package.json'),
    '{ "name": "acryl-ade", "private": true, "acrylblends": { "root": "workspace" } }\n',
  )
  const overlay = planIdeProfileWrite(product, input).plan.overlay
  assert.deepEqual(
    rootRow(overlay).map((row) => [row.id, row.name]),
    [['acryl-workspace', '@acryldev/workspace']],
  )
  assert.match(overlay, /openFolder: !!js process\.env\.ACRYL_OPEN_FOLDER/)
  assert.doesNotMatch(overlay, /identity:/)
  // An upgrade passes the frame packages under their published names, with the row id beside them.
  const published = FRAME_PACKAGES.map((entry) =>
    entry.name === 'acryl-system-prompt'
      ? { ...entry, name: '@acryldev/system-prompt', row: 'acryl-system-prompt' }
      : entry,
  )
  assert.doesNotMatch(
    ideProfilePlan({ ...input, root: 'workspace', packages: published }).overlay,
    /identity:/,
  )
  assert.match(planIdeProfileWrite(blend, input).plan.overlay, /identity:/)
  // The frame package stays installed: the host imports its app generation.
  assert.match(
    ideProfilePlan({ ...input, root: 'workspace' }).hostScript,
    /blends-frame\/app-generation|acryl-blends-frame\/app-generation/,
  )

  writeFileSync(
    join(product, 'package.json'),
    '{ "name": "x", "acrylblends": { "root": "ide" } }\n',
  )
  assert.throws(() => planIdeProfileWrite(product, input), /acrylblends.root is "ide"/)
})

test('an upgraded app installs a frame package once, under its new scope (spec 051 T036)', () => {
  const app = folder()
  writeFileSync(
    join(app, 'package.json'),
    `${JSON.stringify({ name: 'my-app', dependencies: { '@acrylblends/web': '^0.1.0', '@acrylblends/unrelated': '1.0.0', 'left-pad': '1.0.0' } })}\n`,
  )
  const published = FRAME_PACKAGES.map((entry) =>
    entry.name === 'acryl-web-service' ? { ...entry, name: '@acryldev/web', spec: '0.2.0' } : entry,
  )
  const deps = JSON.parse(
    planIdeProfileWrite(app, { ...input, packages: published }).plan.packageJson,
  ).dependencies
  assert.equal(deps['@acryldev/web'], '0.2.0')
  assert.equal(deps['@acrylblends/web'], undefined)
  // Not a frame package under the new scope: the app's own, kept.
  assert.equal(deps['@acrylblends/unrelated'], '1.0.0')
  assert.equal(deps['left-pad'], '1.0.0')
})

test('the door drives the canvas page of a framed app, and the window itself of a workbench product (spec 051 T022)', () => {
  const doorRow = (overlay: string) =>
    (parse(overlay) as { insert?: { id: string; config?: Record<string, unknown> }[] }[])
      .flatMap((block) => block.insert ?? [])
      .find((row) => row.id === 'acryl-door')
  // A Blend: the frame's page is not the app, so the script stays out of it and paths go to the canvas prefix.
  assert.deepEqual(doorRow(ideProfilePlan({ ...input, door: true }).overlay)?.config, {
    hostIndex: false,
    appBase: '/app',
  })
  // ACRYL ADE: the window is the app the chat and the terminal agents drive, so the door's defaults put its script in that page.
  const workbench = doorRow(ideProfilePlan({ ...input, door: true, root: 'workspace' }).overlay)
  assert.equal(workbench?.id, 'acryl-door')
  assert.equal(workbench?.config, undefined)
})
