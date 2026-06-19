import { useOutletContext } from 'react-router-dom'
import { MappingExplorer } from '../components/MappingExplorer'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * MappingsPage — explores Elasticsearch index field mappings.
 *
 * Route: `/elasticsearch/:connectionId/mappings`
 *
 * Renders the `MappingExplorer` component for the currently selected
 * index. Shows a placeholder when no index is selected.
 */
export function MappingsPage() {
  const { selectedElasticIndex, openedElasticTabs, activeElasticTabId } =
    useDataExplorerContext()
  const { payload, indices } = useOutletContext<ElasticLayoutOutletContext>()

  if (!payload) return null

  // Resolve the index name from the active tab or the selected index
  const activeTab = activeElasticTabId
    ? openedElasticTabs.find((t) => t.id === activeElasticTabId)
    : null
  const indexName = activeTab?.indexName ?? selectedElasticIndex ?? null

  if (!indexName) {
    return (
      <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <p className="text-sm">
            No index selected. Navigate to the <strong>Indices</strong> tab and
            select an index to explore its field mappings.
          </p>
        </div>
      </div>
    )
  }

  return (
    <MappingExplorer
      connection={payload}
      indexName={indexName}
      indices={indices}
    />
  )
}
