/**
 * GridContextMenu — right-click context menu for the table data grid.
 *
 * Thin wrapper around GenericContextMenu that builds grid-specific items.
 *
 * Supports:
 * - Copy Row (TSV), Copy with headers, Copy as SQL, Copy as CSV
 * - Paste (TSV from clipboard, replaces full row)
 * - Set to NULL, Delete row(s)
 * - Generate SQL (opens modal)
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Viewport boundary detection (flip on overflow)
 * - Pinnacle token theme (dark/light mode)
 *
 * Note: This menu is for the data grid cells/rows, not the sidebar tree.
 * The sidebar tree has its own (Generic)ContextMenu usage.
 */

import { useMemo } from 'react'
import {
  ClipboardCopy,
  ClipboardPaste,
  FileCode,
  Ban,
  Trash2,
  Table2,
  ClipboardList,
  FileSpreadsheet,
} from 'lucide-react'
import { GenericContextMenu, type ContextMenuItem } from '../../_shared/components/ui/ContextMenu'

// ── Types ──────────────────────────────────────────────────────────

export interface GridContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onCopyRow: () => void
  onCopyWithHeaders: () => void
  onCopyAsSQL: () => void
  onCopyAsCSV: () => void
  onPaste: () => void
  onSetToNull: () => void
  onDeleteRows: () => void
  onGenerateSQL: () => void
}

// ── Component ──────────────────────────────────────────────────────

export function GridContextMenu({
  x,
  y,
  onClose,
  onCopyRow,
  onCopyWithHeaders,
  onCopyAsSQL,
  onCopyAsCSV,
  onPaste,
  onSetToNull,
  onDeleteRows,
  onGenerateSQL,
}: GridContextMenuProps) {
  const items = useMemo<ContextMenuItem[]>(
    () => [
      {
        label: 'Copy Row',
        shortcut: 'Ctrl+C',
        icon: <ClipboardCopy size={14} />,
        action: onCopyRow,
        dividerAfter: true,
      },
      {
        label: 'Copy with headers',
        shortcut: 'Ctrl+Shift+C',
        icon: <ClipboardList size={14} />,
        action: onCopyWithHeaders,
      },
      {
        label: 'Copy as SQL',
        icon: <FileCode size={14} />,
        action: onCopyAsSQL,
      },
      {
        label: 'Copy as CSV',
        icon: <FileSpreadsheet size={14} />,
        action: onCopyAsCSV,
        dividerAfter: true,
      },
      {
        label: 'Paste',
        shortcut: 'Ctrl+V',
        icon: <ClipboardPaste size={14} />,
        action: onPaste,
        dividerAfter: true,
      },
      {
        label: 'Set to NULL',
        shortcut: 'Ctrl+Shift+N',
        icon: <Ban size={14} />,
        action: onSetToNull,
      },
      {
        label: 'Generate SQL',
        icon: <Table2 size={14} />,
        action: onGenerateSQL,
      },
      {
        label: 'Delete row(s)',
        shortcut: 'Delete',
        icon: <Trash2 size={14} />,
        action: onDeleteRows,
        dangerous: true,
      },
    ],
    [onCopyRow, onCopyWithHeaders, onCopyAsSQL, onCopyAsCSV, onPaste, onSetToNull, onDeleteRows, onGenerateSQL],
  )

  return (
    <GenericContextMenu
      x={x}
      y={y}
      items={items}
      onClose={onClose}
      ariaLabel="Table grid context menu"
    />
  )
}