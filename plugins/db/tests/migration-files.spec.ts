import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readMigrationFiles } from '../src/index.ts'

const folders: string[] = []
afterEach(async () => {
  await Promise.all(folders.splice(0).map(folder => rm(folder, { recursive: true, force: true })))
})

async function folderWith(files: Record<string, string>): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'acryl-db-files-'))
  folders.push(folder)
  await Promise.all(Object.entries(files).map(([name, text]) => writeFile(join(folder, name), text)))
  return folder
}

describe('readMigrationFiles', () => {
  it('reads NNN-name.sql files in number order, one migration per file, and ignores other files', async () => {
    const folder = await folderWith({ '010-ten.sql': 'ten', '002-two.sql': 'two', '001-one.sql': 'one', 'README.md': 'notes', ...Object.fromEntries([3, 4, 5, 6, 7, 8, 9].map(n => [`00${String(n)}-m.sql`, String(n)])) })
    const migrations = await readMigrationFiles(folder)
    expect(migrations.map(migration => migration.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(migrations[0]).toEqual({ version: 1, statements: ['one'] })
    expect(migrations[9]).toEqual({ version: 10, statements: ['ten'] })
  })

  it('accepts a file URL', async () => {
    const folder = await folderWith({ '001-one.sql': 'one' })
    expect(await readMigrationFiles(pathToFileURL(folder))).toEqual([{ version: 1, statements: ['one'] }])
  })

  it('answers [] for a folder with no migrations', async () => {
    expect(await readMigrationFiles(await folderWith({}))).toEqual([])
  })

  it('refuses a .sql file that is not named NNN-name.sql, naming it', async () => {
    const folder = await folderWith({ '001-one.sql': '', 'two.sql': '' })
    await expect(readMigrationFiles(folder)).rejects.toThrow('migration file two.sql')
    await expect(readMigrationFiles(await folderWith({ '001-Upper.sql': '' }))).rejects.toThrow('must be named NNN-name.sql')
  })

  it('refuses gaps, repeats and a start other than 1, naming the file', async () => {
    await expect(readMigrationFiles(await folderWith({ '001-a.sql': '', '003-c.sql': '' }))).rejects.toThrow('migration 003-c.sql')
    await expect(readMigrationFiles(await folderWith({ '001-a.sql': '', '01-b.sql': '' }))).rejects.toThrow('should be number 2')
    await expect(readMigrationFiles(await folderWith({ '002-b.sql': '' }))).rejects.toThrow('should be number 1')
  })
})
