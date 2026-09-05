// frontend/services/clients/redis.ts
import { invoke } from '@tauri-apps/api/core'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'

import type {
  RedisConnectionTestResult,
  RedisDatabaseInfo,
  RedisKeyDetail,
  RedisScanResult,
  RedisServerInfo,
} from '../types/redis'

export async function redisTestConnection(
  payload: ConnectionPayload,
  sshPassword?: string,
  keyPassphrase?: string,
) {
  return invoke<RedisConnectionTestResult>('redis_test_connection', {
    payload,
    sshPassword,
    keyPassphrase,
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
export async function redisScanKeys(
  payload: ConnectionPayload,
  database: string,
  pattern: string,
  cursor: string,
) {
  return invoke<RedisScanResult>('redis_scan_keys', {
    payload,
    database,
    pattern,
    cursor,
  })
}

export async function redisGetKey(
  payload: ConnectionPayload,
  database: string,
  key: string,
) {
  return invoke<RedisKeyDetail>('redis_get_key', {
    payload,
    database,
    key,
  })
}

export async function redisGetInfo(payload: ConnectionPayload) {
  return invoke<RedisServerInfo>('redis_get_info', {
    payload,
  })
}
