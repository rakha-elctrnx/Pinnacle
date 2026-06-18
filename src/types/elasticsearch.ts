// ── Elasticsearch types ──────────────────────────────────────────
export type ElasticHealth = 'green' | 'yellow' | 'red'

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