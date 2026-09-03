import type { ConnectionPayload } from '../../_shared/services/tauriClient'

export type MongoScheme = 'standard' | 'srv'
export type MongoReadPreference =
  | 'primary'
  | 'primaryPreferred'
  | 'secondary'
  | 'secondaryPreferred'
  | 'nearest'

export interface MongoConnectionOptions {
  scheme?: MongoScheme
  hosts?: string[]
  authSource?: string
  replicaSet?: string
  readPreference?: MongoReadPreference
  directConnection?: boolean
  tls?: boolean
  tlsInsecure?: boolean
  tlsCaFile?: string
  tlsCertificateKeyFile?: string
  connectTimeoutMs?: number
  serverSelectionTimeoutMs?: number
}

export interface MongoParsedUri {
  mongoConfig: MongoConnectionOptions
  host: string
  port: number
  database?: string
  username?: string
}

export interface MongoTestConnectionResult {
  ok: boolean
  message: string
  version?: string
}

export interface MongoDatabaseInfo {
  name: string
  sizeOnDiskBytes?: number
  empty?: boolean
}

export interface MongoDatabasePayload {
  connection: ConnectionPayload
  database: string
}

export interface MongoNamespacePayload {
  connection: ConnectionPayload
  database: string
  collection: string
}

export type MongoCollectionType = 'collection' | 'view' | 'timeseries'

export interface MongoCollectionInfo {
  name: string
  collectionType: MongoCollectionType
  readOnly: boolean
  options: Record<string, unknown>
}

export interface MongoTimeseriesOptions {
  timeField: string
  metaField?: string
  granularity?: 'seconds' | 'minutes' | 'hours'
}

export interface MongoCreateCollectionOptions {
  capped?: boolean
  sizeBytes?: number
  maxDocuments?: number
  timeSeries?: MongoTimeseriesOptions
}

export interface MongoCreateCollectionPayload {
  connection: ConnectionPayload
  database: string
  name: string
  options?: MongoCreateCollectionOptions
}

export interface MongoRenameCollectionPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  targetName: string
  dropTarget?: boolean
}

export interface MongoDropCollectionPayload {
  connection: ConnectionPayload
  database: string
  collection: string
}

export interface MongoFindPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  filter?: Record<string, unknown>
  project?: Record<string, unknown>
  sort?: Record<string, unknown>
  offset?: number
  pageSize?: number
  maxTimeMs?: number
  collation?: Record<string, unknown>
}

export interface MongoFindResult {
  documents: Record<string, unknown>[]
  canonicalDocuments: Record<string, unknown>[]
  offset: number
  hasPrevious: boolean
  hasNext: boolean
  elapsedMs: number
}

export interface MongoDocumentListResult {
  documents: Record<string, unknown>[]
  canonicalDocuments: Record<string, unknown>[]
  executionTimeMs: number
}

export interface MongoAggregatePayload {
  connection: ConnectionPayload
  database: string
  collection: string
  pipeline: Record<string, unknown>[]
  allowDiskUse?: boolean
  maxTimeMs?: number
}

export interface MongoExplainPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'
  filter?: Record<string, unknown>
  pipeline?: Record<string, unknown>[]
}

export interface MongoExplainResult {
  rawPlan: Record<string, unknown>
  winningPlanStage?: string
  executionTimeMs?: number
  totalDocsExamined?: number
  nReturned?: number
}

export interface MongoInsertPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  document: Record<string, unknown>
}

export interface MongoReplacePayload {
  connection: ConnectionPayload
  database: string
  collection: string
  filter: Record<string, unknown>
  replacement: Record<string, unknown>
}

export interface MongoDeletePayload {
  connection: ConnectionPayload
  database: string
  collection: string
  filter: Record<string, unknown>
  limitOne?: boolean
}

export interface MongoMutationResult {
  insertedId?: Record<string, unknown>
  matchedCount: number
  modifiedCount: number
  deletedCount: number
  upsertedId?: Record<string, unknown>
}

export interface MongoCollectionStats {
  ns: string
  count: number
  sizeBytes: number
  avgObjSizeBytes: number
  storageSizeBytes: number
  totalIndexSizeBytes: number
  indexSizes: Record<string, number>
  capped: boolean
  isView: boolean
}

export interface MongoSampleSchemaPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  sampleSize?: number
}

export interface MongoTypeOccurrence {
  typeName: string
  count: number
  percentage: number
}

export interface MongoSchemaFieldNode {
  path: string
  presenceCount: number
  presencePercentage: number
  types: MongoTypeOccurrence[]
  distinctValues: string[]
  isDistinctSetCapped: boolean
  numericMin?: number
  numericMax?: number
  arrayMinLength?: number
  arrayMaxLength?: number
  arrayAvgLength?: number
  children: MongoSchemaFieldNode[]
}

export interface MongoSampleSchemaResult {
  sampledDocuments: number
  fields: MongoSchemaFieldNode[]
  samplingDurationMs: number
}

export interface MongoIndexInfo {
  name: string
  keys: Record<string, unknown>
  unique: boolean
  sparse: boolean
  hidden: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
  wildcardProjection?: Record<string, unknown>
  collation?: Record<string, unknown>
  sizeBytes?: number
  usageSinceRestart?: number
}

export interface MongoCreateIndexPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  keys: Record<string, unknown>
  name?: string
  unique?: boolean
  sparse?: boolean
  hidden?: boolean
  expireAfterSeconds?: number
  partialFilterExpression?: Record<string, unknown>
  wildcardProjection?: Record<string, unknown>
  collation?: Record<string, unknown>
}

export interface MongoCreatedName {
  name: string
}

export interface MongoSetIndexHiddenPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  indexName: string
  hidden: boolean
}

export interface MongoDropIndexPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  indexName: string
}

export interface MongoValidationSettings {
  validator?: Record<string, unknown>
  validationLevel?: string
  validationAction?: string
}

export interface MongoSetValidationPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  validator?: Record<string, unknown>
  validationLevel?: string
  validationAction?: string
}

export type MongoExportFormat = 'json' | 'jsonArray' | 'csv'

export interface MongoExportPayload {
  connection: ConnectionPayload
  database: string
  collection: string
  format: MongoExportFormat
  destinationPath: string
  filter?: Record<string, unknown>
  project?: Record<string, unknown>
  sort?: Record<string, unknown>
  limit?: number
  skip?: number
  collation?: Record<string, unknown>
  csvHeaders?: string[]
}

export interface MongoExportResult {
  success: boolean
  filePath?: string
  exportedCount: number
  bytesWritten: number
  durationMs: number
  error?: string
}
