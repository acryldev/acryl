import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { parse } from 'yaml'
import { compose, loadManifest, ManifestError, validate } from '../index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function file(text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
  dirs.push(dir)
  const path = join(dir, 'blend.yaml')
  writeFileSync(path, text)
  return path
}

const GOOD = `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acrylblends.shop, name: shop, version: 1.0.0 }
spec:
  runtime: cordis
  parameters:
    greeting: { type: string, default: hello }
    port: { type: number, default: 3000 }
  rows:
    - id: greeter
      name: greeter
      config: { text: "{{parameters.greeting}}, world", port: "{{parameters.port}}" }
    - id: second-greeter
      name: greeter
      disabled: true
`

test('resolves parameters: a whole token keeps its type, an embedded one renders as text', () => {
  const manifest = loadManifest(file(GOOD), { known: ['greeter'], values: { greeting: 'hi' } })
  assert.deepEqual(manifest.plugins[0], {
    id: 'greeter',
    use: 'greeter',
    config: { text: 'hi, world', port: 3000 },
  })
  assert.equal(manifest.plugins[1]?.use, 'greeter')
  assert.match(manifest.digest, /^[0-9a-f]{64}$/)
})

test('reports every problem with a path and a code, never a bare "invalid"', () => {
  const problems = validate(
    {
      apiVersion: 'blends.acryl.dev/v1alpha1',
      kind: 'Blueprint',
      metadata: { id: 'Shop', name: '', version: '1', surprise: 1 },
      spec: {
        runtime: 'cordis',
        parameters: {
          unused: { type: 'string', default: 'x' },
          wrong: { type: 'number', default: 'nope' },
          described: { type: 'string', default: 'x', description: 'not in the format' },
        },
        rows: [
          {
            id: 'a',
            name: 'a',
            config: { x: '{{parameters.missing}} {{parameters.wrong}} {{parameters.described}}' },
          },
          { id: 'a', name: 'ghost', extra: 1 },
        ],
      },
      extra: true,
    },
    ['a'],
  ).map((d) => `${d.code} ${d.path}`)
  assert.deepEqual(problems.sort(), [
    'dangling-parameter-reference spec.rows[0].config.x',
    'duplicate-row-id spec.rows[1].id',
    'parameter-type-mismatch spec.parameters.wrong.default',
    'schema-error extra',
    'schema-error metadata.id',
    'schema-error metadata.name',
    'schema-error metadata.surprise',
    'schema-error metadata.version',
    'schema-error spec.parameters.described.description',
    'schema-error spec.rows[1].extra',
    'unknown-plugin spec.rows[1].name',
    'unused-parameter spec.parameters.unused',
  ])
})

/** A Blueprint and a Blend made from it, as files, with a lookup by definition id. */
const BLUEPRINT = `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.shop, name: Shop, version: 1.0.0 }
spec:
  runtime: cordis
  parameters:
    host: { type: string, default: 127.0.0.1 }
  rows:
    - id: http
      name: http
    - id: routes
      name: routes
      config: { title: base, tags: [a] }
    - id: server
      name: server
      config: { hostname: "{{parameters.host}}", port: 3000 }
`
const BLEND = `apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.my-shop, name: my-shop, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 }
  parameters:
    port: { type: number, default: 8080 }
  overrides:
    - id: server
      config: { port: "{{parameters.port}}" }
    - id: routes
      disabled: true
  rows:
    - id: cache
      name: cache
`

function blendWith(blueprint: string, blend: string) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'shop.yaml'), blueprint)
  writeFileSync(join(dir, 'blend.yaml'), blend)
  return {
    blend: join(dir, 'blend.yaml'),
    blueprints: (id: string) => (id === 'acme.shop' ? join(dir, 'shop.yaml') : undefined),
    dir,
  }
}

test('a Blend resolves over its Blueprint: inherited rows first, overrides merged by id, own rows after', () => {
  const { blend, blueprints } = blendWith(BLUEPRINT, BLEND)
  const resolved = loadManifest(blend, {
    getBlueprint: blueprints,
    known: ['http', 'routes', 'server', 'cache'],
  })
  assert.deepEqual(resolved.plugins, [
    { id: 'http', use: 'http' },
    { id: 'routes', use: 'routes', config: { title: 'base', tags: ['a'] }, disabled: true },
    // a shallow merge: the override sets port (and takes the Blend's parameter), the parent's hostname is kept, with the parent's default
    { id: 'server', use: 'server', config: { hostname: '127.0.0.1', port: 8080 } },
    { id: 'cache', use: 'cache' },
  ])
  assert.deepEqual(resolved.values, { port: 8080 })
})

test("the Blend's own parameters apply to its overrides, and the parent keeps its defaults", () => {
  const { blend, blueprints } = blendWith(BLUEPRINT, BLEND)
  const resolved = loadManifest(blend, { getBlueprint: blueprints, values: { port: 9000 } })
  assert.equal(resolved.plugins.find((row) => row.id === 'server')?.config?.port, 9000)
  assert.equal(resolved.plugins.find((row) => row.id === 'server')?.config?.hostname, '127.0.0.1')
})

const codes = (run: () => unknown) => {
  try {
    run()
  } catch (error) {
    return error instanceof ManifestError
      ? error.diagnostics.map((d) => `${d.code} ${d.path}`).sort()
      : [String(error)]
  }
  return []
}

test('Blend rules: lineage, parent, overrides and collisions are each a diagnostic with a path', () => {
  const noLineage = BLEND.replace(
    '  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 }\n',
    '',
  )
  assert.deepEqual(
    codes(() => loadManifest(blendWith(BLUEPRINT, noLineage).blend)),
    ['blend-without-lineage spec.lineage', 'overrides-without-parent spec.overrides'],
  )
  const _blueprintWithLineage = BLUEPRINT.replace(
    '  runtime: cordis\n',
    '  runtime: cordis\n  lineage: { blueprint: acme.base, blueprintVersion: 1.0.0 }\n',
  )
  assert.deepEqual(
    codes(() =>
      loadManifest(blendWith(BLUEPRINT, BLEND.replace('kind: Blend', 'kind: Blueprint')).blend),
    ),
    ['blueprint-with-lineage spec.lineage', 'overrides-without-parent spec.overrides'],
  )
  const mismatch = BLEND.replace(
    '  runtime: cordis\n',
    '  runtime: cordis\n  extends: acme.other\n',
  )
  assert.deepEqual(
    codes(() =>
      loadManifest(blendWith(BLUEPRINT, mismatch).blend, { getBlueprint: () => undefined }),
    ),
    ['lineage-extends-mismatch spec.extends', 'parent-not-supplied spec.extends'],
  )
  const { blend } = blendWith(BLUEPRINT, BLEND)
  assert.deepEqual(
    codes(() => loadManifest(blend)),
    ['parent-not-supplied spec.lineage.blueprint'],
  )
})

test('an override of a row the parent does not have, and an own row that reuses a parent id, are reported', () => {
  const bad = BLEND.replace(
    '    - id: routes\n      disabled: true',
    '    - id: ghost\n      disabled: true',
  ).replace('    - id: cache\n      name: cache', '    - id: http\n      name: http')
  const { blend, blueprints } = blendWith(BLUEPRINT, bad)
  assert.deepEqual(
    codes(() => loadManifest(blend, { getBlueprint: blueprints })),
    ['insert-id-collision spec.rows[0].id', 'override-unknown-id spec.overrides[1].id'],
  )
})

test('a cycle in the chain, an invalid parent and an inherited row with no plugin are all reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-test-'))
  dirs.push(dir)
  const a = `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata: { id: acme.a, name: a, version: 1.0.0 }\nspec: { runtime: cordis, extends: acme.b }\n`
  const b = a
    .replace('acme.a, name: a', 'acme.b, name: b')
    .replace('extends: acme.b', 'extends: acme.a')
  writeFileSync(join(dir, 'a.yaml'), a)
  writeFileSync(join(dir, 'b.yaml'), b)
  const lookup = (id: string) =>
    ({ 'acme.a': join(dir, 'a.yaml'), 'acme.b': join(dir, 'b.yaml') })[id]
  const root = join(dir, 'blend.yaml')
  writeFileSync(
    root,
    a.replace('acme.a, name: a', 'me.app, name: app').replace('extends: acme.b', 'extends: acme.a'),
  )
  assert.ok(
    codes(() => loadManifest(root, { getBlueprint: lookup })).some((entry) =>
      entry.startsWith('parent-cycle'),
    ),
  )

  writeFileSync(join(dir, 'broken.yaml'), 'kind: nope\n')
  const broken = codes(() =>
    loadManifest(blendWith(BLUEPRINT, BLEND).blend, {
      getBlueprint: () => join(dir, 'broken.yaml'),
    }),
  )
  assert.ok(broken.length > 0 && broken.every((entry) => entry.includes("parent 'acme.shop': ")))

  const { blend, blueprints } = blendWith(BLUEPRINT, BLEND)
  assert.deepEqual(
    codes(() =>
      loadManifest(blend, { getBlueprint: blueprints, known: ['http', 'routes', 'cache'] }),
    ),
    ["unknown-plugin resolved row 'server'"],
  )
})

test('loadManifest throws every diagnostic at once, including a bad override', () => {
  assert.throws(
    () =>
      loadManifest(file(GOOD), {
        known: ['greeter'],
        values: { port: 'eighty' as never, nothing: 1 },
      }),
    (error: unknown) =>
      error instanceof ManifestError &&
      error.diagnostics
        .map((d) => d.code)
        .sort()
        .join() === 'parameter-override-unknown,parameter-type-mismatch',
  )
  assert.throws(() => loadManifest(file('kind: [unclosed')), /parse-error|not a valid app manifest/)
})

test('compose mounts enabled rows in order with their config, and runtime overrides win', async () => {
  const seen: Array<[string, unknown]> = []
  const greeter = {
    name: 'greeter',
    apply: (_: Context, config: unknown) => void seen.push(['greeter', config]),
  }
  const manifest = loadManifest(file(GOOD), { known: ['greeter'] })
  const root = new Context()
  const fibers = await compose(root, manifest, { greeter }, { greeter: { port: 0 } })
  assert.equal(fibers.length, 1)
  assert.deepEqual(seen, [['greeter', { text: 'hello, world', port: 0 }]])
  for (const fiber of fibers) await fiber.dispose()
})

/** The proof that a manifest is a Blend: ACRYL's own JSON schema (copied from runtime/blends-core, MIT) accepts it. */
const schema = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./blend-manifest.v1alpha1.schema.json', import.meta.url)),
    'utf8',
  ),
)
const accepts = new Ajv2020({ allErrors: true }).compile(schema)

test("a manifest this plugin accepts is a valid ACRYL blend.yaml: the test fixture and both templates pass ACRYL's schema", () => {
  assert.equal(accepts(parse(GOOD)), true, JSON.stringify(accepts.errors))
  const templates = fileURLToPath(new URL('../../../packages/cli/templates/', import.meta.url))
  for (const template of readdirSync(templates)) {
    const text = readFileSync(join(templates, template, 'blend.yaml'), 'utf8').replaceAll(
      '__APP_NAME__',
      'my-app',
    )
    const document = parse(text)
    assert.equal(accepts(document), true, `${template}: ${JSON.stringify(accepts.errors)}`)
    assert.deepEqual(validate(document), [], template)
  }
})

test("ACRYL's schema accepts a Blend too", () => {
  assert.equal(accepts(parse(BLEND)), true, JSON.stringify(accepts.errors))
  assert.equal(accepts(parse(BLUEPRINT)), true, JSON.stringify(accepts.errors))
})

test('and the schema rejects what this plugin rejects, so the two agree on a document with an unknown field', () => {
  const document = parse(GOOD)
  document.spec.parameters.greeting.description = 'not allowed'
  assert.equal(accepts(document), false)
  assert.ok(
    validate(document, ['greeter']).some((d) => d.path === 'spec.parameters.greeting.description'),
  )
})
