import { invoke } from '@tauri-apps/api/core'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type {
  ElasticClusterInfo,
  ElasticClusterHealth,
  ElasticIndex,
  ElasticDocumentSearchResult,
  ElasticQueryResult,
} from '../types/elasticsearch'

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
  return invoke<ElasticClusterHealth>('elastic_get_cluster_health', {
    payload,
  })
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
  return invoke<ElasticDocumentSearchResult>('elastic_search_documents', {
    payload,
  })
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
