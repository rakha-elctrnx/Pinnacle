import { Table } from 'lucide-react'

/**
 * ConnectionWelcomePage — shown when a connection is active but no
 * specific table/query/erd route is selected.
 *
 * Route: `/sql/:connectionId` (index route inside SqlLayout)
 *
 * Prompts the user to select a table from the sidebar or use the
 * sub-nav tabs (Tables, Query, ERD) to navigate to a specific view.
 */
export function ConnectionWelcomePage() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center gap-6 text-center max-w-md px-6">
        {/* Icon */}
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-variant/40">
          <Table className="h-10 w-10 text-text-secondary" strokeWidth={1.5} />
        </div>

        {/* Heading */}
        <h1 className="text-display text-text-primary">
          Connection Active
        </h1>

        {/* Description */}
        <p className="text-body-secondary text-text-secondary leading-relaxed">
          You're connected to the database. Select a table from the sidebar to
          view its data, or use the navigation tabs above to browse tables,
          write queries, or view the ERD.
        </p>

        {/* Hint */}
        <p className="text-caption text-text-muted opacity-70 pt-2">
          Tip: expand the connection in the sidebar and click on a table to get started.
        </p>
      </div>
    </div>
  )
}
