import { useParams, useOutletContext } from 'react-router-dom'
import { MappingExplorer } from '../components/MappingExplorer'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * IndexMappingsPage — per-index mapping viewer.
 *
 * Route: `/elasticsearch/:connectionId/indices/:indexName/mappings`
 *
 * Extracts `indexName` from the route and renders `MappingExplorer` for that
 * specific index. Unlike the old `/mappings` route (which required the user
 * to pick an index), this route already knows the index from the URL.
 */
export function IndexMappingsPage() {
  const { indexName } = useParams<{ indexName: string }>()
  const { payload, indices } = useOutletContext<ElasticLayoutOutletContext>()

  if (!payload || !indexName) return null

  return (
    <MappingExplorer
      connection={payload}
      indexName={indexName}
      indices={indices}
    />
  )
}
