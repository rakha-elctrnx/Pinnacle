import { RefreshCw } from 'lucide-react'

interface ConnectionHeaderProps {
  onRefresh: () => void
}

export function ConnectionHeader({ onRefresh }: ConnectionHeaderProps) {
  return (
    <header className="border-b border-border-default bg-bg-subtle px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-border-default px-3 py-2 text-subheading text-text-secondary hover:bg-bg-muted"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
    </header>
  )
}
