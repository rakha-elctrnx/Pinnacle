import { describe, it, expect, vi } from 'vitest'
import {
  redisTestConnection,
  redisShowAllDatabases,
  redisExecuteCommand,
  redisScanKeys,
  redisGetKey,
  redisGetInfo,
} from '../redis'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'redis_test_connection') {
      return { ok: true, message: 'PONG' }
    }
    if (command === 'redis_show_all_databases') {
      return [
        { db: 'db0', keys: 10, expires: 2, avgTtl: 100 },
        { db: 'db1', keys: 5, expires: 0, avgTtl: 0 },
      ]
    }
    if (command === 'redis_execute_command') {
      return 'PONG'
    }
    if (command === 'redis_scan_keys') {
      return {
        cursor: '0',
        keys: [{ key: 'user:1', keyType: 'string', ttl: -1 }],
      }
    }
    if (command === 'redis_get_key') {
      return {
        key: args?.key,
        keyType: 'string',
        ttl: -1,
        value: 'Alice',
      }
    }
    if (command === 'redis_get_info') {
      return {
        redisVersion: '7.0.0',
        redisMode: 'standalone',
      }
    }
    throw new Error(`Unhandled command ${command}`)
  }),
}))

describe('Redis Frontend Client Wrappers', () => {
  const dummyPayload = {
    type: 'redis',
    host: 'localhost',
    port: 6379,
    username: '',
    database: '0',
    ssl: false,
  }

  it('invokes redis_test_connection cleanly', async () => {
    const res = await redisTestConnection(dummyPayload, 'sshPw', 'keyPp')
    expect(res.ok).toBe(true)
    expect(res.message).toBe('PONG')
  })

  it('invokes redis_show_all_databases cleanly', async () => {
    const dbs = await redisShowAllDatabases(dummyPayload)
    expect(dbs.length).toBe(2)
    expect(dbs[0].db).toBe('db0')
  })

  it('invokes redis_execute_command cleanly', async () => {
    const res = await redisExecuteCommand(dummyPayload, 'PING')
    expect(res).toBe('PONG')
  })

  it('invokes redis_scan_keys cleanly', async () => {
    const res = await redisScanKeys(dummyPayload, 'db0', '*', '0')
    expect(res.cursor).toBe('0')
    expect(res.keys.length).toBe(1)
    expect(res.keys[0].key).toBe('user:1')
  })

  it('invokes redis_get_key cleanly', async () => {
    const res = await redisGetKey(dummyPayload, 'db0', 'user:1')
    expect(res.key).toBe('user:1')
    expect(res.value).toBe('Alice')
  })

  it('invokes redis_get_info cleanly', async () => {
    const res = await redisGetInfo(dummyPayload)
    expect(res.redisVersion).toBe('7.0.0')
  })
})
