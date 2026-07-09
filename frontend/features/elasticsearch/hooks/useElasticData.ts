import { useState, useCallback } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticClusterHealth, ElasticIndex } from '../types/elasticsearch'
import {
  elasticGetClusterHealth,
  elasticListIndices,
} from '../clients/elasticsearch'

export function useElasticData(connection: ConnectionPayload | null) {
  const [health, setHealth] = useState<ElasticClusterHealth | null>(null)
  const [indices, setIndices] = useState<ElasticIndex[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!connection) return
    setLoading(true)
    setError(null)
    Promise.all([
      elasticGetClusterHealth(connection),
      elasticListIndices(connection),
    ])
      .then(([healthData, indicesData]) => {
        setHealth(healthData)
        setIndices(indicesData ?? [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [connection])

  return { health, indices, loading, error, refresh, setIndices }
}
