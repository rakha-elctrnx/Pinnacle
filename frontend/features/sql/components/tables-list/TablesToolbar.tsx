import {
  Trash2,
  Search,
  List,
  Network,
  Columns3Cog,
  CirclePlus,
} from 'lucide-react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'

interface TablesToolbarProps {
  selectedTableName: string | null
  viewMode: 'detail' | 'er-diagram'
  search: string
  onNewTable: () => void
  onDesignTable: () => void
  onDeleteTable: () => void
  onViewModeChange: (mode: 'detail' | 'er-diagram') => void
  onSearchChange: (search: string) => void
}

export function TablesToolbar({
  selectedTableName,
  viewMode,
  search,
  onNewTable,
  onDesignTable,
  onDeleteTable,
  onViewModeChange,
  onSearchChange,
}: TablesToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-default px-1.5 py-1.5 animate-in fade-in duration-200">
      <div className="inline-flex items-center gap-1">
        <ActionButton
          icon={<CirclePlus size={14} />}
          aria-label="New Table"
          variant="accent"
          onClick={onNewTable}
        />
        <ActionButton
          icon={<Columns3Cog size={14} />}
          aria-label="Design Table"
          variant="secondary"
          disabled={!selectedTableName}
          onClick={onDesignTable}
        />
        <ActionButton
          icon={<Trash2 size={14} />}
          aria-label="Delete"
          variant="danger"
          disabled={!selectedTableName}
          onClick={onDeleteTable}
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* View mode toggle */}
        <div className="inline-flex h-7 items-center rounded-md border border-border-default bg-bg-subtle p-0.5">
          <button
            type="button"
            onClick={() => onViewModeChange('detail')}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-label transition-colors',
              viewMode === 'detail'
                ? 'bg-bg-base text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            title="Detail view"
          >
            <List className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Detail</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('er-diagram')}
            className={[
              'inline-flex items-center gap-1 rounded px-2 py-1 text-label transition-colors',
              viewMode === 'er-diagram'
                ? 'bg-bg-base text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            ].join(' ')}
            title="ER Diagram view"
          >
            <Network className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">ER Diagram</span>
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-7 w-64 rounded-md border border-border-default bg-bg-base pl-7 pr-2.5 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
