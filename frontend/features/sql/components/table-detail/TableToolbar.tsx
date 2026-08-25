import {
  Filter,
  CirclePlus,
  CircleMinus,
  RefreshCw,
  Undo2,
  Redo2,
  Check,
  Keyboard,
  Download,
  X,
} from 'lucide-react'
import type { CellPosition } from '../../store/tableSelectionStore'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'

interface TableToolbarProps {
  filtersLength: number
  filterPanelOpen: boolean
  setFilterPanelOpen: (open: boolean) => void
  handleAddRow: () => void
  activeCell: CellPosition | null
  handleDeleteRow: () => void
  handleRefresh: () => void
  undoAvailable: boolean
  handleUndo: () => void
  redoAvailable: boolean
  handleRedo: () => void
  totalPending: number
  isCommitPending: boolean
  readOnly: boolean
  handleCommit: () => void
  handleRevert: () => void
  /**
   * When to render the read-only explanation. Gated by the caller so the
   * notice appears only once a fetch has confirmed the table lacks a PK —
   * not speculatively while data/indexes are still loading.
   */
  showReadOnlyNotice?: boolean
  setShortcutsOpen: (open: boolean) => void
  tableName: string
  onExportData: (tableName: string) => void
}

export function TableToolbar({
  filtersLength,
  filterPanelOpen,
  setFilterPanelOpen,
  handleAddRow,
  activeCell,
  handleDeleteRow,
  handleRefresh,
  undoAvailable,
  handleUndo,
  redoAvailable,
  handleRedo,
  totalPending,
  isCommitPending,
  readOnly,
  showReadOnlyNotice = false,
  handleCommit,
  handleRevert,
  setShortcutsOpen,
  tableName,
  onExportData,
}: TableToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
      <ActionButton
        icon={<Filter size={14} />}
        aria-label="Toggle Filter"
        variant={
          filtersLength > 0 ? 'active' : filterPanelOpen ? 'accent' : 'default'
        }
        onClick={() => setFilterPanelOpen(!filterPanelOpen)}
      />
      {filtersLength > 0 && !filterPanelOpen && (
        <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary leading-none">
          {filtersLength}
        </span>
      )}
      <ActionButton
        icon={<CirclePlus size={14} />}
        aria-label="Add Row"
        variant="accent"
        disabled={readOnly}
        onClick={handleAddRow}
      />
      <ActionButton
        icon={<CircleMinus size={14} />}
        aria-label="Delete Row"
        variant="danger"
        disabled={readOnly || activeCell === null}
        onClick={handleDeleteRow}
      />
      {showReadOnlyNotice && (
        <span className="whitespace-nowrap px-1 text-[11px] italic text-text-muted">
          Read-only: this table has no primary key
        </span>
      )}
      <ActionButton
        icon={<RefreshCw size={14} />}
        aria-label="Refresh"
        onClick={handleRefresh}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <ActionButton
        icon={<Undo2 size={14} />}
        aria-label="Undo (Cmd/Ctrl+Z)"
        variant="default"
        disabled={!undoAvailable}
        onClick={handleUndo}
      />
      <ActionButton
        icon={<Redo2 size={14} />}
        aria-label="Redo (Cmd/Ctrl+Shift+Z)"
        variant="default"
        disabled={!redoAvailable}
        onClick={handleRedo}
      />
      <span className="mx-0.5 h-5 w-px bg-border-default" />
      <ActionButton
        icon={<Check size={14} />}
        aria-label="Commit changes"
        variant="success"
        disabled={totalPending === 0 || isCommitPending || readOnly}
        onClick={handleCommit}
      />
      <ActionButton
        icon={<X size={14} />}
        aria-label="Revert changes"
        variant="danger"
        disabled={totalPending === 0}
        onClick={handleRevert}
      />
      <ActionButton
        icon={<Keyboard size={14} />}
        aria-label="Keyboard shortcuts"
        variant="default"
        onClick={() => setShortcutsOpen(true)}
      />
      <span className="ml-auto" />
      <ActionButton
        icon={<Download size={14} />}
        aria-label="Export data"
        variant="default"
        disabled={tableName === ''}
        onClick={() => onExportData(tableName)}
      />
    </div>
  )
}
