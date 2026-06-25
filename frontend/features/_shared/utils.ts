import type { ConnectionType } from './types/domain'
import type { SqlConnectionType } from './types/shared'
import type { ConnectionProfile } from './types/domain'

// UTILS CONNECTION TYPE
export function isSqlConnectionType(type: ConnectionType): type is SqlConnectionType {
  return type === 'postgresql' || type === 'mysql'
}

export function isElasticsearchType(type: ConnectionType): boolean {
  return type === 'elasticsearch'
}

export function isRedisConnectionType(type: ConnectionType): boolean {
  return type === 'redis'
}

export function downloadTextFile(name: string, content: string, mimeType: string) {
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
    .map((row) => columns.map((column) => escaped(String(row[column] ?? ''))).join(','))
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
    schema: schema ?? '',
  }
}

// Get connection payload WITH password fetched from keyring
// Use this when you need to actually execute queries against a connection
export async function getConnPayloadWithPassword(conn: ConnectionProfile, schema?: string) {
  const { getConnectionPassword } = await import('./services/tauriClient')
  const password = conn.passwordRef
    ? await getConnectionPassword(conn.id).catch((err) => {
        console.warn(`[keyring] Failed to retrieve password for connection ${conn.id}:`, err)
        return ''
      })
    : ''
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
