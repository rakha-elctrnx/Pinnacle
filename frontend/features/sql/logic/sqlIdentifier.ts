import type { ConnectionType } from '../../_shared/types/domain'
import type { SqlConnectionType } from '../../_shared/types/shared'
import { quoteIdentifier } from '../../_shared/utils'

export type SqlEngine = ConnectionType | SqlConnectionType | string

/**
 * The quote character SQL uses for identifiers on a given engine:
 * double quotes for postgresql/sqlite, backticks for mysql.
 *
 * @example engineQuoteForEngine('postgresql') → '"'
 * @example engineQuoteForEngine('mysql') → '`'
 */
export function engineQuoteForEngine(engine: SqlEngine): '"' | '`' {
  return engine === 'mysql' ? '`' : '"'
}

/**
 * Quote a single SQL identifier (schema/table/column/database name) for the
 * given engine. Always quotes, and escapes embedded quote characters by
 * doubling them. sqlite behaves like postgresql.
 *
 * @example quoteIdentifierForEngine('postgresql', 'users') → '"users"'
 * @example quoteIdentifierForEngine('mysql', 'users') → '`users`'
 * @example quoteIdentifierForEngine('postgresql', 'Order Items') → '"Order Items"'
 * @example quoteIdentifierForEngine('postgresql', 'a"b') → '"a""b"'
 * @example quoteIdentifierForEngine('mysql', 'a`b') → '`a``b`'
 * @example quoteIdentifierForEngine('sqlite', 'users') → '"users"'
 */
export function quoteIdentifierForEngine(
  engine: SqlEngine,
  identifier: string,
): string {
  return quoteIdentifier(identifier, engineQuoteForEngine(engine))
}

/**
 * Quote a schema-qualified identifier for the given engine: `qualifier`.`id`
 * when a qualifier is present and non-empty, otherwise just the quoted id.
 * For mysql the qualifier is the database name.
 *
 * @example qualifyIdentifierForEngine('postgresql', 'public', 'users') → '"public"."users"'
 * @example qualifyIdentifierForEngine('mysql', 'mydb', 'users') → '`mydb`.`users`'
 * @example qualifyIdentifierForEngine('postgresql', undefined, 'Order Items') → '"Order Items"'
 * @example qualifyIdentifierForEngine('sqlite', undefined, 'users') → '"users"'
 */
export function qualifyIdentifierForEngine(
  engine: SqlEngine,
  qualifier: string | undefined,
  identifier: string,
): string {
  const quotedId = quoteIdentifierForEngine(engine, identifier)
  if (!qualifier) return quotedId
  return `${quoteIdentifierForEngine(engine, qualifier)}.${quotedId}`
}
