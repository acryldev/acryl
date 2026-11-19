/**
 * Postgres's dialect of the port, for every Postgres provider: this one, over `pg`, and `acryl-db-pglite`, embedded. The port's `?`
 * bindings in Postgres's spelling, and the check that a statement got as many values as it binds. This entry imports nothing, so a
 * provider that uses it does not load `pg`.
 */

import { translatePlaceholders } from './placeholders.ts'

export { translatePlaceholders, type TranslatedSql } from './placeholders.ts'

/**
 * The statement in `$n` spelling.
 * @param provider - the provider's name, which starts the error message.
 * @throws when the statement binds a different number of values than it was given.
 */
export function bindStatement(provider: string, sql: string, valueCount: number): string {
  const { text, count } = translatePlaceholders(sql)
  if (count !== valueCount) throw new Error(`${provider}: the statement has ${String(count)} ? placeholder${count === 1 ? '' : 's'} but ${String(valueCount)} value${valueCount === 1 ? ' was' : 's were'} given`)
  return text
}
