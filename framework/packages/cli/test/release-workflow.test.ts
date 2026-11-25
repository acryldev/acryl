import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import type { Io } from '../src/io'
import {
  productOfApp,
  RELEASE_WORKFLOW,
  releaseWorkflow,
  writeReleaseWorkflow,
} from '../src/release-workflow'

const scratch = mkdtempSync(join(tmpdir(), 'acrylblends-release-workflow-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const session = (cwd: string) => {
  const out: string[] = []
  const io: Io = {
    stdout: { write: (t: string) => out.push(t) },
    stderr: { write: () => {} },
    cwd,
    ask: undefined,
    install: async () => 0,
  }
  return { io, out: () => out.join('') }
}

describe('acrylblends release-workflow (spec 052 T061)', () => {
  it('builds the installers on a v tag for macOS, Windows and Linux and publishes them as the Latest release', () => {
    const workflow = parse(releaseWorkflow('Notes', '1.7.35')) as {
      on: { push: { tags: string[] } }
      env: Record<string, string>
      jobs: {
        pack: {
          strategy: { matrix: { include: { platform: string; arch: string }[] } }
          steps: { run?: string }[]
        }
        release: { needs: string; permissions: Record<string, string> }
      }
    }
    expect(workflow.on.push.tags).toEqual(['v*'])
    expect(workflow.env).toEqual({ ACRYLBLENDS: '@acryldev/blends@1.7.35', PRODUCT: 'Notes' })
    expect(
      workflow.jobs.pack.strategy.matrix.include.map((row) => `${row.platform}-${row.arch}`),
    ).toEqual(['mac-arm64', 'mac-x64', 'win-x64', 'linux-x64'])
    expect(workflow.jobs.release).toMatchObject({
      needs: 'pack',
      permissions: { contents: 'write' },
    })
  })

  it('keeps a hostile product name out of every command line: it reaches the shell only as $PRODUCT', () => {
    const product = 'My "App"; rm -rf / $(whoami)'
    const text = releaseWorkflow(product, '1.7.35')
    const workflow = parse(text) as {
      env: Record<string, string>
      jobs: Record<string, { steps: { run?: string }[] }>
    }
    expect(workflow.env.PRODUCT).toBe(product)
    const runs = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.map((step) => step.run ?? ''),
    )
    for (const run of runs) expect(run).not.toContain('whoami')
  })

  it('reads the product from blend.yaml metadata, writes the workflow once, and keeps an existing one unless --force', () => {
    const app = join(scratch, 'notes')
    mkdirSync(app, { recursive: true })
    writeFileSync(
      join(app, 'blend.yaml'),
      'apiVersion: blends.acryl.dev/v1alpha1\nkind: Blueprint\nmetadata:\n  id: acrylblends.notes\n  name: "Notes Pro"\nspec:\n  rows:\n    - id: router\n      name: acryl-router\n',
    )
    expect(productOfApp(readFileSync(join(app, 'blend.yaml'), 'utf8'))).toBe('Notes Pro')
    const first = session(app)
    expect(
      writeReleaseWorkflow({ directory: undefined, product: undefined, force: false }, first.io),
    ).toBe(0)
    expect(first.out()).toContain("Notes Pro's installers")
    const file = join(app, RELEASE_WORKFLOW)
    expect(existsSync(file)).toBe(true)
    writeFileSync(file, '# the owner changed it\n')
    const second = session(app)
    writeReleaseWorkflow({ directory: undefined, product: undefined, force: false }, second.io)
    expect(readFileSync(file, 'utf8')).toBe('# the owner changed it\n')
    expect(second.out()).toContain('kept')
    writeReleaseWorkflow({ directory: undefined, product: undefined, force: true }, session(app).io)
    expect(readFileSync(file, 'utf8')).toContain('PRODUCT: "Notes Pro"')
  })

  it('refuses an app that names no product', () => {
    const app = join(scratch, 'nameless')
    mkdirSync(app, { recursive: true })
    expect(() =>
      writeReleaseWorkflow(
        { directory: undefined, product: undefined, force: false },
        session(app).io,
      ),
    ).toThrow(/names no product/u)
  })
})
