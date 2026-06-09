import { Copy, Download, Pencil, RefreshCw, Trash2, Unplug } from 'lucide-react'
import type { ContextMenuState } from '../types'

interface ContextMenuProps {
  state: ContextMenuState
  onEdit: (itemId: string) => void
  onRefresh: (itemId: string) => void
  onCloseConnection: (itemId: string) => void
  onDuplicate: (itemId: string) => void
  onExport: (itemId: string) => void
  onDelete: (itemId: string) => void
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
  onClose,
}: ContextMenuProps) {
  return (
    <div
      style={{ top: state.y, left: state.x }}
      className="fixed z-50 min-w-40 rounded-lg border border-slate-200/80 bg-white/95 p-1 shadow-sm backdrop-blur-sm"
    >
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
    </div>
  )
}