import { invoke } from '@tauri-apps/api/core'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type {
  MongoAggregatePayload,
  MongoCollectionInfo,
  MongoCollectionStats,
  MongoCreateCollectionPayload,
  MongoCreateIndexPayload,
  MongoCreatedName,
  MongoDatabaseInfo,
  MongoDatabasePayload,
  MongoDeletePayload,
  MongoDocumentListResult,
  MongoDropCollectionPayload,
  MongoDropIndexPayload,
  MongoExplainPayload,
  MongoExplainResult,
  MongoExportPayload,
  MongoExportResult,
  MongoFindPayload,
  MongoFindResult,
  MongoIndexInfo,
  MongoInsertPayload,
  MongoMutationResult,
  MongoNamespacePayload,
  MongoParsedUri,
  MongoRenameCollectionPayload,
  MongoReplacePayload,
  MongoSampleSchemaPayload,
  MongoSampleSchemaResult,
  MongoSetIndexHiddenPayload,
  MongoSetValidationPayload,
  MongoTestConnectionResult,
  MongoValidationSettings,
} from '../types/mongodb'

export async function mongoParseUri(uri: string): Promise<MongoParsedUri> {
  return invoke<MongoParsedUri>('mongo_parse_uri', { uri })
}

export async function mongoTestConnection(
  payload: ConnectionPayload,
): Promise<MongoTestConnectionResult> {
  return invoke<MongoTestConnectionResult>('mongo_test_connection', { payload })
}

export async function mongoListDatabases(
  payload: ConnectionPayload,
): Promise<MongoDatabaseInfo[]> {
  return invoke<MongoDatabaseInfo[]>('mongo_list_databases', { payload })
}

export async function mongoCreateDatabase(
  payload: MongoDatabasePayload,
): Promise<void> {
  return invoke<void>('mongo_create_database', { payload })
}

export async function mongoDropDatabase(
  payload: MongoDatabasePayload,
): Promise<void> {
  return invoke<void>('mongo_drop_database', { payload })
}

export async function mongoListCollections(
  payload: MongoDatabasePayload,
): Promise<MongoCollectionInfo[]> {
  return invoke<MongoCollectionInfo[]>('mongo_list_collections', { payload })
}

export async function mongoCreateCollection(
  payload: MongoCreateCollectionPayload,
): Promise<void> {
  return invoke<void>('mongo_create_collection', { payload })
}

export async function mongoRenameCollection(
  payload: MongoRenameCollectionPayload,
): Promise<void> {
  return invoke<void>('mongo_rename_collection', { payload })
}

export async function mongoDropCollection(
  payload: MongoDropCollectionPayload,
): Promise<void> {
  return invoke<void>('mongo_drop_collection', { payload })
}

export async function mongoFindDocuments(
  payload: MongoFindPayload,
): Promise<MongoFindResult> {
  return invoke<MongoFindResult>('mongo_find_documents', { payload })
}

export async function mongoInsertDocument(
  payload: MongoInsertPayload,
): Promise<MongoMutationResult> {
  return invoke<MongoMutationResult>('mongo_insert_document', { payload })
}

export async function mongoUpdateDocument(
  payload: MongoReplacePayload,
): Promise<MongoMutationResult> {
  return invoke<MongoMutationResult>('mongo_update_document', { payload })
}

export async function mongoDeleteDocument(
  payload: MongoDeletePayload,
): Promise<MongoMutationResult> {
  return invoke<MongoMutationResult>('mongo_delete_document', { payload })
}

export async function mongoAggregate(
  payload: MongoAggregatePayload,
): Promise<MongoDocumentListResult> {
  return invoke<MongoDocumentListResult>('mongo_aggregate', { payload })
}

export async function mongoExplain(
  payload: MongoExplainPayload,
): Promise<MongoExplainResult> {
  return invoke<MongoExplainResult>('mongo_explain', { payload })
}

export async function mongoGetCollectionStats(
  payload: MongoNamespacePayload,
): Promise<MongoCollectionStats> {
  return invoke<MongoCollectionStats>('mongo_get_collection_stats', { payload })
}

export async function mongoAnalyzeSchema(
  payload: MongoSampleSchemaPayload,
): Promise<MongoSampleSchemaResult> {
  return invoke<MongoSampleSchemaResult>('mongo_analyze_schema', { payload })
}

export async function mongoListIndexes(
  payload: MongoNamespacePayload,
): Promise<MongoIndexInfo[]> {
  return invoke<MongoIndexInfo[]>('mongo_list_indexes', { payload })
}

export async function mongoCreateIndex(
  payload: MongoCreateIndexPayload,
): Promise<MongoCreatedName> {
  return invoke<MongoCreatedName>('mongo_create_index', { payload })
}

export async function mongoDropIndex(
  payload: MongoDropIndexPayload,
): Promise<void> {
  return invoke<void>('mongo_drop_index', { payload })
}

export async function mongoSetIndexHidden(
  payload: MongoSetIndexHiddenPayload,
): Promise<void> {
  return invoke<void>('mongo_set_index_hidden', { payload })
}

export async function mongoGetValidation(
  payload: MongoNamespacePayload,
): Promise<MongoValidationSettings> {
  return invoke<MongoValidationSettings>('mongo_get_validation', { payload })
}

export async function mongoSetValidation(
  payload: MongoSetValidationPayload,
): Promise<void> {
  return invoke<void>('mongo_set_validation', { payload })
}

export async function mongoExport(
  payload: MongoExportPayload,
): Promise<MongoExportResult> {
  return invoke<MongoExportResult>('mongo_export', { payload })
}
