// planUpgrade / applyUpgrade: an upgrade is a plan before it is an action. Conflicts are the diagnostics resolution already has; bad
// input is a diagnostic, never a throw; applying moves the lineage version and nothing else.
import { describe, expect, it } from 'vitest'

import type { BlendDocument } from '../../src/document.js'
import { parseDefinition } from '../../src/parse.js'
import { applyUpgrade, planUpgrade, type UpgradePlan } from '../../src/upgrade.js'
import { validateDefinition } from '../../src/validate.js'
import { GOLDEN, loadValidDefinition } from '../helpers.js'

function load(source: string): BlendDocument {
  const { document, diagnostics } = parseDefinition(source)
  expect([...diagnostics, ...validateDefinition(document, 'local-authoring')]).toEqual([])
  return document as BlendDocument
}

const blueprint = (version: string, rows: string, extra = '') => `apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata: { id: acme.shop, name: Shop, version: ${version} }
spec:
  runtime: cordis
${extra}  rows:
${rows}`

const V1_ROWS = `    - id: http
      name: http
    - id: routes
      name: routes
      config: { title: base }
    - id: server
      name: server
      config: { port: 3000 }
`

const BLEND = `# my shop: a Blend of acme.shop
apiVersion: blends.acryl.dev/v1alpha1
kind: Blend
metadata: { id: me.my-shop, name: my-shop, version: 0.1.0 }
spec:
  runtime: cordis
  lineage: { blueprint: acme.shop, blueprintVersion: 1.0.0 } # moves on upgrade
  overrides:
    - id: server
      config: { port: 8080 }
    - id: routes
      disabled: true
  rows:
    - id: cache
      name: cache
`

const old = load(blueprint('1.0.0', V1_ROWS))
const blend = load(BLEND)

function plan(next: BlendDocument, document = blend): UpgradePlan {
  const result = planUpgrade({ blend: document, oldBlueprint: old, newBlueprint: next })
  expect(result.diagnostics).toEqual([])
  return result.plan as UpgradePlan
}

describe('planUpgrade', () => {
  it('a safe upgrade reports the Blueprint changes, what the overrides hide, and how the resolved rows differ', () => {
    const next = load(
      blueprint(
        '1.1.0',
        `    - id: http
      name: http
    - id: metrics
      name: metrics
    - id: routes
      name: routes
      config: { title: updated }
    - id: server
      name: server
      config: { port: 4000 }
`,
      ),
    )
    const result = plan(next)
    expect(result.blueprintChanges).toEqual([
      { id: 'metrics', change: 'added' },
      { id: 'routes', change: 'changed', fields: ['config'] },
      { id: 'server', change: 'changed', fields: ['config'] },
    ])
    // The Blend sets port itself, so the Blueprint's new port changes nothing for it.
    expect(result.shadowed).toEqual([{ id: 'server', keys: ['port'] }])
    expect(result.appChanges).toEqual([
      { id: 'metrics', change: 'added' },
      { id: 'routes', change: 'changed', fields: ['config'] },
    ])
    expect([result.safe, result.conflicts, result.from, result.to, result.blueprint]).toEqual([true, [], '1.0.0', '1.1.0', 'acme.shop'])
  })

  it('removing a row the Blend overrides is a conflict (override-unknown-id) and the plan is not safe', () => {
    const next = load(blueprint('2.0.0', V1_ROWS.replace(/ {4}- id: routes\n {6}name: routes\n {6}config: \{ title: base \}\n/, '')))
    const result = plan(next)
    expect(result.safe).toBe(false)
    expect(result.conflicts.map((c) => [c.code, c.path])).toEqual([['override-unknown-id', 'spec.overrides[1].id']])
    expect(result.appChanges).toEqual([])
    expect(result.blueprintChanges).toEqual([{ id: 'routes', change: 'removed' }])
  })

  it('a new Blueprint row that reuses the id of one of the Blend’s own rows is a conflict (insert-id-collision)', () => {
    const result = plan(load(blueprint('1.2.0', `${V1_ROWS}    - id: cache\n      name: cache\n`)))
    expect(result.conflicts.map((c) => [c.code, c.path])).toEqual([['insert-id-collision', 'spec.rows[0].id']])
    expect(result.safe).toBe(false)
  })

  it('a renamed or re-enabled row is a change with the right fields', () => {
    const rows = V1_ROWS.replace('name: http', 'name: http2').replace('config: { title: base }', 'config: { title: base }\n      disabled: true')
    const result = plan(load(blueprint('1.3.0', rows)))
    expect(result.blueprintChanges).toEqual([
      { id: 'http', change: 'changed', fields: ['name'] },
      { id: 'routes', change: 'changed', fields: ['disabled'] },
    ])
  })

  it('returns diagnostics, never throws, for input that is not an upgrade', () => {
    const next = load(blueprint('1.1.0', V1_ROWS))
    expect(planUpgrade({ blend: old, oldBlueprint: old, newBlueprint: next }).diagnostics.map((d) => d.code)).toEqual(['upgrade-not-a-blend'])
    const other = load(blueprint('1.1.0', V1_ROWS).replace('acme.shop', 'acme.other'))
    expect(planUpgrade({ blend, oldBlueprint: old, newBlueprint: other }).diagnostics.map((d) => [d.code, d.path])).toEqual([
      ['upgrade-blueprint-mismatch', 'newBlueprint.metadata.id'],
    ])
    const behind = load(blueprint('0.9.0', V1_ROWS))
    expect(planUpgrade({ blend, oldBlueprint: behind, newBlueprint: next }).diagnostics.map((d) => d.code)).toEqual(['upgrade-version-mismatch'])
    expect(planUpgrade({ blend, oldBlueprint: behind, newBlueprint: next }).plan).toBeNull()
  })

  it('a Blueprint with a parent that is not supplied is reported as the resolution diagnostic, with no plan', () => {
    const child = load(
      blueprint('1.1.0', '    - id: extra\n      name: extra\n', '  extends: acme.base\n'),
    )
    const childOld = load(blueprint('1.0.0', '    - id: extra\n      name: extra\n', '  extends: acme.base\n'))
    const result = planUpgrade({ blend, oldBlueprint: childOld, newBlueprint: child })
    expect(result.plan).toBeNull()
    expect(result.diagnostics.map((d) => d.code)).toContain('parent-not-supplied')
  })

  it("over ACRYL's own golden fixtures, upgrading a Blend to the Blueprint it already uses changes nothing", () => {
    const acme = loadValidDefinition(GOLDEN.acme)
    const crm = loadValidDefinition(GOLDEN.crm)
    const result = planUpgrade({ blend: acme, oldBlueprint: crm, newBlueprint: crm })
    expect(result.diagnostics).toEqual([])
    expect(result.plan).toMatchObject({ blueprintChanges: [], appChanges: [], conflicts: [], shadowed: [], safe: true })
  })
})

describe('applyUpgrade', () => {
  const next = load(blueprint('1.1.0', `${V1_ROWS}    - id: metrics\n      name: metrics\n`))

  it('moves the lineage version and nothing else, keeping comments', () => {
    const { source, diagnostics } = applyUpgrade(BLEND, plan(next))
    expect(diagnostics).toEqual([])
    expect(source).toBe(BLEND.replace('blueprintVersion: 1.0.0', 'blueprintVersion: 1.1.0'))
  })

  it('refuses an unsafe plan, and a plan made from a version the file no longer has', () => {
    const unsafe = plan(load(blueprint('1.2.0', `${V1_ROWS}    - id: cache\n      name: cache\n`)))
    expect(applyUpgrade(BLEND, unsafe)).toEqual({ source: null, diagnostics: [expect.objectContaining({ code: 'upgrade-conflicts' })] })
    const safe = plan(next)
    const moved = applyUpgrade(BLEND, safe).source as string
    expect(applyUpgrade(moved, safe).diagnostics.map((d) => d.code)).toEqual(['upgrade-stale-plan'])
    expect(applyUpgrade('kind: [unclosed', safe).diagnostics.map((d) => d.code)).toEqual(['parse-error'])
  })

  it('keeps a !!js expression in the file as written', () => {
    const withJs = BLEND.replace('config: { port: 8080 }', 'config: { port: !!js "8000 + 80" }')
    const result = applyUpgrade(withJs, plan(next, load(withJs)))
    expect(result.diagnostics).toEqual([])
    expect(result.source).toContain('!!js "8000 + 80"')
    expect(result.source).toBe(withJs.replace('blueprintVersion: 1.0.0', 'blueprintVersion: 1.1.0'))
  })
})
