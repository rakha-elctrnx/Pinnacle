import { useEffect, useMemo, useState } from 'react'
import { Database, X } from 'lucide-react'
import type { ConnectionPayload } from '../../../../../services/tauriClient'
import { useElasticData } from '../../../hooks/useElasticData'
import { WorkspaceToolbar } from '../../shared/WorkspaceToolbar'
import { WorkspaceStatusBar } from '../../shared/WorkspaceStatusBar'
import type { ToolbarItem } from '../../shared/WorkspaceToolbar'
import type { StatusBarContext } from '../../shared/WorkspaceStatusBar'
import { ClusterDashboard } from './ClusterDashboard'
import { IndexManager } from './IndexManager'
import { DocumentExplorer, type DocumentExplorerState } from './DocumentExplorer'
import { QueryConsole } from './QueryConsole'
import { MappingExplorer } from './MappingExplorer'

export type ElasticPanel = 'cluster' | 'indices' | 'documents' | 'query' | 'mapping'

export interface ElasticIndexTab {
  id: string
  indexName: string
}

interface Props {
  payload: ConnectionPayload
  /** Optional: controlled panel selection from sidebar navigation */
  activePanel?: ElasticPanel
  /** Optional: controlled selected index from sidebar navigation */
  selectedIndex?: string | null
  /** Callback when an index is selected (e.g. from IndexManager table) so the parent can update controlled state */
  onSelectIndex?: (name: string) => void
  /** Opened index tabs for multi-tab support */
  openedElasticTabs: ElasticIndexTab[]
  /** Currently active index tab id */
  activeElasticTabId: string | null
  /** Callback to switch active index tab */
  onActiveElasticTabIdChange: (id: string) => void
  /** Callback to close an index tab */
  onCloseElasticTab: (id: string) => void
}

export function ElasticExplorerWorkspace({
  payload,
  activePanel: controlledPanel,
  selectedIndex: controlledIndex,
  onSelectIndex,
  openedElasticTabs,
  activeElasticTabId,
  onActiveElasticTabIdChange,
  onCloseElasticTab,
}: Props) {
  const { health, indices, loading, error, refresh } = useElasticData(payload)
  const [internalPanel] = useState<ElasticPanel>('cluster')
  const activePanel = controlledPanel ?? internalPanel
  const [internalSelectedIndex, setInternalSelectedIndex] = useState<string | null>(null)
  const selectedIndex = controlledIndex !== undefined ? controlledIndex : internalSelectedIndex

  // Track DocumentExplorer pagination state for the status bar
  const [docExplorerState, setDocExplorerState] = useState<DocumentExplorerState | null>(null)

  useEffect(() => {
    refresh()
  }, [refresh])

  // Whether we're showing an index tab (like SQL's isTableView)
  const isIndexTabView = activeElasticTabId !== null && openedElasticTabs.some((t) => t.id === activeElasticTabId)
  const activeTab = isIndexTabView ? openedElasticTabs.find((t) => t.id === activeElasticTabId) : null

  const panelContent = useMemo(() => {
    switch (activePanel) {
      case 'cluster':
        return <ClusterDashboard connection={payload} health={health} indices={indices} />
      case 'indices':
        return (
          <IndexManager
            connection={payload}
            indices={indices}
            onRefresh={refresh}
            onSelectIndex={(name: string) => {
              setInternalSelectedIndex(name)
              onSelectIndex?.(name)
            }}
          />
        )
      case 'documents':
        return <DocumentExplorer connection={payload} indexName={selectedIndex} indices={indices} onStateChange={setDocExplorerState} />
      case 'query':
        return <QueryConsole connection={payload} />
      case 'mapping':
        return <MappingExplorer connection={payload} indexName={selectedIndex} indices={indices} />
      default:
        return null
    }
  }, [activePanel, payload, health, indices, refresh, selectedIndex, onSelectIndex])

  // Derive toolbar items based on active panel
  const toolbarItems: ToolbarItem[] = useMemo(() => {
    const items: ToolbarItem[] = []

    switch (activePanel) {
      case 'indices':
        items.push(
          {
            id: 'create-index',
            label: 'Create Index',
            icon: Database,
            variant: 'primary',
            onClick: () => {
              // IndexManager manages its own create inline form
              // We trigger a click on the create button via the toolbar
              // The IndexManager still renders its own toolbar internally
              // to preserve its complex filter/create UI. The WorkspaceToolbar
              // here serves as the shared surface for primary actions.
            },
          },
          {
            id: 'refresh',
            label: 'Refresh',
            variant: 'secondary',
            onClick: refresh,
          },
        )
        // Open/Close/Delete are selection-dependent - they stay in the IndexManager's local toolbar
        break
      case 'documents':
        items.push(
          {
            id: 'new-document',
            label: 'New Document',
            variant: 'primary',
            onClick: () => {
              // DocumentExplorer manages its own add doc form
            },
          },
          {
            id: 'search',
            label: 'Search',
            variant: 'secondary',
            onClick: () => {
              // DocumentExplorer manages its own search
            },
          },
          {
            id: 'refresh-docs',
            label: 'Refresh',
            variant: 'secondary',
            onClick: () => {
              // DocumentExplorer manages its own refresh via fetchDocs
            },
          },
        )
        break
      case 'query':
        items.push(
          {
            id: 'run-query',
            label: 'Run',
            icon: Database,
            variant: 'primary',
            onClick: () => {
              // QueryConsole manages its own execute via Cmd+Enter
            },
          },
          {
            id: 'format-json',
            label: 'Format JSON',
            variant: 'secondary',
            onClick: () => {
              // QueryConsole manages its own format
            },
          },
        )
        break
      case 'mapping':
        items.push(
          {
            id: 'refresh-mapping',
            label: 'Refresh',
            variant: 'secondary',
            onClick: refresh,
          },
          {
            id: 'export-mapping',
            label: 'Export',
            variant: 'secondary',
            visible: selectedIndex !== null,
            onClick: () => {
              // MappingExplorer manages its own export
            },
          },
        )
        break
      // cluster and other panels: no toolbar actions
    }

    return items
  }, [activePanel, refresh, selectedIndex])

  // Derive status bar context
  const statusBarContext = useMemo((): StatusBarContext => {
    const base = {
      connector: 'Elasticsearch',
      connectionStatus: error ? 'error' as const : loading && !health ? 'connecting' as const : 'connected' as const,
    }

    if (isIndexTabView && activeTab) {
      const es = docExplorerState
      return {
        ...base,
        entity: activeTab.indexName,
        mode: 'Documents',
        dataInfo: es ? `${es.totalHits} hits` : undefined,
        pagination: es ? { hasPrev: es.page > 0, hasNext: (es.page + 1) * es.pageSize < es.totalHits } : undefined,
        runtimeStatus: es?.loading ? 'loading' : es?.error ? 'error' : 'idle',
        errorMessage: es?.error ?? undefined,
        onPrevPage: es?.onPrevPage,
        onNextPage: es?.onNextPage,
      }
    }

    switch (activePanel) {
      case 'indices':
        return {
          ...base,
          entity: 'Indices',
          mode: 'Management',
          dataInfo: health ? `${indices.length} indices` : undefined,
          runtimeStatus: loading ? 'loading' : error ? 'error' : 'idle',
          errorMessage: error ?? undefined,
        }
      case 'documents': {
        const idxName = selectedIndex ?? '—'
        const es = docExplorerState
        return {
          ...base,
          entity: selectedIndex ? `Index: ${selectedIndex}` : idxName,
          mode: 'Documents',
          dataInfo: es ? `${es.totalHits} hits` : undefined,
          pagination: es ? { hasPrev: es.page > 0, hasNext: (es.page + 1) * es.pageSize < es.totalHits } : undefined,
          runtimeStatus: es?.loading ? 'loading' : es?.error ? 'error' : 'idle',
          errorMessage: es?.error ?? undefined,
          onPrevPage: es?.onPrevPage,
          onNextPage: es?.onNextPage,
        }
      }
      case 'query':
        return {
          ...base,
          entity: 'Query',
          mode: 'Console',
          runtimeStatus: loading ? 'loading' : error ? 'error' : 'idle',
          errorMessage: error ?? undefined,
        }
      case 'mapping': {
        const idxName = selectedIndex ?? 'default'
        return {
          ...base,
          entity: selectedIndex ? `Index: ${selectedIndex}` : idxName,
          mode: 'Mapping',
          dataInfo: undefined,
          runtimeStatus: loading ? 'loading' : error ? 'error' : 'idle',
          errorMessage: error ?? undefined,
        }
      }
      case 'cluster':
      default:
        return {
          ...base,
          entity: 'Cluster',
          mode: 'Dashboard',
          dataInfo: health ? `${health.status} · ${indices.length} indices` : undefined,
          runtimeStatus: loading ? 'loading' : error ? 'error' : 'idle',
          errorMessage: error ?? undefined,
        }
    }
  }, [activePanel, selectedIndex, isIndexTabView, activeTab, health, indices, loading, error, docExplorerState])

  if (loading && !health) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-slate-400">
        <div className="flex items-center gap-2 text-sm">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Connecting to Elasticsearch...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-red-500">
        <div className="text-center max-w-md">
          <p className="text-sm font-medium mb-2">Connection Error</p>
          <p className="text-xs text-slate-500 break-all">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* ── Index Tabs Bar ── */}
      {openedElasticTabs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-3 px-3 bg-gray-100">
          {openedElasticTabs.map((tab) => {
            const isActive = tab.id === activeElasticTabId
            return (
              <div
                key={tab.id}
                className={[
                  'inline-flex items-center gap-1.5 rounded-t-lg border px-2 py-1.5 text-xs',
                  isActive
                    ? 'border-teal-200 bg-teal-50 text-teal-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                <Database size={12} />
                <button type="button" onClick={() => onActiveElasticTabIdChange(tab.id)}>
                  {tab.indexName}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseElasticTab(tab.id)}
                  className="rounded p-0.5 hover:bg-slate-200/70"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── WorkspaceToolbar ── */}
      {/* Only render toolbar if there are items for the current panel */}
      {toolbarItems.length > 0 && <WorkspaceToolbar items={toolbarItems} />}

      {/* ── Index Tab Content (DocumentExplorer for the active index) ── */}
      {isIndexTabView && activeTab && (
        <section className="flex-1 min-h-0 overflow-hidden bg-white">
          <div className="h-full min-h-0">
            <DocumentExplorer connection={payload} indexName={activeTab.indexName} indices={indices} onStateChange={setDocExplorerState} />
          </div>
        </section>
      )}

      {/* ── Non-index panel content (Cluster, Indices, Query, Mapping) ── */}
      {!isIndexTabView && (
        <main className="flex-1 min-w-0 overflow-auto bg-white">
          {panelContent}
        </main>
      )}

      {/* ── WorkspaceStatusBar ── */}
      <WorkspaceStatusBar context={statusBarContext} />
    </div>
  )
}