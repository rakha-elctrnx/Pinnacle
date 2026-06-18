export type ConnectionType = 'postgresql' | 'mysql' | 'mongodb' | 'redis' | 'rabbitmq' | 'elasticsearch'

export type ElasticHealth = 'green' | 'yellow' | 'red'

export interface ConnectionProfile {
  id: string
  name: string
  type: ConnectionType
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl: boolean
  encryptedPasswordRef: string
  tags: string[]
  favorite: boolean
  createdAt: string
  updatedAt: string
}

// ── Elasticsearch types ──────────────────────────────────────────

export interface ElasticClusterInfo {
  name: string
  cluster_name: string
  cluster_uuid: string
  version: {
    number: string
    build_flavor: string
    build_type: string
    lucene_version: string
  }
}

export interface ElasticClusterHealth {
  cluster_name: string
  status: ElasticHealth
  number_of_nodes: number
  number_of_data_nodes: number
  active_primary_shards: number
  active_shards: number
  relocating_shards: number
  initializing_shards: number
  unassigned_shards: number
  pending_tasks: number
}

export interface ElasticIndex {
  health: ElasticHealth
  status: string
  index: string
  uuid: string
  pri: string
  rep: string
  'docs.count': string
  'docs.deleted': string
  'store.size': string
  'pri.store.size': string
}

export interface ElasticFieldMapping {
  type?: string
  analyzer?: string
  index?: boolean | string
  properties?: Record<string, ElasticFieldMapping>
}

export interface ElasticDocumentHit {
  _index: string
  _id: string
  _score: number | null
  _source: Record<string, unknown>
}

export interface ElasticDocumentSearchResult {
  total: number
  hits: ElasticDocumentHit[]
  elapsed_ms: number
}

export interface ElasticQueryResult {
  elapsed_ms: number
  data: unknown
}

// ── SQL Table Schema Introspection Types ──────────────────────────

export interface TableSchemaInfo {
  tableName: string
  schema: string
  columns: TableColumn[]
  primaryKey: PrimaryKeyConstraint | null
  uniqueConstraints: UniqueConstraint[]
  foreignKeys: ForeignKeyConstraint[]
  indexes: IndexDefinition[]
}

export interface TableColumn {
  name: string
  dataType: string
  isNullable: boolean
  defaultValue: string | null
  isAutoIncrement: boolean
  comment: string | null
}

export interface PrimaryKeyConstraint {
  name: string
  columns: string[]
}

export interface UniqueConstraint {
  name: string
  columns: string[]
}

export interface ForeignKeyConstraint {
  name: string
  columns: string[]
  referencedTable: string
  referencedSchema: string
  referencedColumns: string[]
  onUpdate: string
  onDelete: string
}

export interface IndexDefinition {
  name: string
  columns: string[]
  isUnique: boolean
  indexType: string
}

/** Schema-level foreign key info including source table (for bulk FK fetch / ER diagram). */
export interface SchemaForeignKey {
  sourceTable: string
  constraintName: string
  columns: string[]
  referencedTable: string
  referencedSchema: string
  referencedColumns: string[]
}

/** Schema-level column info for bulk column fetch (ER diagram node detail). */
export interface SchemaColumn {
  tableName: string
  columnName: string
  dataType: string
  isNullable: boolean
  defaultValue: string | null
  dataTypeName: string
}

// ── Drop Table Types ─────────────────────────────────────────────

export interface DropTablePayload {
  connection: {
    type: string
    host: string
    port: number
    username: string
    password: string
    database: string
    ssl: boolean
    schema?: string
  }
  schema: string
  tableName: string
  cascade: boolean
}

export interface DropTableResult {
  success: boolean
  sql: string
  elapsedMs: number
  error: string | null
}