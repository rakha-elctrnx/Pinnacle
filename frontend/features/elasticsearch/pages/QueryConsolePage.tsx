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

  if (!payload) return null

  return <QueryConsole connection={payload} />
}
