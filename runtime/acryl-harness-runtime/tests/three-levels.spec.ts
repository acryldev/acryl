/**
 * The three levels of the framework (spec 036): the blank canvas (built-in Blueprint), a starter kit (a Blueprint that extends another), and a project
 * (a Blend grown from either). A starter boots as it is; a project grown from a starter keeps it in blueprints/, so it boots anywhere.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BLANK_BLUEPRINT, InvalidBlueprintError, catalogWithStarters, planNewApp, readBlueprintFile, writeNewApp, blueprintFromManifest } from '../src/index.ts'
import { parse } from 'yaml'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const temp = (): string => { const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acryl-levels-'))); dirs.push(dir); return dir }

const starter = `# The sound-stage starter kit.
apiVersion: blends.acryl.dev/v1alpha1
kind: Blueprint
metadata:
  id: acme.sound-stage
  name: Sound Stage
  version: 1.2.0
  license: MIT
  visibility: public
spec:
  runtime: cordis
  extends: acryl.blank
  rows:
    - id: brand
      name: acryl-brand
      config:
        name: Sound Stage
        accent: "#e8590c"
    - id: community-market
      name: cordis-plugin-market
`

describe('three levels', () => {
  it('a starter kit boots as it is: the blank canvas plus what it adds', () => {
    const dir = temp(); writeFileSync(join(dir, 'blend.yaml'), starter)
    const blueprint = readBlueprintFile(join(dir, 'blend.yaml'))
    expect(blueprint.id).toBe('acme.sound-stage')
    expect(blueprint.capabilities).toEqual(BLANK_BLUEPRINT.capabilities)
    expect(blueprint.rows).toEqual([...BLANK_BLUEPRINT.rows, 'community-market'])
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Sound Stage', accent: '#e8590c' }) })
  })

  it('a project from a starter is the user\'s own: private, Proprietary, the starter kept in blueprints/ and its license in THIRD-PARTY.md', () => {
    const root = temp()
    const project = join(root, 'my-gigs')
    writeNewApp(planNewApp(project, { title: 'My Gigs', launcher: '/fw/scripts/blank.mjs', from: { manifestText: starter } }), { git: false })
    const manifest = parse(readFileSync(join(project, 'blend.yaml'), 'utf8')) as Record<string, any>
    expect(manifest.kind).toBe('Blend')
    expect(manifest.spec.extends).toBeUndefined()
    expect(manifest.spec.lineage).toEqual({ blueprint: 'acme.sound-stage', blueprintVersion: '1.2.0' })
    expect(manifest.metadata).toMatchObject({ id: 'app.my-gigs', name: 'My Gigs', license: 'Proprietary', visibility: 'private' })
    expect(readFileSync(join(project, 'blueprints', 'acme.sound-stage.yaml'), 'utf8')).toBe(starter)
    expect(readFileSync(join(project, 'THIRD-PARTY.md'), 'utf8')).toMatch(/acme\.sound-stage \(Sound Stage\), licensed MIT/u)
    const blueprint = readBlueprintFile(join(project, 'blend.yaml'))
    expect(blueprint.id).toBe('app.my-gigs')
    expect(blueprint.rows).toContain('community-market')   // inherited through the starter
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'My Gigs', accent: '#e8590c' }) })
  })

  it('a project from a project brings the chain of starters with it', () => {
    const root = temp()
    const first = join(root, 'my-gigs')
    writeNewApp(planNewApp(first, { title: 'My Gigs', launcher: '/fw', from: { manifestText: starter } }), { git: false })
    const second = join(root, 'my-gigs-eu')
    writeNewApp(planNewApp(second, { title: 'My Gigs EU', launcher: '/fw', from: { manifestText: readFileSync(join(first, 'blend.yaml'), 'utf8') } }), { git: false, blueprintsFrom: join(first, 'blueprints') })
    expect(existsSync(join(second, 'blueprints', 'acme.sound-stage.yaml'))).toBe(true)
    expect(readBlueprintFile(join(second, 'blend.yaml')).rows).toContain('community-market')
  })

  it('an unknown parent and a cycle between starters are refused with a message', () => {
    const orphan = temp(); writeFileSync(join(orphan, 'blend.yaml'), starter.replace('extends: acryl.blank', 'extends: acme.missing'))
    expect(() => readBlueprintFile(join(orphan, 'blend.yaml'))).toThrow(/acme\.missing/)
    const a = { id: 'acme.a', document: parse(starter.replace('acme.sound-stage', 'acme.a').replace('extends: acryl.blank', 'extends: acme.b')) }
    const b = { id: 'acme.b', document: parse(starter.replace('acme.sound-stage', 'acme.b').replace('extends: acryl.blank', 'extends: acme.a')) }
    expect(() => catalogWithStarters([a, b]).get('acme.a')).toThrow(InvalidBlueprintError)
    expect(() => blueprintFromManifest(parse(starter.replace('extends: acryl.blank', 'extends: acme.a')), catalogWithStarters([a, b]))).toThrow(/cycle/)
    void mkdirSync
  })
})
