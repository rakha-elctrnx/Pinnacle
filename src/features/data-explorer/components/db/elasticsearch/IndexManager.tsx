import { useState, useCallback } from 'react'
import type { ConnectionPayload } from '../../../../../services/tauriClient'
import type { ElasticIndex } from '../../../../../types/domain'
import {
  elasticDeleteIndex,
  elasticRefreshIndex,
  elasticOpenIndex,
  elasticCloseIndex,
  elasticCreateIndex,
} from '../../../../../services/tauriClient'
import { Plus, Trash2, RefreshCw, FolderOpen, FolderClosed, Search, SlidersHorizontal } from 'lucide-react'

interface Props {
  connection: ConnectionPayload
  indices: ElasticIndex[]
  onRefresh: () => void
  onSelectIndex: (name: string) => void
}

export function IndexManager({ connection, indices, onRefresh, onSelectIndex }: Props) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newIndexName, setNewIndexName] = useState('')
  const [sortField, setSortField] = useState<string>('index')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [showHidden, setShowHidden] = useState(false)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ names: string[] } | null>(null)

  function sortVal(idx: ElasticIndex, field: string): string {
    const r = idx as unknown as Record<string, unknown>
    return String(r[field] ?? '')
  }

  const filtered = indices
    .filter((idx) => showHidden || !idx.index.startsWith('.'))
    .filter((idx) => idx.index.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aVal = sortVal(a, sortField)
      const bVal = sortVal(b, sortField)
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((i) => i.index)))
    }
  }, [selected.size, filtered])

  const doAction = useCallback(async (action: 'delete' | 'refresh' | 'open' | 'close', names: string[]) => {
    if (names.length === 0) return
    if (action === 'delete') {
      setConfirmDelete({ names })
      return
    }
    setActionError(null)
    setLoading(true)
    try {
      for (const name of names) {
        const payload = { connection, indexName: name }
        if (action === 'refresh') await elasticRefreshIndex(payload)
        else if (action === 'open') await elasticOpenIndex(payload)
        else if (action === 'close') await elasticCloseIndex(payload)
      }
      setSelected(new Set())
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [connection, onRefresh])

  const confirmDeleteAction = useCallback(async () => {
    if (!confirmDelete) return
    setActionError(null)
    setLoading(true)
    try {
      for (const name of confirmDelete.names) {
        await elasticDeleteIndex({ connection, indexName: name })
      }
      setSelected(new Set())
      setConfirmDelete(null)
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [confirmDelete, connection, onRefresh])

  const doCreate = useCallback(async () => {
    if (!newIndexName.trim()) return
    setActionError(null)
    setLoading(true)
    try {
      await elasticCreateIndex({ connection, indexName: newIndexName.trim() })
      setNewIndexName('')
      setShowCreate(false)
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [connection, newIndexName, onRefresh])

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function sortIndicator(field: string) {
    if (sortField !== field) return null
    return <span className="ml-1 text-slate-400">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">
          <span className="truncate">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          <span>
            Delete {confirmDelete.names.length} index(es)?
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={confirmDeleteAction}
              disabled={loading}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              title="Filter options"
              className={`rounded-md p-1.5 transition-all ${
                showHidden
                  ? 'bg-blue-50 text-blue-600 shadow-[inset_0_0_0_1px_theme(colors.blue.300)]'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)]'
              }`}
            >
              <SlidersHorizontal size={13} />
            </button>
            {showFilterDropdown && (
              <div className="absolute top-full left-0 mt-1 w-48 rounded-md border border-slate-200 bg-white shadow-lg z-20 p-1.5">
                <label className="flex items-center gap-2 text-xs text-slate-700 select-none cursor-pointer rounded px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                    className="accent-blue-500"
                  />
                  Show Hidden
                </label>
              </div>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search indices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 rounded-md border border-slate-200 bg-white pl-7 pr-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {selected.size > 0 && (
            <>
              <button
                onClick={() => doAction('refresh', [...selected])}
                disabled={loading}
                title="Refresh selected"
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)] disabled:opacity-50"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={() => doAction('open', [...selected])}
                disabled={loading}
                title="Open selected"
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)] disabled:opacity-50"
              >
                <FolderOpen size={13} />
              </button>
              <button
                onClick={() => doAction('close', [...selected])}
                disabled={loading}
                title="Close selected"
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)] disabled:opacity-50"
              >
                <FolderClosed size={13} />
              </button>
              <button
                onClick={() => doAction('delete', [...selected])}
                disabled={loading}
                title={`Delete ${selected.size} index(es)`}
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-[inset_0_0_0_1px_theme(colors.red.200)] disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
              <div className="mx-1.5 h-3.5 w-px bg-slate-200" />
            </>
          )}
          <button
            onClick={() => setShowCreate(!showCreate)}
            title="Create index"
            className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)]"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Create index form */}
      {showCreate && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50">
          <input
            type="text"
            placeholder="Index name"
            value={newIndexName}
            onChange={(e) => setNewIndexName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doCreate()}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none w-56"
          />
          <button
            onClick={doCreate}
            disabled={loading || !newIndexName.trim()}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            Create
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewIndexName('') }}
            className="rounded-md px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
        <table
          className="w-full border-collapse text-xs"
          style={{ tableLayout: 'fixed' }}
        >
          <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_0_theme(colors.slate.200)]">
            <tr className="text-left text-slate-600">
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5"
                style={{ width: 36 }}
              >
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="accent-blue-500"
                />
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 60 }}
                onClick={() => toggleSort('health')}
              >
                Health {sortIndicator('health')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                onClick={() => toggleSort('index')}
              >
                Index {sortIndicator('index')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 80 }}
                onClick={() => toggleSort('status')}
              >
                Status {sortIndicator('status')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 text-right cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 90 }}
                onClick={() => toggleSort('docs.count')}
              >
                Docs {sortIndicator('docs.count')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 text-right cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 80 }}
                onClick={() => toggleSort('store.size')}
              >
                Size {sortIndicator('store.size')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 text-right cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 70 }}
                onClick={() => toggleSort('pri')}
              >
                Shards {sortIndicator('pri')}
              </th>
              <th
                className="border-b border-r border-slate-200 px-2 py-1.5 text-right cursor-pointer select-none font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 80 }}
                onClick={() => toggleSort('rep')}
              >
                Replicas {sortIndicator('rep')}
              </th>
              <th
                className="border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                style={{ width: 64 }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="px-2 py-8 text-center text-slate-400"
                >
                  No indices found
                </td>
              </tr>
            )}
            {filtered.map((idx) => (
              <tr
                key={idx.index}
                className="text-slate-700 even:bg-slate-50/50 hover:bg-blue-50/40"
              >
                <td className="border-b border-r border-slate-100 px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.has(idx.index)}
                    onChange={() => toggleSelect(idx.index)}
                    className="accent-blue-500"
                  />
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      idx.health === 'green'
                        ? 'bg-emerald-500'
                        : idx.health === 'yellow'
                          ? 'bg-amber-400'
                          : 'bg-red-500'
                    }`}
                  />
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                  <button
                    onClick={() => onSelectIndex(idx.index)}
                    className="text-blue-600 hover:text-blue-500 font-mono hover:underline"
                  >
                    {idx.index}
                  </button>
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                  <span className="font-medium text-slate-600">{idx.status}</span>
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {idx['docs.count'] ?? '—'}
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {idx['store.size'] ?? '—'}
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {idx.pri}
                </td>
                <td className="border-b border-r border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis">
                  {idx.rep}
                </td>
                <td className="border-b border-slate-100 px-2 py-1.5">
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => doAction('refresh', [idx.index])}
                      title="Refresh"
                      className="rounded-md p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => doAction('delete', [idx.index])}
                      title="Delete"
                      className="rounded-md p-1 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-[inset_0_0_0_1px_theme(colors.red.200)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}