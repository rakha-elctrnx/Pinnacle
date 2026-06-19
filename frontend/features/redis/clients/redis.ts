// frontend/services/clients/redis.ts
import { invoke } from '@tauri-apps/api/core'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'

import type {
    RedisConnectionTestResult,
    RedisDatabaseInfo,
} from '../types/redis'



export async function redisTestConnection(payload: ConnectionPayload) {
    return invoke<RedisConnectionTestResult>('redis_test_connection', {
        payload,
    })
}

export async function redisShowAllDatabases(payload: ConnectionPayload) {
    return invoke<RedisDatabaseInfo[]>('redis_show_all_databases', {
        payload,
    })
}

export async function redisExecuteCommand(
    payload: ConnectionPayload,
    command: string,
) {
    return invoke<string>('redis_execute_command', {
        payload,
        command,
    })
}