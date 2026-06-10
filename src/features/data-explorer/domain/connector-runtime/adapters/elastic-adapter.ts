/**
 * Elasticsearch Adapter — connector implementation.
 *
 * Wraps the tauriClient Elasticsearch functions behind the ConnectorAdapter contract.
 * Provides test connection, index listing (navigation tree), entity details, and query execution.
 */

import {
  elasticTestConnection,
  elasticExecuteQuery,
  elasticListIndices,
  elasticGetMapping,
  elasticSearchDocuments,
  elasticCreateIndex,
  elasticDeleteIndex,
  type ConnectionPayload,
} from '../../../../../services/tauriClient'
import { normalizeError } from '../error-norm'
import type { ConnectorAdapter, TestConnectionResult, NavigationTreeResult, EntityDetailResult, QueryExecutionResult } from './adapter-types'

export const elasticAdapter: ConnectorAdapter = {
  label: 'Elasticsearch',

  async testConnection(payload: ConnectionPayload): Promise<TestConnectionResult> {
    try {
      await elasticTestConnection(payload)
      return { kind: 'success', message: 'Connection successful' }
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Connection failed',
        normalizedError: normalizeError(err),
      }
    }
  },

  async loadNavigationTree(payload: ConnectionPayload): Promise<NavigationTreeResult> {
    try {
      const indices = await elasticListIndices(payload)
      const databaseName = `elastic_${payload.host}_${payload.port}`

      const flatIndexNames = indices.map((idx) => idx.index)

      const databases = [
        {
          name: databaseName,
          schemas: [
            {
              name: 'indices',
              tables: flatIndexNames,
              views: [],
              functions: [],
            },
          ],
          loaded: true,
        },
      ]

      return { databases, flatTables: flatIndexNames }
    } catch {
      return {
        databases: [],
        flatTables: [],
      }
    }
  },

  async openEntity(payload: ConnectionPayload, entityName: string): Promise<EntityDetailResult> {
    try {
      // Get mapping for the index
      const mapping = await elasticGetMapping({
        connection: payload,
        indexName: entityName,
      })

      // Extract fields from mapping
      const fields = extractFieldsFromMapping(mapping, entityName)

      // Get document count via search
      const searchResult = await elasticSearchDocuments({
        connection: payload,
        indexName: entityName,
        size: 0,
      })

      const columns = fields.map((f) => f.name)
      const structure = fields.map((f) => ({
        column: f.name,
        type: f.type,
        nullable: 'true',
      }))

      // Get sample documents
      const sampleResult = await elasticSearchDocuments({
        connection: payload,
        indexName: entityName,
        size: 50,
      })

      const rows = sampleResult.hits.map((hit) => {
        const row: Record<string, string> = {}
        const src = hit._source as Record<string, unknown>
        for (const col of columns) {
          const val = src[col]
          row[col] = val !== undefined ? String(val) : ''
        }
        return row
      })

      const stats = {
        rows: String(searchResult.total),
        columns: String(columns.length),
        size: '',
        indexes: '',
      }

      return { stats, structure, indexes: [], columns, rows }
    } catch {
      return {
        stats: null,
        structure: [],
        indexes: [],
        columns: [],
        rows: [],
      }
    }
  },

  async runQuery(
    payload: ConnectionPayload,
    query: string,
  ): Promise<QueryExecutionResult> {
    // For Elasticsearch, the "query" is a JSON string representing the query DSL
    // We use elasticExecuteQuery with POST method to _search endpoint
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(query)
    } catch {
      // If not valid JSON, treat as a simple query_string
      parsedBody = { query: { query_string: { query } } }
    }

    const result = await elasticExecuteQuery({
      connection: payload,
      method: 'POST',
      path: '/_search',
      body: parsedBody,
    })

    const data = result.data as Record<string, unknown> | undefined
    const hits = (data?.hits as Record<string, unknown> | undefined)?.hits as Array<Record<string, unknown>> | undefined ?? []

    // Extract columns from first hit
    const columns = hits.length > 0
      ? Object.keys(hits[0]._source as Record<string, unknown> ?? {})
      : ['_id', '_index', '_score']

    const rows = hits.map((hit) => {
      const row: Record<string, string> = {
        _id: String(hit._id ?? ''),
        _index: String(hit._index ?? ''),
        _score: hit._score !== null ? String(hit._score) : '',
      }
      const src = hit._source as Record<string, unknown> | undefined
      if (src) {
        for (const key of Object.keys(src)) {
          row[key] = src[key] !== undefined ? String(src[key]) : ''
        }
      }
      return row
    })

    return {
      columns,
      rows,
      rowsAffected: rows.length,
      elapsedMs: result.elapsed_ms,
    }
  },

  getDefaultContext(_payload: ConnectionPayload): { database: string; schema: string } {
    // _payload intentionally unused — elasticsearch has no single "database" concept
    void _payload
    return {
      database: 'elasticsearch',
      schema: 'indices',
    }
  },
}

/**
 * Recursively extract field names and types from an Elasticsearch mapping response.
 */
function extractFieldsFromMapping(
  mapping: unknown,
  indexName: string,
): Array<{ name: string; type: string }> {
  const fields: Array<{ name: string; type: string }> = []

  try {
    const raw = mapping as Record<string, unknown>
    // Elasticsearch returns { indexName: { mappings: { properties: {...} } } }
    const indexMapping = (raw[indexName] as Record<string, unknown> ?? raw) as Record<string, unknown>
    const mappings = (indexMapping.mappings as Record<string, unknown> ?? indexMapping) as Record<string, unknown>
    const properties = mappings.properties as Record<string, unknown> ?? {}

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      const def = fieldDef as Record<string, unknown>
      if (def.properties) {
        // Nested object — add as object type and recurse
        fields.push({ name: fieldName, type: 'object' })
        extractNestedFields(fields, fieldName, def.properties as Record<string, unknown>)
      } else {
        fields.push({
          name: fieldName,
          type: String(def.type ?? 'keyword'),
        })
      }
    }
  } catch {
    // If mapping parsing fails, return empty
  }

  return fields
}

function extractNestedFields(
  fields: Array<{ name: string; type: string }>,
  prefix: string,
  properties: Record<string, unknown>,
): void {
  for (const [fieldName, fieldDef] of Object.entries(properties)) {
    const def = fieldDef as Record<string, unknown>
    const fullName = `${prefix}.${fieldName}`
    if (def.properties) {
      fields.push({ name: fullName, type: 'object' })
      extractNestedFields(fields, fullName, def.properties as Record<string, unknown>)
    } else {
      fields.push({ name: fullName, type: String(def.type ?? 'keyword') })
    }
  }
}

/** Elasticsearch adapter helpers (not part of ConnectorAdapter contract). */
export const elasticAdapterHelpers = {
  createIndex: elasticCreateIndex,
  deleteIndex: elasticDeleteIndex,
  listIndices: elasticListIndices,
  getMapping: elasticGetMapping,
  searchDocuments: elasticSearchDocuments,
}