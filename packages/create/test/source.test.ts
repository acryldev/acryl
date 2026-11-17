import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { writeArchives } from '../../../workshop-registry/scripts/registry-archives.mjs'
import { type Io, runCreate, TEMPLATE_MANIFEST } from '../src/index'
import { type Fetchers, parseSource, realFetchers, SourceError, tarCommand } from '../src/source'

const scratch = mkdtempSync(join(tmpdir(), 'create-source-test-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let counter = 0
/** A packed template: `top/` holding the files, as `tar.gz`, the way GitHub and `npm pack` lay out an archive. */
function pack(
  files: Record<string, string>,
  top = 'package',
  extra?: (dir: string) => void,
): string {
  const root = join(scratch, `pack-${counter++}`)
  const dir = join(root, top)
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  extra?.(dir)
  const out = join(root, 'template.tgz')
  execFileSync('tar', ['-czf', out, '-C', root, top])
  return out
}

const manifest = (extra: object = {}) =>
  JSON.stringify({ name: 'hello', description: 'a hello app', ...extra })
const app = (scripts: Record<string, string> = { test: 'node --test' }) => ({
  [TEMPLATE_MANIFEST]: manifest(),
  'package.json': JSON.stringify({
    name: 'x',
    scripts,
    dependencies: { acrylblends: '^0.0.1' },
  }),
  gitignore: 'node_modules/\n',
  'src/app.ts': "export const hello = '__APP_NAME__ on __PACKAGE__'\n",
})

function fakeIo(fetchers?: Partial<Fetchers>) {
  let out = ''
  let err = ''
  const runs: { command: string; args: string[] }[] = []
  const io: Io = {
    stdout: { write: (t) => (out += t) },
    stderr: { write: (t) => (err += t) },
    cwd: scratch,
    env: {},
    ask: undefined,
    run: async (command, args) => {
      runs.push({ command, args })
      return 0
    },
    fetchers: {
      download: async () => {
        throw new Error('no network in tests')
      },
      pack: () => {
        throw new Error('no npm in tests')
      },
      ...fetchers,
    },
  }
  return { io, out: () => out, err: () => err, runs }
}

describe('template sources', () => {
  it('recognises the three forms and refuses malformed ones', () => {
    expect(parseSource('github:acme/starter#v1', scratch)).toEqual({
      kind: 'github',
      owner: 'acme',
      repo: 'starter',
      ref: 'v1',
    })
    expect(parseSource('github:acme/starter', scratch)).toMatchObject({ ref: undefined })
    expect(parseSource('@acme/starter@1.2.0', scratch)).toEqual({
      kind: 'npm',
      spec: '@acme/starter@1.2.0',
    })
    expect(parseSource('some-name', scratch)).toBeUndefined()
    expect(() => parseSource('github:acme', scratch)).toThrow(/github:owner\/repo/)
    expect(() => parseSource('@acme', scratch)).toThrow(/@scope\/name/)
    expect(() => parseSource('./missing.tgz', scratch)).toThrow(/does not exist/)
  })

  it("keeps an entry's own .gitattributes rather than writing the default over it", async () => {
    const own = '* text=auto eol=lf\n*.png binary\n'
    const tgz = pack({ ...app(), '.gitattributes': own })
    const s = fakeIo()
    expect(await runCreate(['own-attributes', tgz], s.io)).toBe(0)
    expect(readFileSync(join(scratch, 'own-attributes', '.gitattributes'), 'utf8')).toBe(own)
  })

  it('creates an app from a packed tarball: files, placeholders, name, framework range, docs; no manifest copied', async () => {
    const tgz = pack(app())
    const s = fakeIo()
    expect(await runCreate(['from-tgz', tgz], s.io)).toBe(0)
    const dir = join(scratch, 'from-tgz')
    expect(readFileSync(join(dir, 'src/app.ts'), 'utf8')).toBe(
      "export const hello = 'from-tgz on acrylblends'\n",
    )
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('from-tgz')
    expect(pkg.dependencies.acrylblends).toMatch(/^\^\d+\.\d+\.\d+/)
    expect(pkg.dependencies.acrylblends).not.toBe('^0.0.1')
    expect(existsSync(join(dir, '.gitignore'))).toBe(true)
    expect(readFileSync(join(dir, '.gitattributes'), 'utf8')).toMatch(/^\* text=auto eol=lf$/mu)
    expect(existsSync(join(dir, TEMPLATE_MANIFEST))).toBe(false)
    expect(existsSync(join(dir, 'docs/framework/README.md'))).toBe(true)
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('a hello app')
    expect(s.out()).toContain('created from-tgz from hello')
    expect(s.runs).toEqual([]) // nothing installed or run
  })

  it('fetches a GitHub source as a tarball from codeload, never a clone', async () => {
    const tgz = pack(app(), 'starter-main')
    const urls: string[] = []
    const s = fakeIo({
      download: async (url) => {
        urls.push(url)
        return new Uint8Array(readFileSync(tgz))
      },
    })
    expect(await runCreate(['from-github', 'github:acme/starter#v2'], s.io)).toBe(0)
    expect(urls).toEqual(['https://codeload.github.com/acme/starter/tar.gz/v2'])
    expect(existsSync(join(scratch, 'from-github/src/app.ts'))).toBe(true)
    expect(s.runs).toEqual([])
  })

  it('packs an npm source without running its scripts', async () => {
    const tgz = pack(app())
    const packed: string[] = []
    const s = fakeIo({
      pack: (spec) => {
        packed.push(spec)
        return tgz
      },
    })
    expect(await runCreate(['from-npm', '@acme/starter'], s.io)).toBe(0)
    expect(packed).toEqual(['@acme/starter'])
  })

  it('refuses a source without the manifest, with a clear message, and creates nothing', async () => {
    const { [TEMPLATE_MANIFEST]: _omit, ...without } = app()
    const s = fakeIo()
    expect(await runCreate(['no-manifest', pack(without)], s.io)).toBe(1)
    expect(s.err()).toContain(`no ${TEMPLATE_MANIFEST}`)
    expect(s.err()).toContain('nothing was changed')
    expect(existsSync(join(scratch, 'no-manifest'))).toBe(false)
    const bad = fakeIo()
    expect(
      await runCreate(
        ['bad-manifest', pack({ ...app(), [TEMPLATE_MANIFEST]: '{"name":"x"}' })],
        bad.io,
      ),
    ).toBe(1)
    expect(bad.err()).toContain('"description"')
  })

  it('does not run a postinstall script without --install, says it exists, and lists the scripts when --install is given', async () => {
    const tgz = pack(app({ test: 'node --test', postinstall: 'node setup.js' }))
    const without = fakeIo()
    expect(await runCreate(['scripts-off', tgz], without.io)).toBe(0)
    expect(without.runs).toEqual([])
    expect(without.out()).toContain('nothing was installed or run')
    expect(without.out()).toContain('postinstall: node setup.js')

    const withInstall = fakeIo()
    expect(await runCreate(['scripts-on', tgz, '--install', '--pm', 'npm'], withInstall.io)).toBe(0)
    expect(withInstall.runs).toEqual([{ command: 'npm', args: ['install'] }])
    // The list is printed before the install runs.
    expect(withInstall.out()).toContain("runs the template's own lifecycle scripts")
    expect(withInstall.out()).toContain('postinstall: node setup.js')
    expect(withInstall.out()).toContain('This installs: acrylblends')
  })

  it('refuses a template that holds a secret, and one that holds a symbolic link', async () => {
    const secret = fakeIo()
    expect(
      await runCreate(
        [
          'secret',
          pack({
            ...app(),
            'src/config.ts': "export const config = { password: 'hunter2hunter2' }\n",
          }),
        ],
        secret.io,
      ),
    ).toBe(1)
    expect(secret.err()).toContain('secret')
    expect(secret.err()).toContain('src/config.ts')
    expect(secret.err()).not.toContain('hunter2')
    expect(existsSync(join(scratch, 'secret'))).toBe(false)

    const link = fakeIo()
    const tgz = pack(app(), 'package', (dir) => symlinkSync('/etc/passwd', join(dir, 'passwd')))
    expect(await runCreate(['linked', tgz], link.io)).toBe(1)
    expect(link.err()).toContain('symbolic link')
    expect(existsSync(join(scratch, 'linked'))).toBe(false)
  })

  it('refuses a non-empty target, an unknown source, and a source together with --template', async () => {
    const tgz = pack(app())
    mkdirSync(join(scratch, 'busy'))
    writeFileSync(join(scratch, 'busy/x'), '')
    const busy = fakeIo()
    expect(await runCreate(['busy', tgz], busy.io)).toBe(1)
    expect(readdirSync(join(scratch, 'busy'))).toEqual(['x'])
    expect(await runCreate(['odd', 'whatever'], fakeIo().io)).toBe(2)
    expect(await runCreate(['both', tgz, '--template', 'nodejs'], fakeIo().io)).toBe(2)
  })

  it('tells which plugins a template needs', async () => {
    const tgz = pack({ ...app(), [TEMPLATE_MANIFEST]: manifest({ plugins: ['desktop'] }) })
    const s = fakeIo()
    expect(await runCreate(['needs', tgz], s.io)).toBe(0)
    expect(s.out()).toContain('npx acrylblends add desktop')
  })
})

describe('a download that fails', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('says so in one line, whether the host cannot be reached or refuses', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('fetch failed')
    })
    const unreachable = realFetchers.download('https://registry.example.org/index.json')
    await expect(unreachable).rejects.toThrow(SourceError)
    await expect(unreachable).rejects.toThrow(
      'could not reach https://registry.example.org/index.json: fetch failed',
    )
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    await expect(realFetchers.download('https://registry.example.org/x')).rejects.toThrow(
      'https://registry.example.org/x answered 404',
    )
  })
})

describe('starters from a registry', () => {
  const entryFiles = {
    ...app(),
    'blend.yaml':
      'metadata:\n  id: acrylblends.notes-desktop\n  name: Notes with a desktop window\n  version: 0.1.0\n  license: MIT\n  visibility: public\nspec:\n  runtime: cordis\n',
  }
  /** A registry folder (index.json and blends/<id>/) with one starter for acrylblends and one for ACRYL. */
  function registry(layout: 'root' | 'site' = 'root'): string {
    const root = join(scratch, `registry-${counter++}`)
    const base = layout === 'site' ? join(root, 'registry') : root
    for (const [path, text] of Object.entries(entryFiles)) {
      mkdirSync(join(base, 'blends', 'acrylblends.notes-desktop', path, '..'), { recursive: true })
      writeFileSync(join(base, 'blends', 'acrylblends.notes-desktop', path), text)
    }
    mkdirSync(join(base, 'blends', 'acryl.gtd'), { recursive: true })
    writeFileSync(join(base, 'blends', 'acryl.gtd', 'blend.yaml'), 'metadata:\n  id: acryl.gtd\n')
    writeFileSync(
      join(base, 'index.json'),
      JSON.stringify({
        formatVersion: 1,
        entries: [
          { id: 'acryl.gtd', name: 'GTD', version: '0.1.0', path: 'blends/acryl.gtd' },
          {
            id: 'acrylblends.notes-desktop',
            name: 'Notes with a desktop window',
            version: '0.1.0',
            path: 'blends/acrylblends.notes-desktop',
            runtime: 'acrylblends',
          },
        ],
      }),
    )
    return root
  }

  it('makes an app from a starter that declares runtime acrylblends, and gives the manifest to its new owner', async () => {
    const s = fakeIo()
    const registryFolder = registry()
    expect(
      await runCreate(
        ['mine', '--from', 'acrylblends.notes-desktop', '--registry', registryFolder, '-y'],
        s.io,
      ),
      s.err(),
    ).toBe(0)
    expect(s.out()).toContain('created mine from acrylblends.notes-desktop 0.1.0')
    expect(existsSync(join(scratch, 'mine', 'src', 'app.ts'))).toBe(true)
    expect(readFileSync(join(scratch, 'mine', 'src', 'app.ts'), 'utf8')).toContain('mine on')
    const manifestText = readFileSync(join(scratch, 'mine', 'blend.yaml'), 'utf8')
    expect(manifestText).toContain('id: acrylblends.mine')
    expect(manifestText).toContain('visibility: private')
    expect(manifestText).not.toContain('visibility: public')
    expect(manifestText).not.toContain('license:')
    expect(s.out()).toContain('Next:')
    // In the frame by the framework's own commands, on the new app's folder; nothing is installed (a source installs only with --install).
    expect(s.runs.map((run) => run.args.slice(1))).toEqual([
      ['add', 'desktop', '--dir', join(scratch, 'mine')],
      ['upgrade', '--dir', join(scratch, 'mine')],
    ])
    expect(s.out()).toContain('npm run desktop')
    const bare = fakeIo()
    expect(
      await runCreate(
        ['plain', '--from', 'acrylblends.notes-desktop', '--registry', registryFolder, '--bare'],
        bare.io,
      ),
    ).toBe(0)
    expect(bare.runs).toHaveLength(0)
    // The starter has no README, so the Next block does not send the reader to one.
    expect(bare.out()).toContain('see the package.json scripts')
    expect(bare.out()).not.toContain('README')
  })

  it('gives an app made from another app its own name and its own repository with one first commit', async () => {
    // The starter is an app called "notes", a common word: its name changes where the scaffold wrote it, never in its code's routes or prose.
    const starter: Record<string, string> = {
      ...app(),
      'blend.yaml':
        'metadata:\n  id: inboxxobni.notes\n  name: "notes"\n  version: 0.1.0\nspec:\n  runtime: cordis\n',
      'README.md': '# notes\n\nKeep notes here.\n',
      'AGENTS.md': '# notes\n\nThe notes-widget plugin keeps notes.\n',
      'src/routes.ts': "export const APP_NAME = 'notes'\nexport const path = '/notes'\n",
      '.claude/skills/acryl-app/SKILL.md':
        '---\nname: acryl-app\ndescription: How the notes app is put together\n---\n# Working in notes\n\nAdd notes to notes.\n',
      'scripts/ide-host.mjs': "const profileName = 'acrylblends-notes'\n",
      'package-lock.json': `${JSON.stringify({ name: 'notes', lockfileVersion: 3, packages: { '': { name: 'notes' }, 'node_modules/notes': { version: '1.0.0' } } }, null, 2)}\n`,
    }
    const root = join(scratch, `registry-${counter++}`)
    for (const [path, text] of Object.entries(starter)) {
      mkdirSync(join(root, 'blends', 'inboxxobni.notes', path, '..'), { recursive: true })
      writeFileSync(join(root, 'blends', 'inboxxobni.notes', path), text)
    }
    writeFileSync(
      join(root, 'index.json'),
      JSON.stringify({
        formatVersion: 1,
        entries: [
          {
            id: 'inboxxobni.notes',
            name: 'Notes',
            version: '0.1.0',
            path: 'blends/inboxxobni.notes',
            runtime: 'acrylblends',
          },
        ],
      }),
    )
    const s = fakeIo()
    expect(
      await runCreate(['my-notes', '--from', 'inboxxobni.notes', '--registry', root, '-y'], s.io),
      s.err(),
    ).toBe(0)
    const made = join(scratch, 'my-notes')
    const read = (file: string) => readFileSync(join(made, file), 'utf8')
    expect(read('README.md')).toBe('# my-notes\n\nKeep notes here.\n')
    expect(read('AGENTS.md')).toBe('# my-notes\n\nThe notes-widget plugin keeps notes.\n')
    expect(read('src/routes.ts')).toBe(
      "export const APP_NAME = 'my-notes'\nexport const path = '/notes'\n",
    )
    expect(read('.claude/skills/acryl-app/SKILL.md')).toBe(
      '---\nname: acryl-app\ndescription: How the my-notes app is put together\n---\n# Working in my-notes\n\nAdd notes to notes.\n',
    )
    expect(read('scripts/ide-host.mjs')).toBe("const profileName = 'acrylblends-my-notes'\n")
    expect(read('blend.yaml')).toMatch(/^ {2}name: my-notes$/m)
    expect(JSON.parse(read('package-lock.json'))).toEqual({
      name: 'my-notes',
      lockfileVersion: 3,
      packages: { '': { name: 'my-notes' }, 'node_modules/notes': { version: '1.0.0' } },
    })
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: made, encoding: 'utf8' })).toBe(
      'Initial commit from acrylblends\n',
    )
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: made, encoding: 'utf8' })).toBe('')
  })

  it('renames a curated starter, whose manifest carries a display name, from its package name', async () => {
    // A curated blueprint is titled "Productivity Hub" in its manifest; the scaffold wrote its package name where an app names itself.
    const starter: Record<string, string> = {
      ...app(),
      'package.json': JSON.stringify({
        name: 'productivity-hub',
        scripts: { test: 'node --test' },
      }),
      'blend.yaml':
        'metadata:\n  id: acrylblends.productivity-hub\n  name: Productivity Hub\n  version: 0.1.0\nspec:\n  runtime: cordis\n',
      'README.md': '# Productivity Hub\n\nA calm personal workbench.\n',
      'src/routes.ts': "export const APP_NAME = 'productivity-hub'\n",
      'scripts/ide-host.mjs': "const profileName = 'acrylblends-productivity-hub'\n",
      'package-lock.json': `${JSON.stringify({ name: 'productivity-hub', lockfileVersion: 3, packages: { '': { name: 'productivity-hub' } } }, null, 2)}\n`,
    }
    const root = join(scratch, `registry-${counter++}`)
    for (const [path, text] of Object.entries(starter)) {
      mkdirSync(join(root, 'blends', 'acrylblends.productivity-hub', path, '..'), {
        recursive: true,
      })
      writeFileSync(join(root, 'blends', 'acrylblends.productivity-hub', path), text)
    }
    writeFileSync(
      join(root, 'index.json'),
      JSON.stringify({
        formatVersion: 1,
        entries: [
          {
            id: 'acrylblends.productivity-hub',
            name: 'Productivity Hub',
            version: '0.1.0',
            path: 'blends/acrylblends.productivity-hub',
            runtime: 'acrylblends',
          },
        ],
      }),
    )
    const s = fakeIo()
    expect(
      await runCreate(
        ['my-hub', '--from', 'acrylblends.productivity-hub', '--registry', root, '-y'],
        s.io,
      ),
      s.err(),
    ).toBe(0)
    const made = join(scratch, 'my-hub')
    const read = (file: string) => readFileSync(join(made, file), 'utf8')
    expect(read('README.md')).toBe('# Productivity Hub\n\nA calm personal workbench.\n')
    expect(read('src/routes.ts')).toBe("export const APP_NAME = 'my-hub'\n")
    expect(read('scripts/ide-host.mjs')).toBe("const profileName = 'acrylblends-my-hub'\n")
    expect(JSON.parse(read('package-lock.json'))).toEqual({
      name: 'my-hub',
      lockfileVersion: 3,
      packages: { '': { name: 'my-hub' } },
    })
  })

  it('takes a registry folder written as a bare path, and says in one line, naming the folder, when it has no index.json', async () => {
    const bare = fakeIo()
    const name = registry().slice(scratch.length + 1)
    expect(
      await runCreate(
        ['bare', '--from', 'acrylblends.notes-desktop', '--registry', name, '-y'],
        bare.io,
      ),
      bare.err(),
    ).toBe(0)
    const empty = join(scratch, `registry-${counter++}`)
    mkdirSync(join(empty, 'blends'), { recursive: true })
    const missing = fakeIo()
    expect(
      await runCreate(
        ['no3', '--from', 'acrylblends.notes-desktop', '--registry', empty, '-y'],
        missing.io,
      ),
    ).toBe(1)
    expect(missing.err()).toContain(`error: ${empty} has no index.json`)
    expect(missing.err()).not.toContain('Usage:')
    expect(existsSync(join(scratch, 'no3'))).toBe(false)
  })

  it('reads a registry that keeps its index in a registry/ folder, like the public one', async () => {
    const s = fakeIo()
    expect(
      await runCreate(
        ['site', '--from', 'acrylblends.notes-desktop', '--registry', registry('site'), '-y'],
        s.io,
      ),
      s.err(),
    ).toBe(0)
  })

  it('refuses an ACRYL app starter in one line, and an unknown id with the ones it can make; nothing is created', async () => {
    const acryl = fakeIo()
    expect(
      await runCreate(['no1', '--from', 'acryl.gtd', '--registry', registry(), '-y'], acryl.io),
    ).toBe(1)
    expect(acryl.err()).toContain(
      'acryl.gtd is an ACRYL app starter: open it in the ACRYL app (https://acryl.dev). create-acrylblends makes acrylblends apps.',
    )
    expect(existsSync(join(scratch, 'no1'))).toBe(false)
    const unknown = fakeIo()
    expect(
      await runCreate(
        ['no2', '--from', 'nobody.thing', '--registry', registry(), '-y'],
        unknown.io,
      ),
    ).toBe(1)
    expect(unknown.err()).toContain('starters for create-acrylblends: acrylblends.notes-desktop')
    expect(existsSync(join(scratch, 'no2'))).toBe(false)
  })

  it('reads the public registry from its repository by default, and rejects --registry without an id', async () => {
    const downloads: string[] = []
    const s = fakeIo({
      download: async (url) => {
        downloads.push(url)
        const root = registry('site')
        const tgz = join(scratch, `site-${counter++}.tgz`)
        execFileSync('tar', ['-czf', tgz, '-C', scratch, `registry-${root.split('registry-')[1]}`])
        return readFileSync(tgz)
      },
    })
    expect(
      await runCreate(['pub', '--from', 'acrylblends.notes-desktop', '-y'], s.io),
      s.err(),
    ).toBe(0)
    expect(downloads).toEqual([
      'https://acrylblends.github.io/registry/index.json',
      'https://codeload.github.com/acrylblends/acrylblends.github.io/tar.gz/HEAD',
    ])
    const bad = fakeIo()
    expect(await runCreate(['x', 'notes', '--registry', 'github:a/b'], bad.io)).toBe(2)
    expect(bad.err()).toContain('--registry goes with a registry id')
  })

  /** Grow a registry past the template limits (5000 files, 50 MB) beside its entries, as every published entry grows the public one. */
  function grow(root: string): string {
    const growth = join(root, 'registry', 'blends', 'acrylblends.other')
    mkdirSync(growth, { recursive: true })
    for (let i = 0; i <= 5000; i += 1) writeFileSync(join(growth, `f${i}.txt`), `${i}\n`)
    writeFileSync(join(growth, 'big.bin'), Buffer.alloc(51 * 1024 * 1024))
    return root
  }

  it('reads a registry larger than a template may be, from a folder and from GitHub, and still makes the small starter', async () => {
    const big = grow(registry('site'))
    const folder = fakeIo()
    expect(
      await runCreate(
        ['grown', '--from', 'acrylblends.notes-desktop', '--registry', big, '-y'],
        folder.io,
      ),
      folder.err(),
    ).toBe(0)
    expect(existsSync(join(scratch, 'grown', 'src', 'app.ts'))).toBe(true)
    expect(existsSync(join(scratch, 'grown', 'f0.txt'))).toBe(false)

    const tgz = join(scratch, `grown-${counter++}.tgz`)
    execFileSync('tar', ['-czf', tgz, '-C', scratch, big.slice(scratch.length + 1)])
    const github = fakeIo({ download: async () => readFileSync(tgz) })
    expect(
      await runCreate(['grown-gh', '--from', 'acrylblends.notes-desktop', '-y'], github.io),
      github.err(),
    ).toBe(0)
    expect(existsSync(join(scratch, 'grown-gh', 'src', 'app.ts'))).toBe(true)
    // Writing, copying and packing a registry over 50 MB takes seconds, not the default five.
  }, 120_000)

  it('still refuses a starter that is itself larger than a template may be; nothing is created', async () => {
    const root = registry('site')
    const entry = join(root, 'registry', 'blends', 'acrylblends.notes-desktop')
    for (let i = 0; i <= 5000; i += 1) writeFileSync(join(entry, `f${i}.txt`), `${i}\n`)
    const s = fakeIo()
    expect(
      await runCreate(
        ['too-big', '--from', 'acrylblends.notes-desktop', '--registry', root, '-y'],
        s.io,
      ),
    ).toBe(1)
    expect(s.err()).toContain('the template has more than 5000 files')
    expect(existsSync(join(scratch, 'too-big'))).toBe(false)
  })

  describe('a hosted registry, which publishes each entry as an archive', () => {
    const PUBLIC = 'https://acrylblends.github.io/registry/'
    const REPOSITORY = 'https://codeload.github.com/acrylblends/acrylblends.github.io/tar.gz/HEAD'
    const ID = 'acrylblends.notes-desktop'

    /** A registry as a site deploys it: its archives written and named in its index. */
    function published(): string {
      const root = registry()
      writeArchives(root)
      return root
    }

    /** A static host serving `root` at `base`, recording what is asked; `repository` answers the fallback to the registry's repository. */
    function host(root: string, base = PUBLIC, repository?: () => Uint8Array) {
      const asked: string[] = []
      const download = async (url: string) => {
        asked.push(url)
        if (url === REPOSITORY && repository) return repository()
        const file = url.startsWith(base) ? join(root, url.slice(base.length)) : ''
        if (file === '' || !existsSync(file)) throw new Error(`${url} answered 404`)
        return new Uint8Array(readFileSync(file))
      }
      return { asked, download }
    }

    /** The registry's repository, as GitHub serves it: everything under one top folder. */
    function repositoryOf(root: string): () => Uint8Array {
      return () => {
        const tgz = join(scratch, `repository-${counter++}.tgz`)
        execFileSync('tar', ['-czf', tgz, '-C', join(root, '..'), root.slice(scratch.length + 1)])
        return readFileSync(tgz)
      }
    }

    const editIndex = (root: string, edit: (entry: Record<string, unknown>) => void) => {
      const file = join(root, 'index.json')
      const index = JSON.parse(readFileSync(file, 'utf8')) as { entries: Record<string, unknown>[] }
      for (const entry of index.entries) if (entry.id === ID) edit(entry)
      writeFileSync(file, JSON.stringify(index))
    }

    it('downloads the index and that one archive, nothing else, and makes the app', async () => {
      const { asked, download } = host(published())
      const s = fakeIo({ download })
      expect(await runCreate(['hosted', '--from', ID, '-y'], s.io), s.err()).toBe(0)
      expect(asked).toEqual([`${PUBLIC}index.json`, `${PUBLIC}blends/${ID}.tgz`])
      expect(readFileSync(join(scratch, 'hosted', 'src', 'app.ts'), 'utf8')).toContain('hosted')
    })

    it('refuses an archive that does not match its integrity, without trying anything else; nothing is created', async () => {
      const root = published()
      writeFileSync(join(root, 'blends', `${ID}.tgz`), 'not what the index promised')
      const { asked, download } = host(root, PUBLIC, repositoryOf(registry()))
      const s = fakeIo({ download })
      expect(await runCreate(['tampered', '--from', ID, '-y'], s.io)).toBe(1)
      expect(s.err()).toContain(`the archive of ${ID} does not match its integrity`)
      expect(asked).not.toContain(REPOSITORY)
      expect(existsSync(join(scratch, 'tampered'))).toBe(false)
    })

    it('reads the repository instead when the index names no archive', async () => {
      const { asked, download } = host(registry(), PUBLIC, repositoryOf(registry()))
      const s = fakeIo({ download })
      expect(await runCreate(['no-archive', '--from', ID, '-y'], s.io), s.err()).toBe(0)
      expect(asked).toEqual([`${PUBLIC}index.json`, REPOSITORY])
    })

    it('reads the repository instead when the host is down, or the archive cannot be downloaded', async () => {
      const down = fakeIo({
        download: async (url) => {
          if (url === REPOSITORY) return repositoryOf(registry())()
          throw new TypeError('fetch failed')
        },
      })
      expect(await runCreate(['host-down', '--from', ID, '-y'], down.io), down.err()).toBe(0)
      const root = published()
      rmSync(join(root, 'blends', `${ID}.tgz`))
      const { asked, download } = host(root, PUBLIC, repositoryOf(registry()))
      const missing = fakeIo({ download })
      expect(await runCreate(['no-file', '--from', ID, '-y'], missing.io), missing.err()).toBe(0)
      expect(asked.at(-1)).toBe(REPOSITORY)
    })

    it('holds an archive to the template limits; nothing is created', async () => {
      const root = registry()
      for (let i = 0; i <= 5000; i += 1)
        writeFileSync(join(root, 'blends', ID, `f${i}.txt`), `${i}\n`)
      writeArchives(root)
      const { asked, download } = host(root, PUBLIC, repositoryOf(registry()))
      const s = fakeIo({ download })
      expect(await runCreate(['big-archive', '--from', ID, '-y'], s.io)).toBe(1)
      expect(s.err()).toContain('the template has more than 5000 files')
      expect(asked).not.toContain(REPOSITORY)
      expect(existsSync(join(scratch, 'big-archive'))).toBe(false)
    }, 60_000)

    it('refuses an index whose archive leaves the registry, or has no integrity', async () => {
      const outside = published()
      editIndex(outside, (entry) => {
        entry.archive = '../../secret.tgz'
      })
      const first = fakeIo({ download: host(outside).download })
      expect(await runCreate(['outside', '--from', ID, '--registry', PUBLIC, '-y'], first.io)).toBe(
        1,
      )
      expect(first.err()).toContain(`registry entry ${ID} has no valid archive`)
      const bare = published()
      editIndex(bare, (entry) => {
        delete entry.integrity
      })
      const second = fakeIo({ download: host(bare).download })
      expect(
        await runCreate(['bare-integrity', '--from', ID, '--registry', PUBLIC, '-y'], second.io),
      ).toBe(1)
      expect(second.err()).toContain(`registry entry ${ID} has no valid archive`)
    })

    it('takes any https address as --registry, and says so in one line when it has no archive for the entry', async () => {
      const base = 'https://registry.example.org/blends-registry/'
      const ok = fakeIo({ download: host(published(), base).download })
      expect(
        await runCreate(['other-host', '--from', ID, '--registry', base.slice(0, -1), '-y'], ok.io),
        ok.err(),
      ).toBe(0)
      const none = fakeIo({ download: host(registry(), base).download })
      expect(await runCreate(['other-none', '--from', ID, '--registry', base, '-y'], none.io)).toBe(
        1,
      )
      expect(none.err()).toContain(`${base} publishes no archive for ${ID}`)
      expect(existsSync(join(scratch, 'other-none'))).toBe(false)
    })
  })

  it('reads a registry folder in place and copies only the entry: what another entry holds does not matter', async () => {
    const root = registry()
    const other = join(root, 'blends', 'acrylblends.other')
    mkdirSync(other, { recursive: true })
    symlinkSync('/etc/passwd', join(other, 'link'))
    const s = fakeIo()
    expect(
      await runCreate(
        ['only-entry', '--from', 'acrylblends.notes-desktop', '--registry', root, '-y'],
        s.io,
      ),
      s.err(),
    ).toBe(0)
    expect(existsSync(join(scratch, 'only-entry', 'src', 'app.ts'))).toBe(true)
  })

  it('takes a template folder as a source, and refuses a folder that holds a link', async () => {
    const folder = join(scratch, `folder-${counter++}`)
    mkdirSync(folder, { recursive: true })
    for (const [path, text] of Object.entries(app())) {
      mkdirSync(join(folder, path, '..'), { recursive: true })
      writeFileSync(join(folder, path), text)
    }
    const ok = fakeIo()
    expect(await runCreate(['fromfolder', folder, '-y'], ok.io), ok.err()).toBe(0)
    symlinkSync('/etc/passwd', join(folder, 'link'))
    const linked = fakeIo()
    expect(await runCreate(['linked', folder, '-y'], linked.io)).toBe(1)
    expect(linked.err()).toContain('symbolic link')
  })
})

describe('a GitHub address pasted from the browser', () => {
  it('is the same source as github:owner/repo, with .git or /tree/<ref> after it', () => {
    const plain = parseSource('github:acme/starter', scratch)
    expect(parseSource('https://github.com/acme/starter', scratch)).toEqual(plain)
    expect(parseSource('https://github.com/acme/starter.git', scratch)).toEqual(plain)
    expect(parseSource('https://github.com/acme/starter/', scratch)).toEqual(plain)
    expect(parseSource('https://github.com/acme/starter/tree/v2', scratch)).toEqual(
      parseSource('github:acme/starter#v2', scratch),
    )
    expect(parseSource('https://example.com/acme/starter', scratch)).toBeUndefined()
  })
})

describe('tarCommand', () => {
  it("is Windows' own tar on Windows, so Git's GNU tar first on PATH cannot read C:\\ as a host", () => {
    expect(tarCommand('win32', 'C:\\Windows')).toBe(join('C:\\Windows', 'System32', 'tar.exe'))
    expect(tarCommand('win32', undefined)).toBe(join('C:\\Windows', 'System32', 'tar.exe'))
    expect(tarCommand('linux')).toBe('tar')
    expect(tarCommand('darwin')).toBe('tar')
  })
})
