import { invoke } from '@tauri-apps/api/core'

export interface ConnectionPayload {
  type: string
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
}

export interface SqlQueryPayload {
  connection: ConnectionPayload
  sql: string
}

export interface QueryResult {
  rowsAffected: number
  elapsedMs: number
  columns: string[]
  rows: Record<string, string>[]
}

export async function testConnection(payload: ConnectionPayload) {
  return invoke<{ ok: boolean; message: string }>('test_connection', { payload })
}

export async function executeSql(payload: SqlQueryPayload) {
  return invoke<QueryResult>('execute_sql', { payload })
}
