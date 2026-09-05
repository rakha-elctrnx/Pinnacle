import { useOutletContext } from 'react-router-dom'
import { RedisConsole } from '../components/RedisConsole'
import type { RedisLayoutOutletContext } from '../types/pages'
import { useTabStore } from '../../_shared/store/tabStore'

/**
 * RedisCommandPage — interactive command execution console for Redis.
 *
 * Route: `/redis/:connectionId/console`
 *
 * Remounts `RedisConsole` per tab using `key={activeTabId}` so per-tab state
 * is isolated and preserved in `useRedisConsoleStore` + sessionStorage history.
 */
export function RedisCommandPage() {
  const { payload } = useOutletContext<RedisLayoutOutletContext>()
  const activeTabId = useTabStore((s) => s.activeTabId)

  if (!payload) return null

  return <RedisConsole key={activeTabId} connection={payload} />
}
