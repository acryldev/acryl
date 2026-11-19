import { describe, expect, it } from 'vitest'
import { packageOf, rewriteSpecifiers, toPackageSpecifiers } from '../src/rewrite.ts'

const table = new Map([
  ['@acryldev/instance', 'instance/index.ts'],
  ['@acryldev/instance/storage', 'instance/storage.ts'],
  ['@acryldev/openai', 'openai/index.ts'],
])
const moved = new Set(['instance'])

describe('toPackageSpecifiers', () => {
  it("rewrites the app's own import of a moved plugin to its package name", () => {
    const source =
      "import { selectInstance } from '../plugins/instance/index.ts'\nimport { x } from '../plugins/openai/index.ts'\n"
    expect(toPackageSpecifiers(source, 'src/main.ts', table, moved)).toBe(
      "import { selectInstance } from '@acryldev/instance'\nimport { x } from '../plugins/openai/index.ts'\n",
    )
  })

  it("rewrites a copied plugin's sibling import, and a subpath", () => {
    const source = "import { open } from '../instance/storage.ts'\n"
    expect(toPackageSpecifiers(source, 'plugins/agent-panel/headless.ts', table, moved)).toBe(
      "import { open } from '@acryldev/instance/storage'\n",
    )
  })

  it('leaves comments and strings alone', () => {
    const source =
      "// from '../plugins/instance/index.ts'\nconst s = \"import x from '../plugins/instance/index.ts'\"\n"
    expect(toPackageSpecifiers(source, 'src/main.ts', table, moved)).toBe(source)
  })

  it('refuses an import of a moved file its package does not export', () => {
    expect(() =>
      toPackageSpecifiers(
        "import { y } from '../plugins/instance/internal.ts'\n",
        'src/main.ts',
        table,
        moved,
      ),
    ).toThrow(/does not export/)
  })
})

describe('rewriteSpecifiers with installed packages', () => {
  const entries = new Map([
    ['@acryldev/instance/storage', 'instance/storage.ts'],
    ['@acryldev/home', 'home/index.ts'],
  ])

  it('turns a carried plugin into a relative path and leaves an installed one as its package name', () => {
    const source =
      "import { open } from '@acryldev/instance/storage'\nimport { home } from '@acryldev/home'\n"
    expect(
      rewriteSpecifiers(source, 'agent-panel/headless.ts', entries, new Set(['@acryldev/instance'])),
    ).toBe(
      "import { open } from '@acryldev/instance/storage'\nimport { home } from '../home/index.ts'\n",
    )
  })

  it('rewrites everything when nothing is installed (the copy layout every app has had)', () => {
    expect(
      rewriteSpecifiers(
        "import { open } from '@acryldev/instance/storage'\n",
        'agent-panel/headless.ts',
        entries,
      ),
    ).toBe("import { open } from '../instance/storage.ts'\n")
  })
})

describe('scoped names (spec 051 T038)', () => {
  it('splits a specifier into its package', () => {
    expect(packageOf('@acryldev/instance/storage')).toBe('@acryldev/instance')
    expect(packageOf('@acryldev/instance')).toBe('@acryldev/instance')
    expect(packageOf('@acryldev/router/middleware')).toBe('@acryldev/router')
  })

  it('rewrites a copied @acryldev plugin and keeps an installed one', () => {
    const entries = new Map([
      ['@acryldev/instance/storage', 'instance/storage.ts'],
      ['@acryldev/router/middleware', 'router/src/middleware/index.ts'],
    ])
    const source =
      "import { open } from '@acryldev/instance/storage'\nimport { m } from '@acryldev/router/middleware'\n"
    expect(
      rewriteSpecifiers(
        source,
        'agent-panel/headless.ts',
        entries,
        new Set(['@acryldev/instance']),
      ),
    ).toBe(
      "import { open } from '@acryldev/instance/storage'\nimport { m } from '../router/src/middleware/index.ts'\n",
    )
  })

  it('refuses an @acryldev name that is not a library plugin', () => {
    expect(() =>
      rewriteSpecifiers("import x from '@acryldev/nope'\n", 'a/b.ts', new Map()),
    ).toThrow(/not a library plugin/)
  })
})
