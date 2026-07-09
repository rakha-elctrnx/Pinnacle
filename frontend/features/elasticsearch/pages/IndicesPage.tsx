import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { IndexManager } from '../components/IndexManager'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * IndicesPage — manages Elasticsearch indices.
 *
 * Route: `/elasticsearch/:connectionId/indices`
 *
 * Renders the `IndexManager` component for listing, creating, deleting,
 * opening, closing, and refreshing indices.
 */
export function IndicesPage() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()
  const { payload, indices, refresh } =
    useOutletContext<ElasticLayoutOutletContext>()

  if (!payload) return null

  const handleSelectIndex = (name: string) => {
    // Navigate to the per-index documents route (like SQL tables/:tableName)
    navigate(`/elasticsearch/${connectionId}/indices/${name}`)
  }

  return (
    <IndexManager
      connection={payload}
      indices={indices}
      onRefresh={refresh}
      onSelectIndex={handleSelectIndex}
    />
  )
}
