import { useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ConnectionProfile } from '../../_shared/types/domain'
import { useTabStore } from '../../_shared/store/tabStore'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import { mongoListCollections, mongoListDatabases } from '../clients/mongodb'
import type { MongoCollectionInfo, MongoDatabaseInfo } from '../types/mongodb'

export interface MongoLayoutOutletContext {
  payload: ConnectionPayload | null
  databases: MongoDatabaseInfo[]
  collections: MongoCollectionInfo[]
  loading: boolean
  error: string | null
  connection: ConnectionProfile
}

export function MongoLayout() {
  const { connectionId, databaseName } = useParams<{
    connectionId: string
    databaseName?: string
  }>()
  const location = useLocation()
  const {
    items,
    selectedConnection,
    handleConnectionSelectionChange,
    openConnectionFromUrl,
  } = useDataExplorerContext()
  const [payload, setPayload] = useState<ConnectionPayload | null>(null)
  const [databases, setDatabases] = useState<MongoDatabaseInfo[]>([])
  const [collections, setCollections] = useState<MongoCollectionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connection = useMemo(
    () => items.find((item) => item.id === connectionId) ?? null,
    [items, connectionId],
  )

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

  useEffect(() => {
    let active = true

    const loadConnection = async () => {
      if (!connection) return
      setLoading(true)
      setError(null)
      try {
        const nextPayload = await getConnPayloadWithPassword(connection)
        if (!active) return
        setPayload(nextPayload)
        const nextDatabases = await mongoListDatabases(nextPayload)
        if (active) setDatabases(nextDatabases)
      } catch (reason: unknown) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load MongoDB databases.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadConnection()
    return () => {
      active = false
    }
  }, [connection])

  useEffect(() => {
    let active = true

    const loadCollections = async () => {
      if (!payload || !databaseName) return
      setLoading(true)
      setError(null)
      try {
        const nextCollections = await mongoListCollections({
          connection: payload,
          database: databaseName,
        })
        if (active) setCollections(nextCollections)
      } catch (reason: unknown) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Unable to load MongoDB collections.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadCollections()
    return () => {
      active = false
    }
  }, [payload, databaseName])

  if (!connectionId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-muted">
        <p className="text-body-secondary text-text-secondary">
          Select a MongoDB connection from the sidebar to get started.
        </p>
      </div>
    )
  }

  if (!connection) return <Navigate to="/" replace />

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base text-text-primary">
      {loading && !payload ? (
        <CenteredLoadingState
          loading
          label="Loading MongoDB connection..."
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
              context={{
                payload,
                databases,
                collections,
                loading,
                error,
                connection,
              } satisfies MongoLayoutOutletContext}
            />
          </div>
        </div>
      )}
    </div>
  )
}
