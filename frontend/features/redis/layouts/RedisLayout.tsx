import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import { useTabStore } from '../../_shared/store/tabStore'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import { useRedisData } from '../hooks/useRedisData'
import type { RedisLayoutOutletContext } from '../types/pages'

/**
 * RedisLayout — per-connection context provider for the Redis feature.
 *
 * Route: `/redis/:connectionId/*`
 *
 * Mirrors `MongoLayout` / `ElasticLayout`: resolves the connection from the
 * URL, syncs the orchestrator selection + tab store, builds the decrypted
 * payload, fetches databases + server info via `useRedisData`, and renders
 * leaf pages through `<Outlet />` with a `RedisLayoutOutletContext`.
 */
export function RedisLayout() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const location = useLocation()

  const {
    items,
    selectedConnection,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
  } = useDataExplorerContext()

  // Find the connection by ID from the URL.
  const connection = useMemo(
    () => items.find((item) => item.id === connectionId) ?? null,
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
    connection,
    connectionId,
    selectedConnection,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
  ])

  // ── Sync tab store with URL ──
  // Activate the tab whose route matches the current URL. Must match by
  // exact route — using connectionId alone would match the *first* child
  // tab and corrupt its route when a sibling tab is active.
  useEffect(() => {
    if (!connectionId) return
    const matchingTab = useTabStore
      .getState()
      .tabs.find(
        (tab) =>
          tab.connectionId === connectionId && tab.route === location.pathname,
      )
    if (matchingTab) useTabStore.getState().activateTab(matchingTab.id)
  }, [connectionId, location.pathname])

  // Build the connection payload for Redis commands (with password).
  const [payload, setPayload] = useState<ConnectionPayload | null>(null)

  useEffect(() => {
    let active = true

    const loadPayload = async () => {
      if (!connection) {
        if (active) setPayload(null)
        return
      }
      try {
        const decrypted = await getConnPayloadWithPassword(connection)
        // `getConnPayloadWithPassword` omits `ssh` — attach it explicitly so
        // saved connections route Redis traffic through the SSH tunnel.
        if (active) setPayload({ ...decrypted, ssh: connection.ssh })
      } catch {
        if (active) setPayload(null)
      }
    }

    void loadPayload()
    return () => {
      active = false
    }
  }, [connection])

  // Fetch databases + server info.
  const { databases, info, loading, error, refresh } = useRedisData(payload)

  // Refresh on mount and when the payload (connection) changes.
  useEffect(() => {
    refresh()
  }, [refresh])

  // No connectionId in the URL (visiting /redis directly).
  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-muted">
        <p className="text-body-secondary text-text-secondary">
          Select a Redis connection from the sidebar to get started.
        </p>
      </div>
    )
  }

  // connectionId present but not found — redirect to home.
  if (!connection) return <Navigate to="/" replace />

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base text-text-primary">
      {loading && !payload ? (
        <CenteredLoadingState
          loading
          label="Loading Redis connection..."
          variant="page"
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error && (
            <div
              role="alert"
              className="shrink-0 border-b border-border-danger bg-danger-subtle px-3 py-2 text-body text-danger"
            >
              {error}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet
              context={
                {
                  payload,
                  databases,
                  info,
                  loading,
                  error,
                  refresh,
                  connection,
                } satisfies RedisLayoutOutletContext
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
