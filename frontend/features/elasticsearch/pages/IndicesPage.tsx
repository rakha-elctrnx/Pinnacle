import { useOutletContext, useNavigate, useParams } from 'react-router-dom'
import { IndexManager } from '../components/IndexManager'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
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
  const { setElasticPanel, setSelectedElasticIndex, setOpenedElasticTabs, setActiveElasticTabId } =
    useDataExplorerContext()
  const { payload, indices, refresh } = useOutletContext<ElasticLayoutOutletContext>()

  if (!payload) return null

  const handleSelectIndex = (name: string) => {
    setSelectedElasticIndex(name)

    // Open a tab for this index
    const tabId = `elastic-${name}-${Date.now()}`
    setOpenedElasticTabs((prev) => {
      const existing = prev.find((t) => t.indexName === name)
      if (existing) {
        setActiveElasticTabId(existing.id)
        return prev
      }
      return [...prev, { id: tabId, indexName: name }]
    })
    setActiveElasticTabId(tabId)

    // Navigate to documents page for this index
    setElasticPanel('documents')
    navigate(`/elasticsearch/${connectionId}/documents`)
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
