import { Database, Plus } from 'lucide-react'
import { useDataExplorerContext } from '../context/DataExplorerContext'

/**
 * WelcomePage — root landing page shown when no connection is active.
 *
 * Route: `/` (index route inside `DataExplorerLayout`)
 *
 * Displays a clean empty state with a message prompting the user to
 * create or open a connection. The "New Connection" button opens the
 * shared `ConnectionFormModal` via the orchestrator context.
 */
export function WelcomePage() {
  const { openCreateConnection } = useDataExplorerContext()

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
        {/* Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-bg-muted/40">
          <Database
            className="h-10 w-10 text-text-secondary"
            strokeWidth={1.5}
          />
        </div>

        {/* Heading */}
        <h1 className="text-display text-text-primary">Welcome to Pinnacle</h1>

        {/* Description */}
        <p className="text-body leading-relaxed text-text-secondary">
          No connection is currently active. Create a new connection or select
          an existing one from the sidebar to start exploring your data.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={openCreateConnection}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-subheading text-text-inverse shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New Connection
          </button>
        </div>

        {/* Hint */}
        <p className="text-caption text-text-secondary/70 pt-2">
          Tip: you can also use the sidebar on the left to manage your
          connections.
        </p>
      </div>
    </div>
  )
}
