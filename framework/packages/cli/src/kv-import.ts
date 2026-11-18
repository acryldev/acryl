import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { UsageError } from './init'
import type { Io } from './io'

export interface KvImportOptions {
  readonly from: string
  readonly to: string
  readonly overwrite: boolean
  readonly table: string | undefined
  readonly migrations: string | undefined
}

/** Parse `kv import <kv.json> <database.sqlite> [--overwrite] [--table name] [--migrations dir]`. */
export function parseKvOptions(argv: readonly string[]): KvImportOptions {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (error) {
    throw new UsageError((error as Error).message)
  }
  const [action, from, to, ...rest] = parsed.positionals
  if (action !== 'import')
    throw new UsageError('kv takes one subcommand: kv import <kv.json> <database.sqlite>')
  if (from === undefined || to === undefined || rest.length > 0)
    throw new UsageError('kv import takes two arguments: the JSON file and the SQLite file')
  return {
    from,
    to,
    overwrite: parsed.values.overwrite ?? false,
    table: parsed.values.table,
    migrations: parsed.values.migrations,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      overwrite: { type: 'boolean' },
      table: { type: 'string' },
      migrations: { type: 'string' },
    },
  })

/** The framework as the app has it installed (so the code that reads the file is the code the app runs), else this package's own. */
async function framework<T>(io: Io, subpath: string, own: string): Promise<T> {
  const here = createRequire(resolve(io.cwd, 'package.json'))
  try {
    return (await import(here.resolve(`acrylblends/${subpath}`))) as T
  } catch {
    return (await import(new URL(`../lib/${own}`, import.meta.url).href)) as T
  }
}

/**
 * Import a JSON-file kv store into the `kv` table of an app's SQLite database: the move from `acryl-kv-json` to SQL. The file is not changed.
 * The database is opened with the app's `migrations/` folder when it has one (a database whose schema is newer than the files given is refused),
 * and the table is created when missing. Refuses to overwrite a key the table already has unless `--overwrite`.
 */
export async function kvImport(options: KvImportOptions, io: Io): Promise<number> {
  const from = resolve(io.cwd, options.from)
  const to = resolve(io.cwd, options.to)
  if (!existsSync(from)) {
    io.stderr.write(`error: ${from} does not exist\n`)
    return 1
  }
  const kvCore = await framework<typeof import('../lib/kv')>(io, 'kv', 'kv.js')
  const json = await framework<typeof import('../lib/kv/json')>(io, 'kv/json', 'kv/json.js')
  const onDb = await framework<typeof import('../lib/kv/db')>(io, 'kv/db', 'kv/db.js')
  const sqlite = await framework<typeof import('../lib/db/sqlite')>(io, 'db/sqlite', 'db/sqlite.js')
  const migrations =
    options.migrations !== undefined
      ? resolve(io.cwd, options.migrations)
      : existsSync(resolve(io.cwd, 'migrations'))
        ? resolve(io.cwd, 'migrations')
        : undefined
  const source = await json.openKv({ path: from })
  try {
    const database = await sqlite.openDb({
      path: to,
      ...(migrations === undefined ? {} : { migrations }),
    })
    try {
      const target = onDb.kvOnDb(
        database.db,
        options.table === undefined ? {} : { table: options.table },
      )
      const result = await kvCore.copyKv(source.kv, target, { overwrite: options.overwrite })
      io.stdout.write(
        `imported ${result.copied} ${result.copied === 1 ? 'key' : 'keys'} from ${options.from} into ${options.to}` +
          `${options.table === undefined ? '' : ` (table ${options.table})`}` +
          `${result.overwritten > 0 ? `, ${result.overwritten} overwritten` : ''}\n`,
      )
      return 0
    } finally {
      await database.close()
    }
  } finally {
    await source.close()
  }
}
