import { RefreshCw } from 'lucide-react'

interface ConnectionHeaderProps {
  onRefresh: () => void
}

export function ConnectionHeader({ onRefresh }: ConnectionHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-subheading text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
    </header>
  )
}
