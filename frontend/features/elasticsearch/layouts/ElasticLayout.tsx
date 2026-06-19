import { useEffect, useMemo } from 'react'
import { useParams, Outlet, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { getConnPayload } from '../../_shared/utils'
import { useElasticData } from '../hooks/useElasticData'
import type { ElasticPanel } from '../components/ElasticExplorerWorkspace'

/**
 * ElasticLayout — per-connection layout for the Elasticsearch feature.
 *
 * Route: `/elasticsearch/:connectionId/*`
 *
 * Provides the Elasticsearch-specific chrome (sub-nav tabs for cluster,
 * indices, documents, query, mappings) and renders child pages via
 * `<Outlet />`.
 *
 * Reads `connectionId` from the URL and validates that a matching
 * connection exists in the orchestrator's items. If the connection is
 * not found, redirects to the home route.
 *
 * Elasticsearch data (cluster health, indices) is fetched here via
 * `useElasticData` and passed down to child pages through the
 * `DataExplorerContext` (elasticPanel, selectedElasticIndex, etc.).
 */
export function ElasticLayout() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const {
    items,
    selectedConnection,
    handleConnectionSelectionChange,
    setElasticPanel,
    openedElasticTabs,
    activeElasticTabId,
    handleCloseElasticTab,
    handleActiveElasticTabIdChange,
  } = useDataExplorerContext()

  // Find the connection by ID from the URL.
  const connection = useMemo(
    () => items.find((c) => c.id === connectionId) ?? null,
    [items, connectionId],
  )

  // Sync the orchestrator's selected connection with the URL param.
  useEffect(() => {
    if (connection && selectedConnection?.id !== connectionId) {
      handleConnectionSelectionChange(connectionId!)
    }
  }, [connectionId, connection, selectedConnection, handleConnectionSelectionChange])

  // Build the connection payload for Elasticsearch API calls.
  const payload = useMemo(() => {
    if (!connection) return null
    return getConnPayload(connection)
  }, [connection])

  // Fetch cluster health + indices list.
  const { health, indices, loading, error, refresh } = useElasticData(payload)

  // Refresh on mount and when connection changes.
  useEffect(() => {
    refresh()
  }, [refresh])

  // ── Determine which child route is active ──
  const pathSegments = location.pathname.split('/')
  const activeSection = pathSegments[3] ?? 'cluster'

  // ── Sub-nav items ──
  const subNavItems: { label: string; panel: ElasticPanel; path: string }[] = [
    { label: 'Cluster', panel: 'cluster', path: `/elasticsearch/${connectionId}/cluster` },
    { label: 'Indices', panel: 'indices', path: `/elasticsearch/${connectionId}/indices` },
    { label: 'Documents', panel: 'documents', path: `/elasticsearch/${connectionId}/documents` },
    { label: 'Query', panel: 'query', path: `/elasticsearch/${connectionId}/query` },
    { label: 'Mappings', panel: 'mapping', path: `/elasticsearch/${connectionId}/mappings` },
  ]

  // ── Tab bar (opened index tabs) ──
  const tabs = openedElasticTabs.map((tab) => ({
    id: tab.id,
    label: tab.indexName,
  }))

  // ── Handle tab click — navigate to documents with that index ──
  const handleTabClick = (tabId: string) => {
    handleActiveElasticTabIdChange(tabId)
    navigate(`/elasticsearch/${connectionId}/documents`)
  }

  // ── Handle tab close ──
  const handleTabClose = (tabId: string) => {
    handleCloseElasticTab(tabId)
  }

  // ── Handle sub-nav click — sync panel state + navigate ──
  const handleSubNavClick = (panel: ElasticPanel, path: string) => {
    setElasticPanel(panel)
    navigate(path)
  }

  // No connectionId in the URL (visiting /elasticsearch directly).
  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
        <p className="text-sm">Select a connection from the sidebar to get started.</p>
      </div>
    )
  }

  // ConnectionId present but not found — redirect to home.
  if (!connection) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      {/* ── Sub-nav + Tab bar ── */}
      <div className="flex items-center gap-1 border-b border-outline-variant bg-surface-variant px-3 py-2">
        {subNavItems.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => handleSubNavClick(item.panel, item.path)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              activeSection === item.panel || (item.panel === 'mapping' && activeSection === 'mappings')
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-container-low'
            }`}
          >
            {item.label}
          </button>
        ))}

        {/* Refresh button */}
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="ml-1 cursor-pointer rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
          title="Refresh cluster data"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>

        {tabs.length > 0 && (
          <div className="ml-2 flex items-center gap-1 border-l border-outline-variant pl-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                  tab.id === activeElasticTabId
                    ? 'bg-primary-container text-on-primary-container'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleTabClick(tab.id)}
                  className="cursor-pointer truncate max-w-30"
                  title={tab.label}
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleTabClose(tab.id)
                  }}
                  className="cursor-pointer ml-1 rounded p-0.5 hover:bg-error-container/30 text-on-surface-variant"
                  aria-label={`Close ${tab.label}`}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cluster health indicator ── */}
      {health && (
        <div className="flex items-center gap-2 border-b border-outline-variant/50 bg-surface-container-low px-3 py-1.5 text-xs text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                health.status === 'green'
                  ? 'bg-emerald-500'
                  : health.status === 'yellow'
                    ? 'bg-amber-400'
                    : 'bg-red-500'
              }`}
            />
            <span className="font-medium capitalize">{health.status}</span>
          </span>
          <span className="text-on-surface-variant/60">·</span>
          <span>{health.number_of_nodes} nodes</span>
          <span className="text-on-surface-variant/60">·</span>
          <span>{health.active_shards} shards</span>
          {error && (
            <>
              <span className="text-on-surface-variant/60">·</span>
              <span className="text-red-500">{error}</span>
            </>
          )}
        </div>
      )}

      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet context={{ payload, health, indices, loading, error, refresh }} />
      </div>
    </div>
  )
}
