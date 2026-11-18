/**
 * The upgrade half of the IDE port: `acrylblends upgrade` brings an app made by the previous published release (1.1.0) onto the frame-hosted layout. The
 * fixture is that release's scaffold (the `legacy/1.1.0` files) in an app the current CLI scaffolded; the upgrade replaces only the template's own files
 * (never a file the app edited) and prints exactly what it changed. A second run changes nothing.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { type Io, init, parseUpgradeOptions, upgrade } from '../src/index'
import { legacyVariants, releasedVariant, variantFromBrokenEra } from '../src/legacy'
import { readLibrary } from '../src/library'
import type { Template } from '../src/templates'
import { frameReport, planFrameStep } from '../src/upgrade'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-upgrade-frame-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
afterEach(() => {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
})

function session(cwd: string) {
  const out: string[] = []
  const err: string[] = []
  const io: Io = {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out: () => out.join(''), err: () => err.join('') }
}

const FRAME_SPECS = JSON.stringify({
  dshVersion: '0.2.0-rc.2',
  frameworkVersion: '^1.0.10',
  packages: {
    'acryl-app-shell': 'file:/checkout/ide/acryl-app-shell',
    'acryl-web': 'file:/checkout/ide/acryl-web',
  },
})

/**
 * An app as the previous published release made it: scaffolded now (which gives it the plugins), then its scaffold replaced by the released files, its
 * frame row removed and the two host plugins (which that release did not carry) dropped.
 */
async function preFrameApp(
  name: string,
  template: Template = 'blank',
  version = '1.1.0',
): Promise<string> {
  delete process.env.ACRYLBLENDS_FRAME_PACKAGES
  const { io } = session(scratch)
  const code = await init(
    {
      directory: name,
      template,
      yes: true,
      name,
      install: false,
      desktop: false,
      quietNext: true,
    },
    io,
  )
  expect(code).toBe(0)
  const root = join(scratch, name)
  const variant = releasedVariant(template, version)
  expect(variant, `no ${version} layout for ${template}`).toBeDefined()
  for (const [file, released] of variant!.files)
    writeFileSync(join(root, file), released.replaceAll('__APP_NAME__', name))
  rmSync(join(root, 'src', 'frame.ts'), { force: true })
  rmSync(join(root, 'frame'), { recursive: true, force: true })
  for (const plugin of ['acryl-page', 'acryl-web-server'])
    rmSync(join(root, 'plugins', plugin), { recursive: true, force: true })
  // No released agent app carried the home page's widgets (the agent template mounts `home` since 1.3.2): neither the plugin nor its row.
  if (template === 'agent') {
    rmSync(join(root, 'plugins', 'home'), { recursive: true, force: true })
    const blend = join(root, 'blend.yaml')
    const withoutHome = readFileSync(blend, 'utf8').replace(
      /^ *# The home page's widgets[^\n]*\n *- id: home\n *name: home\n/mu,
      '',
    )
    expect(withoutHome).not.toContain('name: home')
    writeFileSync(blend, withoutHome)
  }
  expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
  return root
}

const runUpgrade = async (root: string, argv: readonly string[] = []) => {
  const { io, out, err } = session(root)
  const code = await upgrade(parseUpgradeOptions(argv), io)
  return { code, out, err }
}

const read = (root: string, file: string): string => readFileSync(join(root, file), 'utf8')

/** The first release that shipped a variant, for the fixture app's scaffold. */
function versionFor(template: Template, id: string): string {
  const index = JSON.parse(
    readFileSync(new URL('../legacy/layouts.json', import.meta.url), 'utf8'),
  ) as {
    releases: Array<{ version: string; layouts: Record<string, string> }>
  }
  const release = index.releases.find((entry) => entry.layouts[template] === id)
  if (release === undefined) throw new Error(`no release shipped ${template} ${id}`)
  return release.version
}

describe('upgrading a pre-frame app to the host layout', () => {
  it('writes the launcher, the overlay, the runtime row and the frame row, and prints each change', async () => {
    const root = await preFrameApp('framed-later')
    const blendBefore = read(root, 'blend.yaml')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    const overlay = read(root, 'cordis.patch.yml')
    expect(overlay).toContain('- id: app-routes')
    expect(overlay).toContain('name: ./src/frame.ts')
    expect(existsSync(join(root, 'cordis.yml'))).toBe(true)
    expect(existsSync(join(root, 'scripts', 'ide-host.mjs'))).toBe(true)
    expect(existsSync(join(root, 'app', 'runtime.mjs'))).toBe(true)
    expect(existsSync(join(root, 'src', 'frame.ts'))).toBe(true)
    expect(existsSync(join(root, 'plugins', 'acryl-page', 'src', 'index.ts'))).toBe(true)
    expect(existsSync(join(root, 'plugins', 'acryl-web-server', 'src', 'index.ts'))).toBe(true)
    const manifest = JSON.parse(read(root, 'package.json')) as {
      scripts: Record<string, string>
      dependencies: Record<string, string>
    }
    expect(manifest.scripts.dev).toBe(
      'node --import ./plugins/acryl-node-server/src/register.ts scripts/ide-host.mjs',
    )
    // The standalone start is the app's own and does not move.
    expect(manifest.scripts.start).toBe(
      'node --import ./plugins/acryl-node-server/src/register.ts src/main.ts',
    )
    expect(manifest.dependencies['@deepseek-ai/dsh-base']).toBe('0.2.0-rc.2')
    expect(manifest.dependencies['acryl-app-shell']).toBe('file:/checkout/ide/acryl-app-shell')
    // The app's own configuration is untouched.
    expect(read(root, 'blend.yaml')).toBe(blendBefore)
    // The 1.1.0 src/routes.ts the app never edited is still the release's: it becomes the one the frame row mounts (FRAME_MOUNT_PREFIX).
    expect(read(root, 'src/routes.ts')).toContain("export const FRAME_MOUNT_PREFIX = '/app'")
    const report = out()
    expect(report).toMatch(/frame\s+.*src\/frame\.ts added/u)
    expect(report).toMatch(/src\/routes\.ts updated/u)
    expect(report).toMatch(/scripts\/ide-host\.mjs added/u)
    expect(report).toMatch(/cordis\.patch\.yml added/u)
    expect(report).toMatch(/plugins\/acryl-page added/u)
    expect(report).toMatch(/package\.json merged/u)
  })

  it('keeps an edited src/routes.ts exactly, never refuses over it, and says when the frame cannot mount it', async () => {
    // A blank app's only scaffold file is src/routes.ts, so an edited one leaves it unidentified; nodejs also ships src/app.ts.
    const root = await preFrameApp('routes-edited', 'nodejs')
    const edited = `${read(root, 'src/routes.ts')}// The owner's own line.\n`
    writeFileSync(join(root, 'src', 'routes.ts'), edited)
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(read(root, 'src/routes.ts')).toBe(edited)
    expect(existsSync(join(root, '.acryl', 'upgrade-backup', 'src', 'routes.ts'))).toBe(false)
    expect(out()).toMatch(
      /src\/routes\.ts kept as the app's \(edited\): it does not export FRAME_MOUNT_PREFIX, so the frame cannot show the app until it does/u,
    )
  })

  it('gives the agent template the composition row with its entry isolate and the mount config', async () => {
    const root = await preFrameApp('agent-later', 'agent')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    const overlay = read(root, 'cordis.patch.yml')
    expect(overlay).toContain('- id: app-plugins')
    expect(overlay).toContain('name: ./frame/app-plugins.mjs')
    expect(overlay).toMatch(/isolate: \{[^}]*"agent":true/u)
    // The door and the frame call plugin-share from the host's side.
    expect(overlay).not.toContain('"pluginShare"')
    expect(overlay).toContain('- id: app-routes')
    expect(existsSync(join(root, 'frame', 'app-plugins.mjs'))).toBe(true)
    expect(read(root, 'frame/app-plugins.mjs')).toContain(
      "import { composeInto } from '../src/app.ts'",
    )
    const appTs = read(root, 'src/app.ts')
    expect(appTs).toContain('export async function composeInto')
    expect(appTs).toContain("'agent-panel': { mount: FRAME_MOUNT_PREFIX }")
    expect(out()).toMatch(/src\/app\.ts updated/u)
    // The new scaffold registers the home page's widgets: the plugin it imports comes with it, so the upgraded app starts. Its blend.yaml is the
    // person's and stays as it is, without a home row; the routes run without one (the widgets appear once a `home` row is added).
    expect(appTs).toContain("import * as home from '../plugins/home/index.ts'")
    expect(existsSync(join(root, 'plugins', 'home', 'index.ts'))).toBe(true)
    expect(out()).toMatch(/plugins\/home added/u)
    expect(read(root, 'blend.yaml')).not.toContain('name: home')
    expect(read(root, 'src/routes.ts')).toContain("inject: ['router'],")
  })

  it('is idempotent: a second run changes no bytes and says everything is up to date', async () => {
    const root = await preFrameApp('already-framed', 'agent')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    expect((await runUpgrade(root)).code).toBe(0)
    const files = [
      'cordis.patch.yml',
      'cordis.yml',
      'package.json',
      'scripts/ide-host.mjs',
      'app/runtime.mjs',
      'src/frame.ts',
      'src/app.ts',
      'src/routes.ts',
      'frame/app-plugins.mjs',
    ]
    const before = files.map((file) => read(root, file))
    const second = await runUpgrade(root)
    expect(second.code).toBe(0)
    expect(second.out()).toMatch(/everything is up to date/u)
    expect(files.map((file) => read(root, file))).toEqual(before)
  })

  it('refuses a cordis.patch.yml the app wrote, and changes nothing', async () => {
    const root = await preFrameApp('refuses')
    const own = '# my own overlay\n- insert:\n    - id: mine\n      name: ./mine.mjs\n'
    writeFileSync(join(root, 'cordis.patch.yml'), own)
    const manifestBefore = read(root, 'package.json')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, err } = await runUpgrade(root)
    expect(code).toBe(1)
    expect(err()).toMatch(/cordis\.patch\.yml.*did not write/u)
    expect(read(root, 'cordis.patch.yml')).toBe(own)
    expect(read(root, 'package.json')).toBe(manifestBefore)
    expect(existsSync(join(root, 'scripts', 'ide-host.mjs'))).toBe(false)
  })

  it('refuses an edited scaffold file and, with --force, replaces it and saves the app version', async () => {
    // The route module identifies the template; the composition root is the file the app edited, so the frame step would replace it.
    const root = await preFrameApp('edited-app', 'agent')
    const edited = `${read(root, 'src/app.ts')}\n// mine\n`
    writeFileSync(join(root, 'src', 'app.ts'), edited)
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const refused = await runUpgrade(root)
    expect(refused.code).toBe(1)
    expect(refused.err()).toMatch(/src\/app\.ts/u)
    expect(read(root, 'src/app.ts')).toBe(edited)
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
    const forced = await runUpgrade(root, ['--force'])
    expect(forced.code).toBe(0)
    expect(read(root, 'src/app.ts')).not.toContain('// mine')
    expect(read(root, 'src/app.ts')).toContain('export async function composeInto')
    expect(forced.out()).toMatch(/saved in \.acryl\/upgrade-backup\//u)
    const backups = join(root, '.acryl', 'upgrade-backup')
    expect(existsSync(backups)).toBe(true)
  })

  it('leaves an app of a template without a frame row standalone, and says so', async () => {
    // Every built-in template has the frame row now, so the case is a template folder without one: the planning function decides, and the app is not touched.
    const root = await preFrameApp('no-frame-row', 'blank')
    const template = mkdtempSync(join(scratch, 'template-no-frame-'))
    mkdirSync(join(template, 'src'), { recursive: true })
    writeFileSync(join(template, 'src', 'routes.ts'), '// a template without the frame row\n')
    const step = planFrameStep(root, readLibrary(), () => template)
    expect(step.kind).toBe('no-frame-template')
    expect(frameReport(step)).toMatch(
      /the blank template has no src\/frame\.ts yet: left standalone/u,
    )
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
  })

  it('leaves an app whose scaffold is not the previous release (edited, or another version) alone', async () => {
    const root = await preFrameApp('custom-scaffold')
    // Both files of the blank scaffold are the app's own: with an untouched src/app.ts the app is still the blank template's, and only routes.ts is kept.
    writeFileSync(join(root, 'src', 'routes.ts'), '// my own routes\nexport const routes = {}\n')
    writeFileSync(join(root, 'src', 'app.ts'), '// my own composition root\nexport {}\n')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(out()).toMatch(/not the scaffold of any published acrylblends release/u)
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
  })

  it('puts an app built on its own (a registry blueprint) that carries the frame row in the frame, and never writes its scaffold', async () => {
    // A blueprint is made in the frame, then built on: its scaffold is no template's any more, but it keeps the frame row, the mount prefix and composeInto.
    const { io } = session(scratch)
    expect(
      await init(
        {
          directory: 'blueprint',
          template: 'blank',
          yes: true,
          name: 'blueprint',
          install: false,
          desktop: false,
          quietNext: true,
        },
        io,
      ),
    ).toBe(0)
    const root = join(scratch, 'blueprint')
    const own = (file: string) => {
      const path = join(root, 'src', file)
      writeFileSync(path, `${readFileSync(path, 'utf8')}// the blueprint's own line\n`)
      return readFileSync(path, 'utf8')
    }
    const routes = own('routes.ts')
    const app = own('app.ts')
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const step = planFrameStep(root, readLibrary())
    expect(step.kind).toBe('planned')
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(out()).toMatch(/cordis\.patch\.yml added/u)
    expect(existsSync(join(root, 'scripts', 'ide-host.mjs'))).toBe(true)
    expect(readFileSync(join(root, 'src', 'routes.ts'), 'utf8')).toBe(routes)
    expect(readFileSync(join(root, 'src', 'app.ts'), 'utf8')).toBe(app)
    // Without its frame row it stays as it is.
    rmSync(join(root, 'src', 'frame.ts'))
    expect(planFrameStep(root, readLibrary()).kind).toBe('unidentified')
  })

  it('reports an app made before 0.7.8 (its entry imports ./plugins) instead of writing a frame the app cannot start', async () => {
    const root = await preFrameApp('broken-era', 'agent', '0.7.7')
    writeFileSync(
      join(root, 'src', 'main.ts'),
      readFileSync(join(root, 'src', 'main.ts'), 'utf8').replaceAll(
        "from '../plugins/",
        "from './plugins/",
      ),
    )
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(out()).toMatch(
      /src\/main\.ts imports '\.\/plugins\/\.\.\.', as acrylblends 0\.3\.0 through 0\.7\.7/u,
    )
    expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
    expect(existsSync(join(root, 'src', 'frame.ts'))).toBe(false)
  })

  it('every distinct scaffold the releases shipped either upgrades and settles, or is reported as unable to start', async () => {
    const framed: Template[] = ['blank', 'nodejs', 'notes', 'chat', 'todo', 'agent']
    for (const template of framed) {
      for (const variant of legacyVariants(template)) {
        const name = `${template}-${variant.id}`
        const root = await preFrameApp(name, template, versionFor(template, variant.id))
        process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
        const blendBefore = read(root, 'blend.yaml')
        if (variantFromBrokenEra(template, variant.id)) {
          writeFileSync(
            join(root, 'src', 'main.ts'),
            readFileSync(join(root, 'src', 'main.ts'), 'utf8').replaceAll(
              "from '../plugins/",
              "from './plugins/",
            ),
          )
          const reported = await runUpgrade(root)
          expect(reported.code, `${template} ${variant.id}`).toBe(0)
          expect(reported.out()).toMatch(/imports '\.\/plugins\/\.\.\.'/u)
          expect(read(root, 'blend.yaml'), `${template} ${variant.id}`).toBe(blendBefore)
          expect(existsSync(join(root, 'cordis.patch.yml'))).toBe(false)
          continue
        }
        const upgraded = await runUpgrade(root)
        expect(upgraded.code, `${template} ${variant.id}: ${upgraded.err()}`).toBe(0)
        expect(
          existsSync(join(root, 'cordis.patch.yml')),
          `${template} ${variant.id}\n${upgraded.out()}${upgraded.err()}`,
        ).toBe(true)
        expect(existsSync(join(root, 'src', 'frame.ts')), `${template} ${variant.id}`).toBe(true)
        expect(read(root, 'blend.yaml'), `${template} ${variant.id}`).toBe(blendBefore)
        const second = await runUpgrade(root)
        expect(second.out(), `${template} ${variant.id}`).toMatch(/everything is up to date/u)
      }
    }
  }, 180_000)

  it("touches neither the app home nor its settings document: the profile is the host's, the settings are the user's", async () => {
    const root = await preFrameApp('settings-kept', 'agent')
    // init leaves the app home to the host: nothing there yet, and the gitignore already covers it.
    expect(existsSync(join(root, '.acrylblends'))).toBe(false)
    expect(read(root, '.gitignore')).toContain('.acrylblends/')
    const settingsFile = join(root, '.acrylblends', 'settings.patch.yml')
    const document =
      "- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 'kept-by-the-user'\n"
    mkdirSync(join(root, '.acrylblends'), { recursive: true })
    writeFileSync(settingsFile, document)
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(readFileSync(settingsFile, 'utf8')).toBe(document)
    expect(out()).not.toMatch(/settings\.patch\.yml/u)
  })

  it('removes the DSH-profile script of the older layout when the host launcher replaces it', async () => {
    const root = await preFrameApp('old-profile')
    writeFileSync(
      join(root, 'scripts', 'ide-profile.mjs'),
      '// Generated by acrylblends: the old profile script\n',
    )
    process.env.ACRYLBLENDS_FRAME_PACKAGES = FRAME_SPECS
    const { code, out } = await runUpgrade(root)
    expect(code).toBe(0)
    expect(existsSync(join(root, 'scripts', 'ide-profile.mjs'))).toBe(false)
    expect(out()).toMatch(/scripts\/ide-profile\.mjs removed/u)
  })
})
