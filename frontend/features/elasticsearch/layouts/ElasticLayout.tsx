import { useEffect, useMemo, useState } from 'react'
import { useParams, Outlet, Navigate, useLocation } from 'react-router-dom'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { useTabStore } from '../../_shared/store/tabStore'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import { useElasticData } from '../hooks/useElasticData'

/**
 * ElasticLayout — per-connection context provider for the Elasticsearch feature.
 *
 * Route: `/elasticsearch/:connectionId/*`
 *
 * Provides connection context, Elasticsearch data fetching (cluster health,
 * indices), and renders child pages via `<Outlet />`.
 *
 * The sub-navigation bar (Cluster/Indices/Documents/Query/Mappings) and
 * inner tab bar (opened index tabs) were removed — all page-level tabs
 * are now managed by the global `TabBar` in `PageWorkspace`.
 */
export function ElasticLayout() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const location = useLocation()

  const { items, selectedConnection, handleConnectionSelectionChange, openConnectionFromUrl } =
    useDataExplorerContext()

  // Find the connection by ID from the URL.
  const connection = useMemo(
    () => items.find((c) => c.id === connectionId) ?? null,
    [items, connectionId],
  )

  // Sync the orchestrator's selected connection with the URL param, then
  // expand its tree node (search/URL entry path; sidebar clicks expand via
  // handleConnectionToggle and skip this effect — selectedConnection set).
  useEffect(() => {
    if (connection && selectedConnection?.id !== connectionId) {
      handleConnectionSelectionChange(connectionId!)
      openConnectionFromUrl(connectionId!)
    }
  }, [
    connectionId,
    connection,
    selectedConnection,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
  ])

  // ── Sync tab store with URL ──
  // Activate the tab whose route matches the current URL.
  // Must match by exact route — using connectionId alone would match the
  // *first* child tab and corrupt its route when a sibling tab is active.
  useEffect(() => {
    if (!connectionId) return

    const tabs = useTabStore.getState().tabs
    const matching = tabs.find(
      (t) => t.connectionId === connectionId && t.route === location.pathname,
    )
    if (matching) {
      useTabStore.getState().activateTab(matching.id)
    }
  }, [location.pathname, connectionId])

  // Build the connection payload for Elasticsearch API calls (with password)
  const [payload, setPayload] = useState<ConnectionPayload | null>(null)

  // Fetch password and build payload when connection changes
  useEffect(() => {
    let mounted = true
    const loadPayload = async () => {
      if (!connection) {
        if (!mounted) return
        setPayload(null)
        return
      }
      const p = await getConnPayloadWithPassword(connection)
      if (mounted) setPayload(p)
    }
    loadPayload()
    return () => {
      mounted = false
    }
  }, [connection])

  // Fetch cluster health + indices list.
  const { health, indices, loading, error, refresh } = useElasticData(payload)

  // Refresh on mount and when connection changes.
  useEffect(() => {
    refresh()
  }, [refresh])

  // No connectionId in the URL (visiting /elasticsearch directly).
  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <p className="text-body-secondary text-text-secondary">
          Select a connection from the sidebar to get started.
        </p>
      </div>
    )
  }

  // ConnectionId present but not found — redirect to home.
  if (!connection) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Page content ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Outlet
          context={{ payload, health, indices, loading, error, refresh }}
        />
      </div>
    </div>
  )
}
