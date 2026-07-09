import { useTabStore } from '../../_shared/store/tabStore'
import { useOutletContext } from 'react-router-dom'
import { QueryConsole } from '../components/QueryConsole'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * QueryConsolePage — interactive HTTP query editor for Elasticsearch.
 *
 * Route: `/elasticsearch/:connectionId/query`
 *
 * Renders the `QueryConsole` component for executing raw HTTP requests
 * against the Elasticsearch cluster (GET, POST, PUT, DELETE, HEAD).
 */
export function QueryConsolePage() {
  const { payload } = useOutletContext<ElasticLayoutOutletContext>()
  const activeTabId = useTabStore((s) => s.activeTabId)

  if (!payload) return null

  return <QueryConsole key={activeTabId} connection={payload} />
}
