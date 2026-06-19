import { Database, Plus } from 'lucide-react'
import { useDataExplorerContext } from '../context/DataExplorerContext'

/**
 * WelcomePage — root landing page shown when no connection is active.
 *
 * Route: `/` (index route inside `DataExplorerLayout`)
 *
 * Displays a clean empty state with a message prompting the user to
 * create or open a connection. The "New Connection" button opens the
 * shared `ConnectionWizardModal` via the orchestrator context.
 */
export function WelcomePage() {
  const { setIsAddModalOpen } = useDataExplorerContext()

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
        {/* Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-variant/40">
          <Database className="h-10 w-10 text-on-surface-variant" strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-on-surface">
          Welcome to Pinnacle
        </h1>

        {/* Description */}
        <p className="text-sm leading-relaxed text-on-surface-variant">
          No connection is currently active. Create a new connection or select
          an existing one from the sidebar to start exploring your data.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New Connection
          </button>
        </div>

        {/* Hint */}
        <p className="text-xs text-on-surface-variant/70 pt-2">
          Tip: you can also use the sidebar on the left to manage your connections.
        </p>
      </div>
    </div>
  )
}
