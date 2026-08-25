import { invoke } from '@tauri-apps/api/core'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type {
  TableSchemaInfo,
  DropTableResult,
  CommitTableChangesPayload,
  CommitTableChangesResult,
} from '../types/sql'

/**
 * Normalize a raw Tauri invocation failure into an `Error`.
 *
 * Backend commands return `Result<T, String>`, so rejections arrive as plain
 * strings (occasionally objects). Converting once here gives every caller a
 * consistent `err instanceof Error` contract without changing success types.
 */
async function invokeNormalized<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (raw) {
    if (raw instanceof Error) throw raw
    if (typeof raw === 'string') throw new Error(raw, { cause: raw })
    if (typeof raw === 'object' && raw !== null && 'message' in raw) {
      const msg = raw.message // unknown after `in` — validate before use
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(raw), {
        cause: raw,
      })
    }
    throw new Error(JSON.stringify(raw), { cause: raw })
  }
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

// ── SQL ─────────────────────────────────────────────────────────

export async function testConnection(
  payload: ConnectionPayload,
  sshPassword?: string,
  keyPassphrase?: string,
) {
  return invoke<{ ok: boolean; message: string }>('test_connection', {
    payload,
    sshPassword,
    keyPassphrase,
  })
}

export async function executeSql(payload: SqlQueryPayload) {
  return invokeNormalized<QueryResult>('execute_sql', { payload })
}

// ── Transaction Mode ───────────────────────────────────────────────

export interface TransactionStepResult {
  statementIndex: number
  success: boolean
  error: string | null
  elapsedMs: number
  queryResult: QueryResult | null
  rowsAffected: number
}

export async function sqlBeginTransaction(payload: ConnectionPayload) {
  return invokeNormalized<{ transactionId: string }>('sql_begin_transaction', {
    payload,
  })
}

export async function sqlExecuteInTransaction(
  payload: ConnectionPayload,
  transactionId: string,
  sql: string,
) {
  return invokeNormalized<TransactionStepResult>('sql_execute_in_transaction', {
    payload,
    transactionId,
    sql,
  })
}

export async function sqlCommitTransaction(
  payload: ConnectionPayload,
  transactionId: string,
) {
  return invokeNormalized<{ committed: boolean; elapsedMs: number }>(
    'sql_commit_transaction',
    {
      payload,
      transactionId,
    },
  )
}

export async function sqlRollbackTransaction(
  payload: ConnectionPayload,
  transactionId: string,
) {
  return invokeNormalized<{ committed: boolean; elapsedMs: number }>(
    'sql_rollback_transaction',
    {
      payload,
      transactionId,
    },
  )
}

// ── SQL Table Designer ───────────────────────────────────────────

export interface SqlTableSchemaPayload {
  payload: ConnectionPayload
  tableName: string
}

export async function sqlGetTableSchema(
  payload: ConnectionPayload,
  tableName: string,
) {
  return invokeNormalized<TableSchemaInfo>('sql_get_table_schema', {
    payload,
    tableName,
  })
}

export async function sqlGenerateDdl(
  payload: ConnectionPayload,
  current: TableSchemaInfo | null,
  pending: TableSchemaInfo,
) {
  return invoke<{
    statements: {
      order: number
      sql: string
      description: string
      isDestructive: boolean
    }[]
    isDestructive: boolean
    warnings: string[]
  }>('sql_generate_ddl', { payload, current, pending })
}

export async function sqlExecuteDdl(
  payload: ConnectionPayload,
  plan: {
    statements: {
      order: number
      sql: string
      description: string
      isDestructive: boolean
    }[]
    isDestructive: boolean
    warnings: string[]
  },
) {
  return invoke<{
    success: boolean
    executedCount: number
    statements: {
      order: number
      sql: string
      success: boolean
      error: string | null
      elapsedMs: number
    }[]
  }>('sql_execute_ddl', { payload, plan })
}

export interface DropTableRequest {
  connection: ConnectionPayload
  schema: string
  tableName: string
  cascade: boolean
}

export async function sqlDropTable(payload: DropTableRequest) {
  return invoke<DropTableResult>('sql_drop_table', { payload })
}

export async function sqlGetAllForeignKeys(payload: ConnectionPayload) {
  return invoke<import('../types/sql').SchemaForeignKey[]>(
    'sql_get_all_foreign_keys',
    { payload },
  )
}

export async function sqlGetAllColumns(payload: ConnectionPayload) {
  return invoke<import('../types/sql').SchemaColumn[]>('sql_get_all_columns', {
    payload,
  })
}

// ── Commit Table Changes (task-011c) ─────────────────────────

export async function commitTableChanges(payload: CommitTableChangesPayload) {
  return invoke<CommitTableChangesResult>('commit_table_changes', { payload })
}

// ── SQL Table Data Export ──────────────────────────────────────

export interface TableExportEstimateResponse {
  rowCount: number
  estimatedSizeBytes: number
  isLarge: boolean
}

export interface TableExportPayloadRequest {
  connection: ConnectionPayload
  tableName: string
  format: string
  options: {
    includeHeaders: boolean
    delimiter: string | null
    encoding: string
    sqlMode: string
  }
  savePath: string
}

export interface TableExportResultResponse {
  success: boolean
  filePath: string | null
  rowCount: number
  elapsedMs: number
  background: boolean
  error: string | null
}

export interface TableExportProgressEvent {
  rowsExported: number
  totalRows: number
  done: boolean
  error: string | null
}

export async function estimateTableExport(
  conn: ConnectionPayload,
  tableName: string,
): Promise<TableExportEstimateResponse> {
  return invoke<TableExportEstimateResponse>('estimate_table_export', {
    connection: conn,
    tableName,
  })
}

export async function executeTableExport(
  payload: TableExportPayloadRequest,
): Promise<TableExportResultResponse> {
  return invoke<TableExportResultResponse>('execute_table_export', { payload })
}
