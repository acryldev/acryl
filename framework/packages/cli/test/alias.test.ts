import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const framework = join(import.meta.dirname, '..', '..', '..')
const manifest = (folder: string) =>
  JSON.parse(readFileSync(join(framework, 'packages', folder, 'package.json'), 'utf8')) as {
    name: string
    version: string
    bin?: Record<string, string>
    dependencies?: Record<string, string>
  }

it('the short-name alias packages track the scoped packages exactly (spec 051 T038)', () => {
  const blends = manifest('cli')
  const create = manifest('create')
  const blendsAlias = manifest('cli-alias')
  const createAlias = manifest('create-alias')
  expect(blends.name).toBe('@acryldev/blends')
  expect(create.name).toBe('@acryldev/create-blends')
  expect(blends.bin?.acrylblends).toBe('./bin/acrylblends.js')
  expect(create.bin?.['create-blends']).toBe('./bin/create-acrylblends.js')
  // The short names stay installable at the same version, and their only dependency is the scoped package at that exact version.
  expect(blendsAlias).toMatchObject({ name: 'acrylblends', version: blends.version })
  expect(createAlias).toMatchObject({ name: 'create-acrylblends', version: create.version })
  // pnpm turns `workspace:*` into the exact version in the published manifest; the versions must match the scoped package's.
  expect(blendsAlias.dependencies).toEqual({ '@acryldev/blends': 'workspace:*' })
  expect(createAlias.dependencies).toEqual({ '@acryldev/create-blends': 'workspace:*' })
})
