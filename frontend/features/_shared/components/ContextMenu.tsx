import { Copy, Download, Eraser, FileDown, Pencil, RefreshCw, Scissors, TableProperties, Trash2, Unplug } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ContextMenuState } from '../types/shared'

interface ContextMenuProps {
  state: ContextMenuState
  onEdit: (itemId: string) => void
  onRefresh: (itemId: string) => void
  onCloseConnection: (itemId: string) => void
  onDuplicate: (itemId: string) => void
  onExport: (itemId: string) => void
  onDelete: (itemId: string) => void
  onDesignTable?: (itemId: string) => void
  onDeleteTable?: (itemId: string, tableName: string) => void
  onEmptyTable?: (itemId: string, tableName: string) => void
  onTruncateTable?: (itemId: string, tableName: string) => void
  onExportTable?: (itemId: string, tableName: string) => void
  onClose: () => void
}

export function ContextMenu({
  state,
  onEdit,
  onRefresh,
  onCloseConnection,
  onDuplicate,
  onExport,
  onDelete,
  onDesignTable,
  onDeleteTable,
  onEmptyTable,
  onTruncateTable,
  onExportTable,
  onClose,
}: ContextMenuProps) {
  const isTableContext = !!state.tableName
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: state.y, left: state.x })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 4

    let top = state.y
    let left = state.x

    // Flip vertically if overflowing bottom
    if (top + rect.height > vh) {
      top = state.y - rect.height
      if (top < GAP) top = GAP
    }

    // Flip horizontally if overflowing right
    if (left + rect.width > vw) {
      left = state.x - rect.width
      if (left < GAP) left = GAP
    }

    // Clamp to top-left edge
    if (top < GAP) top = GAP
    if (left < GAP) left = GAP

    setPos({ top, left })
  }, [state.x, state.y])

  return (
    <div
      ref={menuRef}
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-50 min-w-40 rounded-lg border border-slate-200/80 bg-white/95 p-1 shadow-sm backdrop-blur-sm"
    >
      {/* Table-specific actions when right-clicking a table node */}
      {isTableContext && (
        <>
          {onDesignTable && (
            <button
              type="button"
              onClick={() => {
                onDesignTable(state.tableName!)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
            >
              <TableProperties size={13} className="text-slate-400" /> Design Table
            </button>
          )}
          {onEmptyTable && (
            <button
              type="button"
              onClick={() => {
                onEmptyTable(state.itemId, state.tableName!)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
            >
              <Eraser size={13} className="text-slate-400" /> Empty Table
            </button>
          )}
          {onTruncateTable && (
            <button
              type="button"
              onClick={() => {
                onTruncateTable(state.itemId, state.tableName!)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
            >
              <Scissors size={13} className="text-slate-400" /> Truncate Table
            </button>
          )}
          {onExportTable && (
            <button
              type="button"
              onClick={() => {
                onExportTable(state.itemId, state.tableName!)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
            >
              <FileDown size={13} className="text-slate-400" /> Export Data
            </button>
          )}
          {onDeleteTable && (
            <button
              type="button"
              onClick={() => {
                onDeleteTable(state.itemId, state.tableName!)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:bg-red-50"
            >
              <Trash2 size={13} /> Delete Table
            </button>
          )}
          <div className="my-1 border-t border-slate-200/70" />
        </>
      )}

      {/* Standard connection-level actions */}
      {!isTableContext && (
        <>
          <button
            type="button"
            onClick={() => {
              onEdit(state.itemId)
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
          >
            <Pencil size={13} className="text-slate-400" /> Rename / Edit
          </button>
          {onDesignTable && (
            <button
              type="button"
              onClick={() => {
                onDesignTable(state.itemId)
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
            >
              <TableProperties size={13} className="text-slate-400" /> Edit Structure
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => {
          onRefresh(state.itemId)
          onClose()
        }}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
      >
        <RefreshCw size={13} className="text-slate-400" /> Refresh
      </button>
      {!isTableContext && (
        <>
          <button
            type="button"
            onClick={() => {
              onDuplicate(state.itemId)
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
          >
            <Copy size={13} className="text-slate-400" /> Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              onExport(state.itemId)
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
          >
            <Download size={13} className="text-slate-400" /> Export Configuration
          </button>
          <div className="my-1 border-t border-slate-200/70" />
          <button
            type="button"
            onClick={() => {
              onCloseConnection(state.itemId)
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus:bg-slate-100"
          >
            <Unplug size={13} className="text-slate-400" /> Close Connection
          </button>
          <button
            type="button"
            onClick={() => {
              onDelete(state.itemId)
              onClose()
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus:bg-red-50"
          >
            <Trash2 size={13} /> Delete
          </button>
        </>
      )}
    </div>
  )
}