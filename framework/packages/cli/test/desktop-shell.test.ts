import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findDesktopShell } from '../src/desktop-shell.ts'

const made: string[] = []
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function app(): string {
  const dir = mkdtempSync(join(tmpdir(), 'desktop-shell-'))
  made.push(dir)
  writeFileSync(join(dir, 'package.json'), '{ "name": "notes", "private": true }\n')
  return dir
}

function withCopy(dir: string): void {
  mkdirSync(join(dir, 'plugins', 'desktop-shell'), { recursive: true })
  writeFileSync(join(dir, 'plugins', 'desktop-shell', 'main.ts'), '')
}

function withPackage(dir: string): void {
  const root = join(dir, 'node_modules', '@acryldev/desktop-shell')
  mkdirSync(join(root, 'lib'), { recursive: true })
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@acryldev/desktop-shell',
      exports: { './main': './lib/main.js', './package.json': './package.json' },
    }),
  )
  writeFileSync(join(root, 'lib', 'main.js'), '')
}

describe('findDesktopShell', () => {
  it('finds the copy an app carries (every app made before the shell was a package)', () => {
    const dir = app()
    withCopy(dir)
    expect(findDesktopShell(dir)).toEqual({
      kind: 'copy',
      root: join(dir, 'plugins', 'desktop-shell'),
      main: 'plugins/desktop-shell/main.ts',
    })
  })

  it('finds the package an app depends on, with its built entry under node_modules', () => {
    const dir = app()
    withPackage(dir)
    expect(findDesktopShell(dir)).toMatchObject({
      kind: 'package',
      main: 'node_modules/@acryldev/desktop-shell/lib/main.js',
    })
  })

  it('prefers the copy when an app has both (the copy is what it runs)', () => {
    const dir = app()
    withCopy(dir)
    withPackage(dir)
    expect(findDesktopShell(dir)?.kind).toBe('copy')
  })

  it('finds nothing for an app without a desktop shell', () => {
    expect(findDesktopShell(app())).toBeUndefined()
  })
})
