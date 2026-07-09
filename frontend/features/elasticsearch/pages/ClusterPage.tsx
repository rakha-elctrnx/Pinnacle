import { useOutletContext } from 'react-router-dom'
import { ClusterDashboard } from '../components/ClusterDashboard'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * ClusterPage — shows the Elasticsearch cluster dashboard.
 *
 * Route: `/elasticsearch/:connectionId/cluster`
 *
 * Renders cluster health, node stats, and index overview using the
 * existing `ClusterDashboard` component.
 */
export function ClusterPage() {
  const { payload, health, indices } =
    useOutletContext<ElasticLayoutOutletContext>()

  if (!payload) return null

  return (
    <ClusterDashboard connection={payload} health={health} indices={indices} />
  )
}
