// frontend/types/redis.ts

export interface RedisConnectionTestResult {
    ok: boolean
    message: string
}

export interface RedisDatabaseInfo {
    db: string
    keys: number
    expires: number
    avgTtl: number
}

export interface RedisInfo {
    redisVersion?: string
    redisMode?: string
    os?: string
    archBits?: number
    uptimeInSeconds?: number
    connectedClients?: number
    usedMemoryHuman?: string
    role?: string
}

export interface RedisStringData {
    key: string
    type: 'string'
    value: string
    ttl: number
}

export interface RedisListData {
    key: string
    type: 'list'
    length: number
    values: string[]
    ttl: number
}

export interface RedisHashData {
    key: string
    type: 'hash'
    length: number
    fields: Record<string, string>
    ttl: number
}

export interface RedisSetData {
    key: string
    type: 'set'
    length: number
    members: string[]
    ttl: number
}

export interface RedisSortedSetData {
    key: string
    type: 'zset'
    length: number
    members: Array<{
        value: string
        score: number
    }>
    ttl: number
}

export type RedisKeyData =
    | RedisStringData
    | RedisListData
    | RedisHashData
    | RedisSetData
    | RedisSortedSetData