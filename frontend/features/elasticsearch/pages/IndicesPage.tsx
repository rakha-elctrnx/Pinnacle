import { useMemo, useState } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import { Trash2, Search, CirclePlus, RefreshCw, FolderOpen } from 'lucide-react'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import type { ElasticLayoutOutletContext } from '../types/pages'
import type { ElasticIndex } from '../types/elasticsearch'
import {
  elasticCreateIndex,
  elasticDeleteIndex,
  elasticRefreshIndex,
  elasticOpenIndex,
} from '../clients/elasticsearch'
type SortField =
  | 'health'
  | 'index'
  | 'status'
  | 'docs.count'
  | 'store.size'
  | 'pri'
  | 'rep'
type SortDirection = 'asc' | 'desc'

/**
 * IndicesPage — lists Elasticsearch indices in the active cluster.
 *
 * Route: `/elasticsearch/:connectionId/indices`
 *
 * Responsibilities:
 * - Show searchable, sortable index list
 * - Inline create / delete / refresh actions
 * - Navigate to index detail on row click (toolbar Open button or double-click)
 */
export function IndicesPage() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()
  const { groupedConnections, selectedConnection, wrappedHandleTreeNodeClick } =
    useDataExplorerContext()
  const { payload, indices, loading, refresh } =
    useOutletContext<ElasticLayoutOutletContext>()

  // ── State ──
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('index')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedIndexName, setSelectedIndexName] = useState<string | null>(
    null,
  )
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newIndexName, setNewIndexName] = useState('')

  // ── Derived data ──
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const searched = normalizedSearch
      ? indices.filter(
          (row) =>
            row.index.toLowerCase().includes(normalizedSearch) ||
            row.health.toLowerCase().includes(normalizedSearch) ||
            row.status.toLowerCase().includes(normalizedSearch),
        )
      : indices

    return [...searched].sort((a, b) => {
      const aVal = String(a[sortField as keyof ElasticIndex] ?? '')
      const bVal = String(b[sortField as keyof ElasticIndex] ?? '')

      if (sortField === 'docs.count' || sortField === 'store.size') {
        const aNum = Number(aVal.replace(/[^0-9.]/g, '') || 0)
        const bNum = Number(bVal.replace(/[^0-9.]/g, '') || 0)
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }

      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    })
  }, [indices, search, sortField, sortDirection])

  // ── Sort helpers ──
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('asc')
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return (
      <span className="ml-1 text-text-muted">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  // ── Selection ──
  const handleRowSelection = (indexName: string) => {
    setSelectedIndexName((prev) => (prev === indexName ? null : indexName))
    setActionError(null)
  }

  // ── CRUD handlers ──
  const doAction = async (
    action: 'delete' | 'refresh' | 'open',
    names: string[],
  ) => {
    if (!payload || names.length === 0) return
    setActionLoading(true)
    setActionError(null)
    try {
      const op =
        action === 'delete'
          ? elasticDeleteIndex
          : action === 'refresh'
            ? elasticRefreshIndex
            : elasticOpenIndex
      for (const name of names) {
        await op({ connection: payload, indexName: name })
      }
      refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionLoading(false)
    }
  }

  const doCreate = async () => {
    const trimmed = newIndexName.trim()
    if (!payload || !trimmed) return
    setActionLoading(true)
    setActionError(null)
    try {
      await elasticCreateIndex({
        connection: payload,
        indexName: trimmed,
      })
      setShowCreate(false)
      setNewIndexName('')
      refresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionLoading(false)
    }
  }
  // ── Navigate to index detail ──
  const handleRowDoubleClick = (indexName: string) => {
    navigate(
      `/elasticsearch/${connectionId}/indices/${encodeURIComponent(indexName)}`,
    )

    // Find the group name for this connection
    const groupName =
      selectedConnection && groupedConnections
        ? Object.entries(groupedConnections).find(([, profiles]) =>
            profiles.some((p) => p.id === selectedConnection.id),
          )?.[0]
        : undefined

    // Build full tree path: groupName/connectionName/Indices/indexName
    const parts = []
    if (groupName && selectedConnection) {
      parts.push(groupName, selectedConnection.name)
    }
    parts.push('Indices', indexName)
    const treePath = parts.join('/')

    wrappedHandleTreeNodeClick(indexName, undefined, treePath)
  }

  // ── Render ──
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base"
      onClick={() => {
        if (selectedIndexName) {
          setSelectedIndexName(null)
          setActionError(null)
        }
      }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border-default px-1.5 py-1.5">
        <div className="inline-flex items-center gap-1">
          <ActionButton
            icon={<CirclePlus size={14} />}
            aria-label="New Index"
            variant="accent"
            onClick={() => setShowCreate(!showCreate)}
          />
          <ActionButton
            icon={<RefreshCw size={14} />}
            aria-label="Refresh selected"
            variant="secondary"
            disabled={!selectedIndexName || actionLoading}
            onClick={() => {
              if (selectedIndexName)
                void doAction('refresh', [selectedIndexName])
            }}
          />
          <ActionButton
            icon={<FolderOpen size={14} />}
            aria-label="Open Index"
            variant="secondary"
            disabled={!selectedIndexName || actionLoading}
            onClick={() => {
              if (selectedIndexName) handleRowDoubleClick(selectedIndexName)
            }}
          />
          <ActionButton
            icon={<Trash2 size={14} />}
            aria-label="Delete selected"
            variant="danger"
            disabled={!selectedIndexName || actionLoading}
            onClick={() => {
              if (selectedIndexName)
                void doAction('delete', [selectedIndexName])
              setActionError(null)
            }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search indices..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-64 rounded-md border border-border-default bg-bg-base pl-7 pr-2.5 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Create index form ── */}
      {showCreate && (
        <div
          className="flex items-center gap-2 border-b border-border-default bg-bg-subtle px-3 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            placeholder="Index name"
            value={newIndexName}
            onChange={(event) => setNewIndexName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void doCreate()
            }}
            className="w-56 rounded-md border border-border-default bg-bg-base px-2.5 py-1 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void doCreate()}
            disabled={actionLoading || !newIndexName.trim()}
            className="rounded bg-primary px-2.5 py-1 text-label text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate(false)
              setNewIndexName('')
              setActionError(null)
            }}
            className="rounded px-2 py-1 text-label text-text-secondary transition-colors hover:bg-bg-subtle"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Error banner ── */}
      {actionError && (
        <div
          className="flex items-center justify-between gap-2 border-b border-border-danger bg-danger-subtle px-3 py-1.5 text-body text-danger"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-micro text-danger transition-colors hover:bg-danger-subtle"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Content ── */}
      {loading && (
        <CenteredLoadingState loading={loading} label="Loading indices..." />
      )}

      {!loading && (
        <div
          className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-border-default [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-bg-muted [&::-webkit-scrollbar-track]:bg-bg-subtle"
          onClick={(e) => e.stopPropagation()}
        >
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed' }}
          >
            <thead className="sticky top-0 z-10 bg-bg-subtle shadow-[0_1px_0_0_var(--color-border-default)]">
              <tr className="text-left text-text-secondary">
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  style={{ width: 60 }}
                  onClick={() => toggleSort('health')}
                >
                  Health {sortIndicator('health')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  onClick={() => toggleSort('index')}
                >
                  Index {sortIndicator('index')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  style={{ width: 80 }}
                  onClick={() => toggleSort('status')}
                >
                  Status {sortIndicator('status')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-label text-text-primary"
                  style={{ width: 90 }}
                  onClick={() => toggleSort('docs.count')}
                >
                  Docs {sortIndicator('docs.count')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-label text-text-primary"
                  style={{ width: 100 }}
                  onClick={() => toggleSort('store.size')}
                >
                  Size {sortIndicator('store.size')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-label text-text-primary"
                  style={{ width: 70 }}
                  onClick={() => toggleSort('pri')}
                >
                  Shards {sortIndicator('pri')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-label text-text-primary"
                  style={{ width: 80 }}
                  onClick={() => toggleSort('rep')}
                >
                  Replicas {sortIndicator('rep')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-8 text-center text-text-muted"
                  >
                    No indices found
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => {
                const isSelected = selectedIndexName === row.index
                return (
                  <tr
                    key={row.index}
                    className={[
                      'cursor-pointer text-text-primary even:bg-bg-subtle/50 hover:bg-primary-subtle/40',
                      isSelected
                        ? 'bg-primary-subtle/70! even:bg-primary-subtle/70!'
                        : '',
                    ].join(' ')}
                    onClick={() => handleRowSelection(row.index)}
                    onDoubleClick={() => handleRowDoubleClick(row.index)}
                  >
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          row.health === 'green'
                            ? 'bg-success'
                            : row.health === 'yellow'
                              ? 'bg-warning'
                              : 'bg-danger'
                        }`}
                      />
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRowDoubleClick(row.index)
                        }}
                        className="text-mono text-primary hover:text-primary-hover hover:underline"
                      >
                        {row.index}
                      </button>
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      {row.status}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-mono">
                      {row['docs.count'] ?? '—'}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-mono">
                      {row['store.size'] ?? '—'}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-mono">
                      {row.pri}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-border-default px-2 py-1.5 text-right text-mono">
                      {row.rep}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
