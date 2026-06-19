import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticClusterHealth, ElasticIndex } from './elasticsearch'

/**
 * Outlet context passed from `ElasticLayout` to its child pages.
 *
 * Child pages access this via `useOutletContext<ElasticLayoutOutletContext>()`.
 */
export interface ElasticLayoutOutletContext {
  payload: ConnectionPayload | null
  health: ElasticClusterHealth | null
  indices: ElasticIndex[]
  loading: boolean
  error: string | null
  refresh: () => void
}
