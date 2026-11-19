import { describe, expect, it } from 'vitest'
import { rewriteSpecifiers, toPackageSpecifiers } from '../src/rewrite.ts'

const table = new Map([
  ['acryl-instance', 'instance/index.ts'],
  ['acryl-instance/storage', 'instance/storage.ts'],
  ['acryl-openai', 'openai/index.ts'],
])
const moved = new Set(['instance'])

describe('toPackageSpecifiers', () => {
  it("rewrites the app's own import of a moved plugin to its package name", () => {
    const source =
      "import { selectInstance } from '../plugins/instance/index.ts'\nimport { x } from '../plugins/openai/index.ts'\n"
    expect(toPackageSpecifiers(source, 'src/main.ts', table, moved)).toBe(
      "import { selectInstance } from 'acryl-instance'\nimport { x } from '../plugins/openai/index.ts'\n",
    )
  })

  it("rewrites a copied plugin's sibling import, and a subpath", () => {
    const source = "import { open } from '../instance/storage.ts'\n"
    expect(toPackageSpecifiers(source, 'plugins/agent-panel/headless.ts', table, moved)).toBe(
      "import { open } from 'acryl-instance/storage'\n",
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
    ['acryl-instance/storage', 'instance/storage.ts'],
    ['acryl-home', 'home/index.ts'],
  ])

  it('turns a carried plugin into a relative path and leaves an installed one as its package name', () => {
    const source =
      "import { open } from 'acryl-instance/storage'\nimport { home } from 'acryl-home'\n"
    expect(
      rewriteSpecifiers(source, 'agent-panel/headless.ts', entries, new Set(['acryl-instance'])),
    ).toBe(
      "import { open } from 'acryl-instance/storage'\nimport { home } from '../home/index.ts'\n",
    )
  })

  it('rewrites everything when nothing is installed (the copy layout every app has had)', () => {
    expect(
      rewriteSpecifiers(
        "import { open } from 'acryl-instance/storage'\n",
        'agent-panel/headless.ts',
        entries,
      ),
    ).toBe("import { open } from '../instance/storage.ts'\n")
  })
})
