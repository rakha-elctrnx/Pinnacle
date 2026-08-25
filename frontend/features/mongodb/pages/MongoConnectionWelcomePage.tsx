import { useParams } from 'react-router-dom'
import { Database } from 'lucide-react'

export function MongoConnectionWelcomePage() {
  const { connectionId } = useParams<{ connectionId: string }>()

  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg-base p-6 text-text-primary">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
        <Database className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
      </div>
      <h1 className="text-display text-text-primary">MongoDB Connected</h1>
      <p className="mt-2 max-w-md text-center text-body-secondary leading-relaxed text-text-secondary">
        Connected to <span className="font-mono text-text-primary">{connectionId}</span>. Expand a database and select a collection in the sidebar to browse documents, run aggregations, or manage its schema.
      </p>
    </div>
  )
}
