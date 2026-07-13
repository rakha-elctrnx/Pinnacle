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
} from 'lucide-react'
import { ActionButton } from '../../../_shared/components/ui/ActionButton'
import { Dropdown } from '../../../_shared/components/ui/Dropdown'
import type { CellPosition } from '../../store/tableSelectionStore'

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
  hasPrimaryKey: boolean
  handleCommit: () => void
  handleRevert: () => void
  setShortcutsOpen: (open: boolean) => void
  exportOpen: boolean
  setExportOpen: (open: boolean) => void
  handleExportCSV: () => void
  handleExportJSON: () => void
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
  hasPrimaryKey,
  handleCommit,
  handleRevert,
  setShortcutsOpen,
  exportOpen,
  setExportOpen,
  handleExportCSV,
  handleExportJSON,
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
        onClick={handleAddRow}
      />
      <ActionButton
        icon={<CircleMinus size={14} />}
        aria-label="Delete Row"
        variant="danger"
        disabled={activeCell === null}
        onClick={handleDeleteRow}
      />
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
        disabled={totalPending === 0 || isCommitPending || !hasPrimaryKey}
        onClick={handleCommit}
      />
      <ActionButton
        icon={<Undo2 size={14} />}
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
      <div className="relative">
        <ActionButton
          icon={<Download size={14} />}
          aria-label="Export data"
          variant="default"
          onClick={() => setExportOpen(true)}
        />
        <Dropdown
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          align="right"
          items={[
            {
              label: 'Export as CSV',
              icon: (
                <span className="font-mono text-micro text-text-muted">
                  CSV
                </span>
              ),
              action: handleExportCSV,
            },
            {
              label: 'Export as JSON',
              icon: (
                <span className="font-mono text-micro text-text-muted">
                  JSON
                </span>
              ),
              action: handleExportJSON,
            },
          ]}
        />
      </div>
    </div>
  )
}
