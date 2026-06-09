import type { ConnectionType } from '../../types/domain'
import type { SqlConnectionType } from './types'
import type { ConnectionProfile } from '../../types/domain'

export function isSqlConnectionType(type: ConnectionType): type is SqlConnectionType {
  return type === 'postgresql' || type === 'mysql'
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

export function getConnPayload(conn: ConnectionProfile, schema?: string) {
  return {
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password ?? '',
    database: conn.database,
    ssl: conn.ssl,
    schema: schema ?? '',
  }
}

/**
 * Escape a SQL identifier (schema/table/column name) for use in queries
 * to prevent SQL injection. Doubles quotes inside the identifier and wraps it.
 */
export function escapeSqlIdentifier(id: string): string {
  return id.replaceAll("'", "''")
}
