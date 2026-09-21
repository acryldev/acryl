import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { reconcileProfileLayout } from '../src/profile-layout.ts'

function profile(recorded: Record<string, unknown> | undefined, workspace: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), 'acryl-layout-'))
  if (recorded !== undefined) {
    mkdirSync(join(dir, 'node_modules'))
    // pnpm >= 10 writes JSON, older pnpm writes YAML; both are YAML documents.
    writeFileSync(join(dir, 'node_modules', '.modules.yaml'), JSON.stringify(recorded))
  }
  if (workspace !== undefined) writeFileSync(join(dir, 'pnpm-workspace.yaml'), workspace)
  return dir
}
const read = (dir: string): Record<string, unknown> => parse(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')) as Record<string, unknown>

describe('reconcileProfileLayout', () => {
  it('pins a recorded isolated layout over a workspace file that asks for hoisted', () => {
    const dir = profile({ nodeLinker: 'isolated' }, 'packages:\n  - .\n# keep me\nnodeLinker: hoisted\n')
    expect(reconcileProfileLayout(dir)).toEqual([{ key: 'nodeLinker', from: 'hoisted', to: 'isolated' }])
    expect(read(dir)['nodeLinker']).toBe('isolated')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('# keep me')
  })

  it('treats an absent nodeLinker as isolated and pins a recorded hoisted layout', () => {
    const dir = profile({ nodeLinker: 'hoisted' }, 'packages:\n  - .\n')
    reconcileProfileLayout(dir)
    expect(read(dir)['nodeLinker']).toBe('hoisted')
  })

  it('pins the recorded publicHoistPattern, including an empty one, and reads YAML-format records', () => {
    const dir = profile(undefined, 'packages:\n  - .\n')
    mkdirSync(join(dir, 'node_modules'))
    writeFileSync(join(dir, 'node_modules', '.modules.yaml'), 'nodeLinker: isolated\npublicHoistPattern:\n  - "*eslint*"\n  - "*prettier*"\n')
    expect(reconcileProfileLayout(dir).map(change => change.key)).toEqual(['publicHoistPattern'])
    expect(read(dir)['publicHoistPattern']).toEqual(['*eslint*', '*prettier*'])
    const empty = profile({ nodeLinker: 'isolated', publicHoistPattern: [] }, 'packages:\n  - .\n')
    reconcileProfileLayout(empty)
    expect(read(empty)['publicHoistPattern']).toEqual([])
  })

  it('is idempotent and leaves agreeing or unlaid-out profiles untouched', () => {
    const dir = profile({ nodeLinker: 'isolated', publicHoistPattern: ['*eslint*'] }, 'packages:\n  - .\nnodeLinker: isolated\npublicHoistPattern:\n  - "*eslint*"\n')
    expect(reconcileProfileLayout(dir)).toEqual([])
    const before = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    expect(reconcileProfileLayout(dir)).toEqual([])
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toBe(before)
    expect(reconcileProfileLayout(profile(undefined, 'packages:\n  - .\n'))).toEqual([])
    expect(reconcileProfileLayout(profile({ nodeLinker: 'hoisted' }, undefined))).toEqual([])
  })
})
