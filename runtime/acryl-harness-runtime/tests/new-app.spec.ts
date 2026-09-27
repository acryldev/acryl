/** `acryl new` and the app manifest (spec 036): one file format for the Blends tooling and the runtime, and one app shape for every app. */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BLANK_BLUEPRINT,
  IDE_BLUEPRINT,
  InvalidBlueprintError,
  NewAppError,
  blueprintFromEnvironment,
  blueprintFromManifest,
  composeBlueprintRows,
  planNewApp,
  writeNewApp,
} from '../src/index.ts'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const temp = (): string => { const dir = mkdtempSync(join(tmpdir(), 'acryl-new-')); dirs.push(dir); return dir }
const launcher = '/framework/scripts/blank.mjs'

describe('acryl new', () => {
  it('plans the conventional app shape', () => {
    const app = planNewApp('/apps/stage-sound', { title: 'Stage Sound', brand: { accent: '#e8590c' }, launcher })
    expect(Object.keys(app.files).sort()).toEqual(['.gitignore', 'AGENTS.md', 'README.md', 'bin/acryl', 'blend.yaml', 'extensions/README.md'])
    const manifest = parse(app.files['blend.yaml']!) as Record<string, any>
    expect(manifest).toMatchObject({ apiVersion: 'blends.acryl.dev/v1alpha1', kind: 'Blend', metadata: { id: 'app.stage-sound', name: 'Stage Sound' }, spec: { lineage: { blueprint: 'acryl.blank' } } })
    expect(manifest.spec.rows[0]).toMatchObject({ id: 'brand', name: 'acryl-brand', config: { name: 'Stage Sound', accent: '#e8590c' } })
    expect(app.files['bin/acryl']).toContain(JSON.stringify(launcher))
    expect(app.files['AGENTS.md']).toContain('extensions/<name>/')
  })

  it('the manifest it writes boots back into the same Blueprint with the brand', () => {
    const app = planNewApp('/apps/ledger', { title: 'Ledger', launcher })
    const blueprint = blueprintFromManifest(parse(app.files['blend.yaml']!))
    expect(blueprint.id).toBe('app.ledger')
    expect(blueprint.rows).toEqual(BLANK_BLUEPRINT.rows)
    expect(blueprint.capabilities).toEqual(BLANK_BLUEPRINT.capabilities)
    expect(blueprint.brand).toEqual({ kind: 'custom', identity: expect.objectContaining({ name: 'Ledger' }) })
  })

  it('refuses a folder name that cannot be an app, an unknown blueprint, and a non-empty folder', () => {
    expect(() => planNewApp('/apps/My App', { launcher })).toThrow(NewAppError)
    expect(() => planNewApp('/apps/ok', { blueprint: 'acryl.nope', launcher })).toThrow(/unknown blueprint/)
    const dir = join(temp(), 'busy'); mkdirSync(dir); writeFileSync(join(dir, 'mine.txt'), 'x')
    expect(() => writeNewApp(planNewApp(dir, { launcher }))).toThrow(/not empty/)
    expect(readFileSync(join(dir, 'mine.txt'), 'utf8')).toBe('x')
  })

  it('the app is the user\'s product: its own git repository, no ACRYL name in what its users see, license left to them', () => {
    const dir = join(temp(), 'ledger-pro')
    const { git } = writeNewApp(planNewApp(dir, { title: 'Ledger Pro', launcher }))
    expect(git).toBe('initialized')
    expect(existsSync(join(dir, '.git'))).toBe(true)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.dsh/')
    expect(existsSync(join(dir, 'LICENSE'))).toBe(false)   // the user chooses
    const blueprint = blueprintFromEnvironment({ ACRYL_BLUEPRINT: join(dir, 'blend.yaml') })
    expect(blueprint.brand.kind === 'custom' && blueprint.brand.identity.name).toBe('Ledger Pro')
    expect(readFileSync(join(dir, 'blend.yaml'), 'utf8')).not.toMatch(/name: ACRYL|ACRYL Blends app/)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toMatch(/license it however you want, including closed source/)
  })

  it('writes a runnable app whose definition the runtime selects from the environment', () => {
    const dir = join(temp(), 'video-cut')
    expect(writeNewApp(planNewApp(dir, { title: 'Video Cut', launcher }), { git: false }).git).toBe('skipped')
    expect(statSync(join(dir, 'bin', 'acryl')).mode & 0o100).toBeTruthy()
    expect(existsSync(join(dir, 'extensions'))).toBe(true)
    const blueprint = blueprintFromEnvironment({ ACRYL_BLUEPRINT: join(dir, 'blend.yaml') })
    expect(blueprint.id).toBe('app.video-cut')
    expect(composeBlueprintRows(blueprint, 'web').patches.flatMap(patch => patch.insert ?? []).map(row => row.id)).toEqual(['brand', 'extension-context', 'acryl-system-prompt', '@acryl/ui'])
  })
})

describe('reading a Blends manifest', () => {
  const blend = (rows: unknown[]) => ({ apiVersion: 'blends.acryl.dev/v1alpha1', kind: 'Blend', metadata: { id: 'app.x', name: 'X', version: '0.1.0' }, spec: { runtime: 'cordis', lineage: { blueprint: 'acryl.blank', blueprintVersion: '0.1.0' }, rows } })

  it('an ACRYL row turns a capability on, a disabled one turns it off, and any other row is an app plugin left to extensions/', () => {
    const blueprint = blueprintFromManifest(blend([
      { id: 'community-market', name: 'cordis-plugin-market' },
      { id: '@acryl/ui', name: '@acryl/ui', disabled: true },
      { id: 'organizer', name: 'acryl-organizer' },
    ]))
    expect(blueprint.rows).toContain('community-market')
    expect(blueprint.rows).not.toContain('ui-library')
    expect(blueprint.rows).not.toContain('organizer' as never)
  })

  it('a Blueprint manifest names a known Blueprint; the IDE can be selected that way', () => {
    expect(blueprintFromManifest({ apiVersion: 'blends.acryl.dev/v1alpha1', kind: 'Blueprint', metadata: { id: 'acryl.ide', name: 'ACRYL', version: '0.1.0' }, spec: { runtime: 'cordis' } }).rows).toEqual(IDE_BLUEPRINT.rows)
  })

  it('rejects what it cannot boot', () => {
    expect(() => blueprintFromManifest({ ...blend([]), kind: 'Thing' })).toThrow(/kind/)
    expect(() => blueprintFromManifest({ ...blend([]), metadata: { id: 'noDots' } })).toThrow(/metadata.id/)
    expect(() => blueprintFromManifest({ ...blend([]), spec: { runtime: 'cordis', lineage: { blueprint: 'acryl.nope' } } })).toThrow(InvalidBlueprintError)
    expect(() => blueprintFromManifest({ ...blend([{ id: 'x' }]) })).toThrow(/spec\.rows\[0\]\.name/)
  })
})
