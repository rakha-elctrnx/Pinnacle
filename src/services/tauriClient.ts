import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import type {
  ElasticClusterInfo,
  ElasticClusterHealth,
  ElasticIndex,
  ElasticDocumentSearchResult,
  ElasticQueryResult,
  TableSchemaInfo,
  DropTableResult,
} from '../types/domain'

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

// ── SQL ─────────────────────────────────────────────────────────

export async function testConnection(payload: ConnectionPayload) {
  return invoke<{ ok: boolean; message: string }>('test_connection', { payload })
}

export async function executeSql(payload: SqlQueryPayload) {
  return invoke<QueryResult>('execute_sql', { payload })
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
  return invoke<TableSchemaInfo>('sql_get_table_schema', {
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
    statements: { order: number; sql: string; description: string; isDestructive: boolean }[]
    isDestructive: boolean
    warnings: string[]
  }>('sql_generate_ddl', { payload, current, pending })
}

export async function sqlExecuteDdl(
  payload: ConnectionPayload,
  plan: {
    statements: { order: number; sql: string; description: string; isDestructive: boolean }[]
    isDestructive: boolean
    warnings: string[]
  },
) {
  return invoke<{
    success: boolean
    executedCount: number
    statements: { order: number; sql: string; success: boolean; error: string | null; elapsedMs: number }[]
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
  return invoke<import('../types/domain').SchemaForeignKey[]>(
    'sql_get_all_foreign_keys',
    { payload },
  )
}

export async function sqlGetAllColumns(payload: ConnectionPayload) {
  return invoke<import('../types/domain').SchemaColumn[]>(
    'sql_get_all_columns',
    { payload },
  )
}

// ── Elasticsearch ───────────────────────────────────────────────

export interface ElasticQueryPayload {
  connection: ConnectionPayload
  method: string
  path: string
  body?: unknown
}

export interface IndexCreatePayload {
  connection: ConnectionPayload
  indexName: string
  settings?: unknown
}

export interface IndexActionPayload {
  connection: ConnectionPayload
  indexName: string
}

export interface DocumentPayload {
  connection: ConnectionPayload
  indexName: string
  docId?: string
  document: unknown
}

export interface DocumentDeletePayload {
  connection: ConnectionPayload
  indexName: string
  docId: string
}

export interface DocumentSearchPayload {
  connection: ConnectionPayload
  indexName: string
  query?: unknown
  fromOffset?: number
  size?: number
  sort?: unknown
}

export async function elasticTestConnection(payload: ConnectionPayload) {
  return invoke<void>('elastic_test_connection', { payload })
}

export async function elasticExecuteQuery(payload: ElasticQueryPayload) {
  return invoke<ElasticQueryResult>('elastic_execute_query', { payload })
}

export async function elasticGetClusterInfo(payload: ConnectionPayload) {
  return invoke<ElasticClusterInfo>('elastic_get_cluster_info', { payload })
}

export async function elasticGetClusterHealth(payload: ConnectionPayload) {
  return invoke<ElasticClusterHealth>('elastic_get_cluster_health', { payload })
}

export async function elasticGetClusterStats(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_get_cluster_stats', { payload })
}

export async function elasticGetNodeStats(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_get_node_stats', { payload })
}

export async function elasticListIndices(payload: ConnectionPayload) {
  return invoke<ElasticIndex[]>('elastic_list_indices', { payload })
}

export async function elasticCreateIndex(payload: IndexCreatePayload) {
  return invoke<unknown>('elastic_create_index', { payload })
}

export async function elasticDeleteIndex(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_delete_index', { payload })
}

export async function elasticOpenIndex(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_open_index', { payload })
}

export async function elasticCloseIndex(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_close_index', { payload })
}

export async function elasticRefreshIndex(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_refresh_index', { payload })
}

export async function elasticGetMapping(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_get_index_mapping', { payload })
}

export async function elasticGetSettings(payload: IndexActionPayload) {
  return invoke<unknown>('elastic_get_index_settings', { payload })
}

export async function elasticSearchDocuments(payload: DocumentSearchPayload) {
  return invoke<ElasticDocumentSearchResult>('elastic_search_documents', { payload })
}

export async function elasticIndexDocument(payload: DocumentPayload) {
  return invoke<unknown>('elastic_index_document', { payload })
}

export async function elasticDeleteDocument(payload: DocumentDeletePayload) {
  return invoke<unknown>('elastic_delete_document', { payload })
}

export async function elasticListTemplates(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_list_templates', { payload })
}

export async function elasticListPipelines(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_list_pipelines', { payload })
}

export async function elasticListAliases(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_list_aliases', { payload })
}

export async function elasticListShards(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_list_shards', { payload })
}

export async function elasticGetNodesInfo(payload: ConnectionPayload) {
  return invoke<unknown>('elastic_get_nodes_info', { payload })
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

/**
 * Show a native save dialog and return the chosen path, or null if cancelled.
 */
export async function showExportSaveDialog(
  suggestedFilename: string,
): Promise<string | null> {
  // Extract the extension from the suggested filename for the file filter.
  // Using extensions: ['*'] causes macOS to append a literal ".*" to the name.
  const ext = suggestedFilename.includes('.')
    ? suggestedFilename.split('.').pop() ?? '*'
    : '*'
  return save({
    defaultPath: suggestedFilename,
    filters: [
      { name: 'All Files', extensions: [ext] },
    ],
  })
}