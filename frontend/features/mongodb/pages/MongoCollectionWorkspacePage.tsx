import { useEffect, useState } from 'react'
import {
  NavLink,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from 'react-router-dom'
import {
  Cpu,
  Database,
  Download,
  FileText,
  Folder,
  Layers,
  ShieldCheck,
} from 'lucide-react'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { useTabStore } from '../../_shared/store/tabStore'
import { MongoExportModal } from '../components/MongoExportModal'
import type { MongoLayoutOutletContext } from '../layouts/MongoLayout'
import { MongoAggregationsTab } from '../components/MongoAggregationsTab'
import { MongoDocumentsTab } from '../components/MongoDocumentsTab'
import { MongoIndexesTab } from '../components/MongoIndexesTab'
import { MongoSchemaTab } from '../components/MongoSchemaTab'
import { MongoValidationTab } from '../components/MongoValidationTab'

export interface MongoCollectionRouteContext {
  payload: MongoLayoutOutletContext['payload']
  database: string
  collection: string
}

const collectionSections = [
  { to: '.', label: 'Documents', icon: FileText, end: true },
  { to: 'aggregations', label: 'Aggregations', icon: Layers },
  { to: 'schema', label: 'Schema', icon: Cpu },
  { to: 'indexes', label: 'Indexes', icon: Folder },
  { to: 'validation', label: 'Validation', icon: ShieldCheck },
] as const

export function MongoCollectionWorkspacePage() {
  const { connectionId, databaseName, collectionName } = useParams<{
    connectionId: string
    databaseName: string
    collectionName: string
  }>()
  const location = useLocation()
  const { payload, loading, error, connection } =
    useOutletContext<MongoLayoutOutletContext>()
  const [showExportModal, setShowExportModal] = useState(false)

  useEffect(() => {
    if (!connectionId || !databaseName || !collectionName) return
    const tabId = `${connectionId}:mongo:${databaseName}:${collectionName}`
    const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
    if (!tab) return
    if (tab.route !== location.pathname) {
      useTabStore.getState().updateTabRoute(tabId, location.pathname)
    }
    useTabStore.getState().activateTab(tabId)
  }, [connectionId, databaseName, collectionName, location.pathname])

  if (!databaseName || !collectionName) {
    return (
      <div className="flex h-full items-center justify-center text-caption text-text-muted">
        Select a collection from the sidebar.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base text-text-primary">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-default bg-bg-subtle/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-label text-text-secondary">
          <Database className="h-4 w-4 shrink-0 text-success" />
          <span className="truncate font-medium text-text-primary">
            {connection.name}
          </span>
          <span aria-hidden="true" className="text-text-muted">
            /
          </span>
          <span className="truncate">{databaseName}</span>
          <span aria-hidden="true" className="text-text-muted">
            /
          </span>
          <span className="truncate font-medium text-text-primary">
            {collectionName}
          </span>
        </div>
        <ActionButton
          icon={<Download size={14} />}
          aria-label="Export collection"
          onClick={() => setShowExportModal(true)}
          disabled={!payload}
        />
      </header>

      <nav
        aria-label="Collection sections"
        className="flex shrink-0 items-center overflow-x-auto border-b border-border-default bg-bg-base px-2"
      >
        {collectionSections.map(({ to, label, icon: Icon, ...section }) => (
          <NavLink
            key={label}
            to={to}
            end={'end' in section ? section.end : false}
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 px-3 py-2 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="shrink-0 border-b border-border-danger bg-danger-subtle px-3 py-2 text-body text-danger"
        >
          {error}
        </div>
      )}

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {loading && !payload ? (
          <CenteredLoadingState loading label="Loading collection..." />
        ) : payload ? (
          <Outlet context={{ payload, database: databaseName, collection: collectionName } satisfies MongoCollectionRouteContext} />
        ) : !error ? (
          <div className="flex h-full items-center justify-center text-caption text-text-muted">
            MongoDB connection data is unavailable.
          </div>
        ) : null}
      </main>

      {showExportModal && (
        <MongoExportModal
          payload={payload}
          database={databaseName}
          collection={collectionName}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  )
}

function useCollectionRouteContext() {
  return useOutletContext<MongoCollectionRouteContext>()
}

export function MongoDocumentsPage() {
  const context = useCollectionRouteContext()
  return <MongoDocumentsTab {...context} />
}

export function MongoAggregationsPage() {
  const context = useCollectionRouteContext()
  return <MongoAggregationsTab {...context} />
}

export function MongoSchemaPage() {
  const context = useCollectionRouteContext()
  return <MongoSchemaTab {...context} />
}

export function MongoIndexesPage() {
  const context = useCollectionRouteContext()
  return <MongoIndexesTab {...context} />
}

export function MongoValidationPage() {
  const context = useCollectionRouteContext()
  return <MongoValidationTab {...context} />
}
