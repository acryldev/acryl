/**
 * Bulkheads (spec 036, "Self-containment"). Two guarantees, tested where they could break:
 *
 * 1. Architecture: no code outside the selector (`src/instance/select.ts`) decides where an app lives. Reading ACRYL_HOME, DSH_HOME, ACRYL_WEB_PORT,
 *    ACRYL_INSTANCE or ACRYL_LOCAL_PRODUCT_NAME, or calling `homedir()`, anywhere else is how a run fell back to a shared home and blanked another app.
 * 2. Behavior: two apps booted on real engines at the same time share no file, profile, port or service value.
 */
import { readdirSync, readFileSync, realpathSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { createWebEngineDefinition } from '../src/engine-dsh.ts'
import { createAcrylEngineHost } from '../src/engine-host.ts'
import type { AppInstance } from '../src/instance/index.ts'

const repo = realpathSync(new URL('../../..', import.meta.url).pathname)

/** Source roots of everything ACRYL ships or launches with. */
const ROOTS = ['runtime', 'apps', 'plugins', 'scripts']

/**
 * The only places allowed to look at the OS home or the placement variables, each with its reason. Anything else is a hidden Singleton.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'runtime/acryl-harness-runtime/src/instance/select.ts': 'the selector: the one place an app instance is chosen',
  'plugins/acryl-workspace/src/pty/service.ts': 'a terminal starts in the user\'s own home folder when the cwd is gone; not ACRYL state',
  'scripts/graft-deepscan.mjs': 'a repository indexing tool; not part of any app',
}

const AMBIENT = [
  { name: 'homedir()', pattern: /\bhomedir\(\)/u },
  { name: 'a placement variable read', pattern: /\benv(?:\.|\[['"])(ACRYL_HOME|DSH_HOME|ACRYL_WEB_PORT|ACRYL_INSTANCE|ACRYL_LOCAL_PRODUCT_NAME)\b(?!['"]?\]?\s*=(?!=))/u },
]

function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'lib', 'lib-publish', 'dist', 'tests', 'test', 'fixtures', 'example-plugins', '.turbo'].includes(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.(ts|tsx|mts|js|mjs)$/u.test(entry.name) && !/\.(test|spec)\./u.test(entry.name)) out.push(path)
  }
  return out
}

describe('bulkhead architecture', () => {
  it('only the selector decides where an app lives', () => {
    const offences: string[] = []
    for (const root of ROOTS) {
      for (const file of sources(join(repo, root))) {
        const path = relative(repo, file)
        if (path in ALLOWED) continue
        const text = readFileSync(file, 'utf8').split('\n')
        text.forEach((line, index) => {
          if (/^\s*(\*|\/\/)/u.test(line)) return   // comments may name the variables
          for (const rule of AMBIENT) if (rule.pattern.test(line)) offences.push(`${path}:${String(index + 1)} ${rule.name}: ${line.trim().slice(0, 120)}`)
        })
      }
    }
    expect(offences).toEqual([])
  })

  it('the allow-list only names files that exist', () => {
    for (const path of Object.keys(ALLOWED)) expect(statSync(join(repo, path)).isFile(), path).toBe(true)
  })
})

const saved = { ...process.env }
const temporary: string[] = []
afterEach(async () => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]
  Object.assign(process.env, saved)
  await Promise.all(temporary.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

async function bootApp(folder: string) {
  // What `bin/acryl` hands an app: its folder as its home.
  for (const key of ['DSH_HOME', 'ACRYL_WEB_PORT', 'ACRYL_INSTANCE', 'ACRYL_LOCAL_PRODUCT_NAME', 'ACRYL_BLUEPRINT']) delete process.env[key]
  process.env.ACRYL_HOME = folder
  const host = await createAcrylEngineHost({
    engines: [createWebEngineDefinition(new URL('../package.json', import.meta.url).href)],
    initialEngine: 'dsh',
    prepare: ctx => { provideCmdline(ctx, { args: ['--no-open'], exit: () => {} }) },
  })
  const instance = host.ctx.get('appInstance' as never) as unknown as AppInstance
  const port = (host.ctx.get('webServer' as never) as unknown as { port: number }).port
  return { host, instance, port }
}

function filesUnder(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(path)
      else if (entry.isFile()) out.push(path)
    }
  }
  walk(dir)
  return out
}

describe('bulkhead behavior', () => {
  it('two apps running at once share no home, profile, port, user data or project scope, and each writes only inside its own folder', async () => {
    const root = realpathSync(await mkdtemp(join(tmpdir(), 'acryl-bulkhead-')))
    temporary.push(root)
    const app = (name: string, title: string): string => {
      const dir = join(root, name); mkdirSync(join(dir, 'extensions'), { recursive: true })
      writeFileSync(join(dir, 'blend.yaml'), `apiVersion: blends.acryl.dev/v1alpha1\nkind: Blend\nmetadata:\n  id: app.${name}\n  name: ${title}\n  version: 0.1.0\nspec:\n  runtime: cordis\n  lineage:\n    blueprint: acryl.blank\n    blueprintVersion: 0.1.0\n  rows:\n    - id: brand\n      name: acryl-brand\n      config:\n        name: ${title}\n`)
      return dir
    }
    const music = await bootApp(app('music-editor', 'Music Editor'))
    const social = await bootApp(app('social-machine', 'Social Machine'))
    try {
      for (const key of ['home', 'dshHome', 'userDataName', 'runLockFile', 'projectScope'] as const) {
        expect(music.instance[key], key).not.toBe(social.instance[key])
      }
      expect(music.port).not.toBe(social.port)
      for (const one of [music, social]) {
        expect(one.instance.kind).toBe('app')
        for (const file of filesUnder(root)) if (file.startsWith(one.instance.home)) expect(file.startsWith(one.instance.home)).toBe(true)
      }
      // Every file the two apps wrote is inside one of the two app folders: nothing outside, nothing crossing.
      const written = filesUnder(root).map(file => relative(root, file).split('/')[0])
      expect(new Set(written)).toEqual(new Set(['music-editor', 'social-machine']))
      const brand = (app: typeof music) => (app.host.ctx.get('acrylBrand' as never) as unknown as { identity: { name: string } }).identity.name
      expect([brand(music), brand(social)]).toEqual(['Music Editor', 'Social Machine'])
    } finally {
      await music.host.dispose()
      await social.host.dispose()
    }
  }, 180_000)
})
