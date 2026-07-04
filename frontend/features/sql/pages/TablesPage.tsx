import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Trash2, Search, List, Network, Columns3Cog, CirclePlus } from 'lucide-react'
import { ReactFlowProvider } from '@xyflow/react'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { ERDiagramViewer } from '../components/shared/ERDiagramViewer'
import { openDesignerWindow } from '../services/designerWindowService'
import { executeSql } from '../clients/sql'
import { getConnPayloadWithPassword, isSqlConnectionType, quoteIdentifier } from '../../_shared/utils'
import type { SqlTableListItem } from '../../_shared/types/shared'
import type { SchemaColumn, SchemaForeignKey } from '../types/sql'

type ViewMode = 'detail' | 'er-diagram'
type SortField = 'tableName' | 'oid' | 'owner' | 'tableType' | 'rowCount'
type SortDirection = 'asc' | 'desc'

/**
 * TablesPage — lists tables in the active database.
 *
 * Route: `/sql/:connectionId/tables`
 *
 * Responsibilities:
 * - Show searchable, sortable table list
 * - Inline edit (rename) / delete selected table
 * - Open designer for create / edit
 * - Toggle between detail grid and ER diagram views
 * - Navigate to table detail on row click
 */
export function TablesPage() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()

  const {
    selectedConnection,
    explorerData: { sqlTableList, sqlTableListLoading, schemaForeignKeys, schemaColumns, selectedDatabase, selectedSchema, fetchSqlTableList, fetchDatabaseDetails },
    queryExecution: { queryDatabase, querySchema },
    handleRequestDeleteTable,
    wrappedHandleTreeNodeClick,
  } = useDataExplorerContext()


  // ── State ──
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('tableName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)
  const [nextTableName, setNextTableName] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('detail')

  // ── Derived data ──
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const searched = normalizedSearch
      ? sqlTableList.filter((row) =>
          row.tableName.toLowerCase().includes(normalizedSearch) ||
          row.owner.toLowerCase().includes(normalizedSearch) ||
          row.tableType.toLowerCase().includes(normalizedSearch),
        )
      : sqlTableList

    return [...searched].sort((a, b) => {
      const aVal = String(a[sortField] ?? '')
      const bVal = String(b[sortField] ?? '')

      if (sortField === 'rowCount') {
        const aNum = Number(a.rowCount) || 0
        const bNum = Number(b.rowCount) || 0
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }

      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    })
  }, [sqlTableList, search, sortField, sortDirection])

  // ── Helpers ──
  const getSqlContext = () => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) {
      throw new Error('SQL connection is required')
    }
    const databaseName = queryDatabase || selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? querySchema || selectedSchema || 'public'
        : databaseName ?? ''
    if (!databaseName) throw new Error('Database context is missing')
    return { connection: selectedConnection, databaseName, schemaName }
  }

  const refreshTableList = async () => {
    const { connection, databaseName, schemaName } = getSqlContext()
    await fetchSqlTableList(connection, databaseName, connection.type === 'postgresql' ? schemaName : undefined)
    await fetchDatabaseDetails(connection.id, connection, databaseName)
  }

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
    return <span className="ml-1 text-text-muted">{sortDirection === 'asc' ? '▲' : '▼'}</span>
  }

  // ── Selection ──
  const handleRowSelection = (tableName: string) => {
    setSelectedTableName((prev) => (prev === tableName ? null : tableName))
    setShowEditForm(false)
    setActionError(null)
  }

  const resetInlineForms = () => {
    setShowEditForm(false)
    setNextTableName('')
  }

  // ── Designer integration (separate window) ──
  const handleOpenDesignerForEdit = async (tableName: string) => {
    const { connection, databaseName, schemaName } = getSqlContext()
    const payload = { ...(await getConnPayloadWithPassword(connection)), database: databaseName }
    await openDesignerWindow(
      { mode: 'edit', schema: schemaName, database: databaseName, connectionPayload: payload, tableName },
      async () => {
        await refreshTableList()
      },
    )
  }

  const handleCreateInDesigner = async () => {
    const { connection, databaseName, schemaName } = getSqlContext()
    if (!databaseName) return
    const payload = { ...(await getConnPayloadWithPassword(connection)), database: databaseName }
    await openDesignerWindow(
      { mode: 'create', schema: schemaName, database: databaseName, connectionPayload: payload },
      async () => {
        await refreshTableList()
      },
    )
  }

  // ── CRUD handlers ──
  const handleEditTable = async () => {
    if (!selectedTableName) return
    const trimmedNext = nextTableName.trim()
    if (!trimmedNext) {
      setActionError('New table name is required')
      return
    }

    setActionLoading(true)
    setActionError(null)
    try {
      const { connection, databaseName, schemaName } = getSqlContext()
      const payload = { ...(await getConnPayloadWithPassword(connection)), database: databaseName }
      const sql =
        connection.type === 'postgresql'
          ? `ALTER TABLE ${quoteIdentifier(schemaName, '"')}.${quoteIdentifier(selectedTableName, '"')} RENAME TO ${quoteIdentifier(trimmedNext, '"')}`
          : `RENAME TABLE ${quoteIdentifier(selectedTableName, '`')} TO ${quoteIdentifier(trimmedNext, '`')}`
      await executeSql({ connection: payload, sql })
      await refreshTableList()
      setSelectedTableName(trimmedNext)
      resetInlineForms()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setActionLoading(false)
    }
  }

  const handleRequestDelete = () => {
    if (!selectedTableName) return
    handleRequestDeleteTable(selectedTableName)
  }

  // ── Navigate to table detail ──
  const handleRowDoubleClick = (tableName: string) => {
    navigate(`/sql/${connectionId}/tables/${encodeURIComponent(tableName)}`)
    const db = selectedDatabase || queryDatabase || selectedConnection?.database
    const schema = selectedConnection?.type === 'postgresql' ? (selectedSchema || querySchema || 'public') : undefined
    const tablePath = schema ? `${db}/${schema}/Tables/${tableName}` : `${db}/Tables/${tableName}`
    wrappedHandleTreeNodeClick(
      tableName,
      db,
      tablePath,
    )
  }

  // ── Render ──
  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-base"
      onClick={() => {
        if (selectedTableName) {
          setSelectedTableName(null)
          setShowEditForm(false)
          setActionError(null)
        }
      }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 border-b border-border-default px-1.5 py-1.5">
        <div className="inline-flex items-center gap-1">
          <ActionButton
            icon={<CirclePlus size={14} />}
            aria-label="New Table"
            variant="accent"
            onClick={() => handleCreateInDesigner()}
          />
          <ActionButton
            icon={<Columns3Cog size={14} />}
            aria-label="Design Table"
            variant="secondary"
            disabled={!selectedTableName}
            onClick={() => {
              if (selectedTableName) void handleOpenDesignerForEdit(selectedTableName)
            }}
          />
          <ActionButton
            icon={<Trash2 size={14} />}
            aria-label="Delete"
            variant="danger"
            disabled={!selectedTableName}
            onClick={() => {
              handleRequestDelete()
              setShowEditForm(false)
              setActionError(null)
            }}
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* View mode toggle */}
          <div className="inline-flex h-7 items-center rounded-md border border-border-default bg-bg-subtle p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('detail')}
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
              onClick={() => setViewMode('er-diagram')}
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
              onChange={(event) => setSearch(event.target.value)}
              className="h-7 w-64 rounded-md border border-border-default bg-bg-base pl-7 pr-2.5 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Inline edit form ── */}
      {showEditForm && selectedTableName && (
        <div
          className="flex items-center gap-2 border-b border-border-default bg-bg-subtle px-3 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="shrink-0 text-label text-text-secondary">Rename:</span>
          <span className="shrink-0 rounded bg-bg-muted px-1.5 py-0.5 text-mono text-text-primary">
            {selectedTableName}
          </span>
          <span className="shrink-0 text-caption text-text-muted">to</span>
          <input
            type="text"
            placeholder="New table name"
            value={nextTableName}
            onChange={(event) => setNextTableName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleEditTable()
            }}
            className="w-56 rounded-md border border-border-default bg-bg-base px-2.5 py-1 text-label text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleEditTable()}
            disabled={actionLoading}
            className="rounded bg-primary px-2.5 py-1 text-label text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEditForm(false)
              setNextTableName('')
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
      {sqlTableListLoading && (
        <CenteredLoadingState loading={sqlTableListLoading} label="Loading tables..." />
      )}

      {!sqlTableListLoading && viewMode === 'er-diagram' && (
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <ERDiagramViewer
              rows={filteredRows as SqlTableListItem[]}
              searchQuery={search}
              foreignKeys={(schemaForeignKeys ?? []) as SchemaForeignKey[]}
              columns={(schemaColumns ?? []) as SchemaColumn[]}
              onSelectTable={(tableName) => handleRowSelection(tableName)}
            />
          </ReactFlowProvider>
        </div>
      )}

      {!sqlTableListLoading && viewMode === 'detail' && (
        <div
          className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-border-default [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-bg-muted [&::-webkit-scrollbar-track]:bg-bg-subtle"
          onClick={(e) => e.stopPropagation()}
        >
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-10 bg-bg-subtle shadow-[0_1px_0_0_var(--color-border-default)]">
              <tr className="text-left text-text-secondary">
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  onClick={() => toggleSort('tableName')}
                >
                  Table Name {sortIndicator('tableName')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  style={{ width: 90 }}
                  onClick={() => toggleSort('oid')}
                >
                  OID {sortIndicator('oid')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  style={{ width: 150 }}
                  onClick={() => toggleSort('owner')}
                >
                  Owner {sortIndicator('owner')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
                  style={{ width: 150 }}
                  onClick={() => toggleSort('tableType')}
                >
                  Table Type {sortIndicator('tableType')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap border-b border-border-default px-2 py-1.5 text-right text-label text-text-primary"
                  style={{ width: 120 }}
                  onClick={() => toggleSort('rowCount')}
                >
                  Rows {sortIndicator('rowCount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-text-muted">
                    No tables found
                  </td>
                </tr>
              )}
              {filteredRows.map((row) => {
                const isSelected = selectedTableName === row.tableName
                return (
                  <tr
                    key={row.tableName}
                    className={[
                      'cursor-pointer text-text-primary even:bg-bg-subtle/50 hover:bg-primary-subtle/40',
                      isSelected ? 'bg-primary-subtle/70! even:bg-primary-subtle/70!' : '',
                    ].join(' ')}
                    onClick={() => handleRowSelection(row.tableName)}
                    onDoubleClick={() => handleRowDoubleClick(row.tableName)}
                  >
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          handleRowDoubleClick(row.tableName)
                        }}
                        className="text-mono text-primary hover:text-primary-hover hover:underline"
                      >
                        {row.tableName}
                      </button>
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-mono">
                      {row.oid}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      {row.owner}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                      {row.tableType}
                    </td>
                    <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-border-default px-2 py-1.5 text-right text-mono">
                      {row.rowCount}
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
