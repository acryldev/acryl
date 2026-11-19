import { describe, expect, it } from 'vitest'
import { toPackageSpecifiers } from '../src/rewrite.ts'

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
