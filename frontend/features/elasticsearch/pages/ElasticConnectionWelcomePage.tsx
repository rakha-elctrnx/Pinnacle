import { Database } from 'lucide-react'

/**
 * ElasticConnectionWelcomePage — shown when an Elasticsearch connection
 * is active but no specific panel route is selected.
 *
 * Route: `/elasticsearch/:connectionId` (index route inside ElasticLayout)
 *
 * Prompts the user to use the navigation tabs above to browse cluster
 * info, indices, documents, run queries, or explore mappings.
 */
export function ElasticConnectionWelcomePage() {
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
        <h1 className="text-display text-text-primary">
          Elasticsearch Connected
        </h1>

        {/* Description */}
        <p className="text-body-secondary text-text-secondary leading-relaxed">
          You're connected to the Elasticsearch cluster. Use the navigation tabs
          above to explore cluster health, manage indices, browse documents, run
          queries, or inspect mappings.
        </p>

        {/* Hint */}
        <p className="text-caption text-text-muted opacity-70 pt-2">
          Tip: expand the connection in the sidebar and click on an index to
          browse its documents directly.
        </p>
      </div>
    </div>
  )
}
