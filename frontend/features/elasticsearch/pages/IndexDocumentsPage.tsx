import { useParams, useOutletContext } from 'react-router-dom'
import { DocumentExplorer } from '../components/DocumentExplorer'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * IndexDocumentsPage — explores Elasticsearch documents for a specific index.
 *
 * Route: `/elasticsearch/:connectionId/indices/:indexName/documents`
 *
 * Renders the `DocumentExplorer` component for the specified index.
 * Each index has its own route, so multiple index tabs are naturally
 * isolated by React's routing.
 */
export function IndexDocumentsPage() {
  const { indexName } = useParams<{ indexName: string }>()
  const { payload } = useOutletContext<ElasticLayoutOutletContext>()

  if (!payload || !indexName) return null

  return <DocumentExplorer connection={payload} indexName={indexName} />
}
