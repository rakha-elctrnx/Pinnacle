import { useState, useCallback } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { RedisDatabaseInfo, RedisServerInfo } from '../types/redis'
import {
  redisShowAllDatabases,
  redisGetInfo,
} from '../clients/redis'

export function useRedisData(connection: ConnectionPayload | null) {
  const [databases, setDatabases] = useState<RedisDatabaseInfo[]>([])
  const [info, setInfo] = useState<RedisServerInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!connection) return
    setLoading(true)
    setError(null)
    Promise.all([
      redisShowAllDatabases(connection),
      redisGetInfo(connection),
    ])
      .then(([databasesData, infoData]) => {
        setDatabases(databasesData ?? [])
        setInfo(infoData)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [connection])

  return { databases, info, loading, error, refresh, setDatabases }
}
