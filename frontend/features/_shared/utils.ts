import { getConnectionPassword } from './services/tauriClient'
import type { ConnectionType } from './types/domain'
import type { SqlConnectionType } from './types/shared'
import type { ConnectionProfile } from './types/domain'

// UTILS CONNECTION TYPE
export function isSqlConnectionType(
  type: ConnectionType,
): type is SqlConnectionType {
  return type === 'postgresql' || type === 'mysql' || type === 'sqlite'
}

export function isElasticsearchType(type: ConnectionType): boolean {
  return type === 'elasticsearch'
}

export function isRedisConnectionType(type: ConnectionType): boolean {
  return type === 'redis'
}

export function downloadTextFile(
  name: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function createCsv(columns: string[], rows: Record<string, string>[]) {
  const escaped = (value: string) => `"${value.replaceAll('"', '""')}"`
  const header = columns.map(escaped).join(',')
  const body = rows
    .map((row) =>
      columns.map((column) => escaped(String(row[column] ?? ''))).join(','),
    )
    .join('\n')
  return `${header}\n${body}`
}

// Get connection payload for backend commands
// Note: password is NOT included here - it should be fetched separately from keyring
export function getConnPayload(conn: ConnectionProfile, schema?: string) {
  return {
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    // Password removed - must be fetched from keyring using conn.passwordRef
    database: conn.database,
    ssl: conn.ssl,
    sslConfig: isSqlConnectionType(conn.type) ? conn.sslConfig : undefined,
    schema: schema ?? '',
    poolSize: conn.poolSize,
    idleTimeoutSecs: conn.idleTimeoutSecs,
    statementTimeoutMs: conn.statementTimeoutMs,
  }
}

// Get connection payload WITH password fetched from keyring
// Use this when you need to actually execute queries against a connection.
//
// Keyring failures REJECT with a stable, actionable message. We never return
// an empty password (that would surface a confusing auth error against the
// database) and we never log the connection id or raw keyring error — both
// could aid credential probing.
export const KEYRING_RECOVERY_MESSAGE =
  'Failed to retrieve stored password. Re-save the connection credentials and retry.'

export async function getConnPayloadWithPassword(
  conn: ConnectionProfile,
  schema?: string,
) {
  let password = ''
  if (conn.passwordRef) {
    try {
      password = await getConnectionPassword(conn.id)
    } catch {
      throw new Error(KEYRING_RECOVERY_MESSAGE)
    }
    if (!password) {
      throw new Error(KEYRING_RECOVERY_MESSAGE)
    }
  }
  return {
    ...getConnPayload(conn, schema),
    password,
  }
}

/**
 * Escape a SQL string value and wrap in single quotes for use in WHERE clauses.
 * Prevents SQL injection by doubling internal single quotes.
 *
 * @example sqlString("O'Reilly") → "'O''Reilly'"
 */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Escape a SQL identifier (schema/table/column name) for use in double-quoted
 * or backtick-quoted contexts. Doubles the relevant quote character inside.
 *
 * @example quoteIdentifier("my table", '"') → '"my table"'
 * @example quoteIdentifier("my`table", '`') → '`my``table`'
 */
export function quoteIdentifier(id: string, quote: '"' | '`'): string {
  const escaped = id.replaceAll(quote, quote + quote)
  return `${quote}${escaped}${quote}`
}

// ---------------------------------------------------------------------------
// Route-prefix utilities (used by tab system)
// ---------------------------------------------------------------------------

const ROUTE_PREFIX_MAP: Record<ConnectionType, string> = {
  postgresql: '/sql',
  mysql: '/sql',
  elasticsearch: '/elasticsearch',
  redis: '/redis',
  mongodb: '/mongodb',
  sqlite: '/sql',
}

/**
 * Returns the top-level route prefix for a given connection type.
 *
 * @example getConnectionRoutePrefix('postgresql') → '/sql'
 */
export function getConnectionRoutePrefix(type: ConnectionType): string {
  return ROUTE_PREFIX_MAP[type] ?? '/'
}

/**
 * Returns the full default route for a connection, combining the service
 * prefix with the connection id.
 *
 * @example getConnectionDefaultRoute('postgresql', 'abc-123') → '/sql/abc-123'
 */
export function getConnectionDefaultRoute(
  type: ConnectionType,
  connectionId: string,
): string {
  return `${getConnectionRoutePrefix(type)}/${connectionId}`
}
