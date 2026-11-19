import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  type AppTree,
  appTree,
  inProgram,
  isFrameworkPackage,
  readProduct,
  servedFrom,
} from '../bundle.ts'

// Real path: Node names modules by it (macOS's temporary folder is behind /var -> /private/var).
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'instance-bundle-')))
after(() => rmSync(scratch, { recursive: true, force: true }))
const instanceDir = dirname(dirname(fileURLToPath(import.meta.url)))

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** A package that says which copy it is. */
function pkg(dir: string, name: string, who: string): void {
  write(join(dir, 'package.json'), JSON.stringify({ name, type: 'module', main: 'index.js' }))
  write(join(dir, 'index.js'), `export const who = ${JSON.stringify(who)}\n`)
}

/**
 * A product as it lies on disk: the bundle (the Program, with this plugin's own files in it, as the frame host runs them) and one app's source under a
 * root whose path has a space and a non-ASCII letter, as `~/Library/Application Support` and a person's home do.
 */
function product(): { bundle: string; source: string } {
  const bundle = join(scratch, 'Bündle App', 'Resources', 'app')
  const source = join(scratch, 'Application Support', 'Zoë Blank', 'apps', 'blank-3f2a', 'source')
  write(
    join(bundle, 'product.json'),
    JSON.stringify({
      product: 'Zoë Blank',
      appName: 'Blank',
      program: ['node_modules/', 'plugins/fw/', 'plugins/instance/', 'frame/', 'cordis.yml'],
    }),
  )
  write(
    join(bundle, 'package.json'),
    JSON.stringify({ type: 'module', imports: { '#fw-jsx': './plugins/fw/jsx.js' } }),
  )
  write(join(bundle, 'plugins', 'fw', 'jsx.js'), "export const who = 'bundle'\n")
  cpSync(instanceDir, join(bundle, 'plugins', 'instance'), {
    recursive: true,
    filter: (path) => !path.includes(`${join('instance', 'test')}`),
  })
  pkg(join(bundle, 'node_modules', '@acryldev', 'blends'), '@acryldev/blends', 'bundle')
  pkg(join(bundle, 'node_modules', '@deepseek-ai', 'cordis'), '@deepseek-ai/cordis', 'bundle')
  pkg(join(bundle, 'node_modules', 'shared-dep'), 'shared-dep', 'bundle')
  write(join(bundle, 'plugins', 'fw', 'index.js'), "export const who = 'bundle'\n")
  // A Program file that imports the person's code by a path relative to itself (frame/app-plugins.mjs imports ../src/app.ts).
  write(
    join(bundle, 'frame', 'entry.mjs'),
    "const app = await import('../src/app.mjs')\nconsole.log(JSON.stringify(app.report))\n",
  )
  // The bundle's own copy of the starting app's src: never what runs once the person has a source.
  write(join(bundle, 'src', 'app.mjs'), "export const report = { from: 'bundle src' }\n")

  write(join(source, 'package.json'), '{"type":"module"}\n')
  write(
    join(source, 'src', 'app.mjs'),
    [
      "import { createRequire } from 'node:module'",
      "import * as fw from '../plugins/fw/index.js'",
      "import * as framework from '@acryldev/blends'",
      "import * as cordis from '@deepseek-ai/cordis'",
      "import * as shared from 'shared-dep'",
      "import * as mine from 'person-dep'",
      "import * as jsx from '#fw-jsx'",
      'const require = createRequire(import.meta.url)',
      'export const report = {',
      "  from: 'source src',",
      '  fw: fw.who,',
      '  framework: framework.who,',
      '  cordis: cordis.who,',
      '  shared: shared.who,',
      '  mine: mine.who,',
      '  mineSees: mine.sees,',
      '  jsx: jsx.who,',
      "  requiredJsx: require('#fw-jsx').who,",
      "  required: require('@acryldev/blends').who,",
      "  resolved: require.resolve('@acryldev/blends'),",
      "  importResolved: import.meta.resolve('@deepseek-ai/cordis'),",
      '}',
      '',
    ].join('\n'),
  )
  // What the person added: a package of theirs, carrying its own copies of the framework, and a stale copy of a framework plugin and of the framework.
  write(
    join(source, 'node_modules', 'person-dep', 'package.json'),
    JSON.stringify({ name: 'person-dep', type: 'module', main: 'index.js' }),
  )
  write(
    join(source, 'node_modules', 'person-dep', 'index.js'),
    "import * as a from '@acryldev/blends'\nimport * as c from '@deepseek-ai/cordis'\nexport const who = 'source'\nexport const sees = [a.who, c.who]\n",
  )
  pkg(
    join(source, 'node_modules', 'person-dep', 'node_modules', '@acryldev', 'blends'),
    '@acryldev/blends',
    'person-dep copy',
  )
  pkg(
    join(source, 'node_modules', 'person-dep', 'node_modules', '@deepseek-ai', 'cordis'),
    '@deepseek-ai/cordis',
    'person-dep copy',
  )
  pkg(join(source, 'node_modules', '@acryldev', 'blends'), '@acryldev/blends', 'source copy')
  write(join(source, 'plugins', 'fw', 'index.js'), "export const who = 'stale source copy'\n")
  return { bundle, source }
}

const made = product()

/** Run the bundle's Program file as the frame host runs: the overlay preloaded from the bundle, in the source, with the source named. */
function run(runtime: string, extraEnv: Record<string, string> = {}) {
  return spawnSync(
    runtime,
    [
      '--import',
      pathToFileURL(join(made.bundle, 'plugins', 'instance', 'bundle-overlay.ts')).href,
      join(made.bundle, 'frame', 'entry.mjs'),
    ],
    {
      cwd: made.source,
      env: { ...process.env, ACRYLBLENDS_ROOT: made.source, ...extraEnv },
      encoding: 'utf8',
    },
  )
}

function assertBundleFirst(result: ReturnType<typeof run>): void {
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as Record<
    string,
    unknown
  >
  assert.deepEqual(
    { ...report, resolved: undefined, importResolved: undefined },
    {
      from: 'source src',
      fw: 'bundle',
      framework: 'bundle',
      cordis: 'bundle',
      shared: 'bundle',
      mine: 'source',
      mineSees: ['bundle', 'bundle'],
      jsx: 'bundle',
      requiredJsx: 'bundle',
      required: 'bundle',
      resolved: undefined,
      importResolved: undefined,
    },
  )
  assert.equal(
    report.resolved,
    join(made.bundle, 'node_modules', '@acryldev', 'blends', 'index.js'),
    'require.resolve',
  )
  assert.equal(
    report.importResolved,
    pathToFileURL(join(made.bundle, 'node_modules', '@deepseek-ai', 'cordis', 'index.js')).href,
  )
}

/**
 * Node 22 runs `require` through `registerHooks` but not `require.resolve` (22.23.5 measured; 24 runs both). The overlay only ever runs in a desktop
 * product's frame host, on Electron's Node 24, so the claim is tested where it holds.
 */
const HOOKED_REQUIRE_RESOLVE = Number(process.versions.node.split('.')[0]) >= 24

test('the framework resolves from the bundle first, even for a package of the person’s that carries its own acrylblends and @deepseek-ai/cordis', {
  skip: HOOKED_REQUIRE_RESOLVE
    ? false
    : 'Node 22 does not run require.resolve through registerHooks; a product host runs Node 24',
}, () => {
  // The person's src runs (not the bundle's copy), its framework plugin and its framework come from the bundle although the source has stale copies of
  // both, its own package comes from the source, and a package only the bundle has serves it. require, require.resolve and import.meta.resolve agree.
  assertBundleFirst(run(process.execPath))
})

test('the same on Electron’s own Node, as the packaged frame host runs (ACRYLBLENDS_TEST_ELECTRON names the binary)', {
  skip: process.env.ACRYLBLENDS_TEST_ELECTRON === undefined,
}, () => {
  assertBundleFirst(run(process.env.ACRYLBLENDS_TEST_ELECTRON ?? '', { ELECTRON_RUN_AS_NODE: '1' }))
})

test('outside a product the overlay is not installed: the app is one folder and resolves as it always has', () => {
  assert.equal(appTree({}, made.bundle), undefined)
  // The source named but no product marker: an app made with `acrylblends init`.
  assert.equal(appTree({ ACRYLBLENDS_ROOT: made.source }, made.source), undefined)
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      pathToFileURL(join(made.bundle, 'plugins', 'instance', 'bundle-overlay.ts')).href,
      join(made.bundle, 'frame', 'entry.mjs'),
    ],
    { cwd: made.bundle, env: { ...process.env, ACRYLBLENDS_ROOT: '' }, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout.trim()), { from: 'bundle src' })
})

test('a path of the tree is served from its half: the Program from the bundle, everything else from the source, outside paths untouched', () => {
  const tree: AppTree = {
    bundle: 'file:///B/app/',
    source: 'file:///S/My%20App/source/',
    program: ['node_modules/', 'plugins/router/', 'cordis.yml'],
  }
  assert.equal(
    servedFrom('file:///S/My%20App/source/plugins/router/src/index.ts', tree),
    'file:///B/app/plugins/router/src/index.ts',
  )
  assert.equal(
    servedFrom('file:///B/app/src/app.ts?generation=3', tree),
    'file:///S/My%20App/source/src/app.ts?generation=3',
  )
  assert.equal(servedFrom('file:///B/app/cordis.yml', tree), 'file:///B/app/cordis.yml')
  assert.equal(
    servedFrom('file:///S/My%20App/source/plugins/notes/index.ts', tree),
    'file:///S/My%20App/source/plugins/notes/index.ts',
  )
  assert.equal(servedFrom('file:///elsewhere/x.js', tree), 'file:///elsewhere/x.js')
  // `plugins/router-extra/` is not `plugins/router/`.
  assert.equal(inProgram(tree.program, 'plugins/router-extra/index.ts'), false)
  assert.equal(inProgram(tree.program, 'cordis.yml.bak'), false)
})

test('framework names are the framework’s namespaces only', () => {
  for (const name of [
    'acrylblends',
    '@acryldev/blends/cordis/router',
    '@acryldev/blends-frame/app-generation',
    '@acryldev/brand-client',
    '@acryldev/ui',
    '@deepseek-ai/cordis',
    '@acryldev/ui',
    '@acryldev/blends-core',
  ])
    assert.equal(isFrameworkPackage(name), true, name)
  for (const name of ['acrylblendsx', 'react', 'zod', '@types/node', 'my-acryl-thing'])
    assert.equal(isFrameworkPackage(name), false, name)
})

test('product.json: a Program path that leaves the tree is ignored, never followed', () => {
  const bundle = join(scratch, 'marker')
  write(
    join(bundle, 'product.json'),
    JSON.stringify({
      product: 'P',
      program: ['node_modules/', '../escape/', '/abs', 'a/./b', 'win\\path', 'ok.yml', 3],
    }),
  )
  assert.deepEqual(readProduct(bundle), {
    product: 'P',
    appName: 'P',
    program: ['node_modules/', 'ok.yml'],
  })
})

test('product.json: named is read only as true; a finished Blend product says it, the Blank product leaves it out', () => {
  const bundle = join(scratch, 'named')
  write(
    join(bundle, 'product.json'),
    JSON.stringify({ product: 'ACRYL ADE', program: [], named: true }),
  )
  assert.equal(readProduct(bundle)?.named, true)
  write(
    join(bundle, 'product.json'),
    JSON.stringify({ product: 'ACRYL Blends', program: [], named: 'yes' }),
  )
  assert.equal(readProduct(bundle)?.named, undefined)
})

test('product.json: releases keeps a valid tag prefix and drops one that is not a tag prefix', () => {
  const bundle = join(scratch, 'releases')
  const releases = (tagPrefix: unknown) => {
    write(
      join(bundle, 'product.json'),
      JSON.stringify({
        product: 'ACRYL ADE',
        program: [],
        releases: { repo: 'acryldev/acryl', file: 'ACRYL-ADE', tagPrefix },
      }),
    )
    return readProduct(bundle)?.releases
  }
  assert.deepEqual(releases('ade-v'), {
    repo: 'acryldev/acryl',
    file: 'ACRYL-ADE',
    tagPrefix: 'ade-v',
  })
  assert.deepEqual(releases('../x y'), { repo: 'acryldev/acryl', file: 'ACRYL-ADE' })
  assert.deepEqual(releases(undefined), { repo: 'acryldev/acryl', file: 'ACRYL-ADE' })
})
