import { useEffect, useState } from 'react'
import {
  getConnectionHealth,
  type ConnectionHealth,
} from '../../_shared/services/tauriClient'

export function useConnectionHealth(connectionId: string | null | undefined) {
  const [health, setHealth] = useState<ConnectionHealth | null>(null)
  useEffect(() => {
    if (!connectionId) return
    let cancelled = false
    const poll = async () => {
      try {
        const h = await getConnectionHealth(connectionId)
        if (!cancelled) setHealth(h)
      } catch {
        /* ignore — pool not yet created */
      }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
      setHealth(null)
    }
  }, [connectionId])
  return health
}
