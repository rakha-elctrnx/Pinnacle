import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DocumentExplorer } from '../components/DocumentExplorer'
import type { DocumentExplorerState } from '../components/DocumentExplorer'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ElasticLayoutOutletContext } from '../types/pages'

/**
 * DocumentsPage — browses and manages Elasticsearch documents.
 *
 * Route: `/elasticsearch/:connectionId/documents`
 *
 * Renders the `DocumentExplorer` component for the currently selected
 * index. Shows a placeholder when no index is selected.
 */
export function DocumentsPage() {
  const { selectedElasticIndex, openedElasticTabs, activeElasticTabId } =
    useDataExplorerContext()
  const { payload, indices } = useOutletContext<ElasticLayoutOutletContext>()
  const [, setDocState] = useState<DocumentExplorerState | null>(null)

  if (!payload) return null

  // Resolve the index name from the active tab or the selected index
  const activeTab = activeElasticTabId
    ? openedElasticTabs.find((t) => t.id === activeElasticTabId)
    : null
  const indexName = activeTab?.indexName ?? selectedElasticIndex ?? null

  if (!indexName) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <p className="text-body">
            No index selected. Navigate to the <strong>Indices</strong> tab and
            select an index to browse its documents.
          </p>
        </div>
      </div>
    )
  }

  return (
    <DocumentExplorer
      connection={payload}
      indexName={indexName}
      indices={indices}
      onStateChange={setDocState}
    />
  )
}
