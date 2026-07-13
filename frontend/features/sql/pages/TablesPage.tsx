import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ERDiagramViewer } from '../components/shared/ERDiagramViewer'
import { openDesignerWindow } from '../services/designerWindowService'
import { executeSql } from '../clients/sql'
import {
  getConnPayloadWithPassword,
  isSqlConnectionType,
  quoteIdentifier,
} from '../../_shared/utils'
import type { SqlTableListItem } from '../../_shared/types/shared'
import type { SchemaColumn, SchemaForeignKey } from '../types/sql'

// Import subcomponents
import { TablesToolbar } from '../components/tables-list/TablesToolbar'
import { TableRenameForm } from '../components/tables-list/TableRenameForm'
import {
  TablesListView,
  type SortField,
  type SortDirection,
} from '../components/tables-list/TablesListView'

type ViewMode = 'detail' | 'er-diagram'

export function TablesPage() {
  const { connectionId } = useParams<{ connectionId: string }>()
  const navigate = useNavigate()

  const {
    selectedConnection,
    groupedConnections,
    explorerData: {
      sqlTableList,
      sqlTableListLoading,
      schemaForeignKeys,
      schemaColumns,
      selectedDatabase,
      selectedSchema,
      fetchSqlTableList,
      fetchDatabaseDetails,
    },
    queryExecution: { queryDatabase, querySchema },
    handleRequestDeleteTable,
    wrappedHandleTreeNodeClick,
  } = useDataExplorerContext()

  // ── State ──
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('tableName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedTableName, setSelectedTableName] = useState<string | null>(
    null,
  )
  const [showEditForm, setShowEditForm] = useState(false)
  const [nextTableName, setNextTableName] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('detail')

  // ── Derived data ──
  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const searched = normalizedSearch
      ? sqlTableList.filter(
          (row) =>
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
    const databaseName =
      queryDatabase || selectedDatabase || selectedConnection.database
    const schemaName =
      selectedConnection.type === 'postgresql'
        ? querySchema || selectedSchema || 'public'
        : (databaseName ?? '')
    if (!databaseName) throw new Error('Database context is missing')
    return { connection: selectedConnection, databaseName, schemaName }
  }

  const refreshTableList = async () => {
    const { connection, databaseName, schemaName } = getSqlContext()
    await fetchSqlTableList(
      connection,
      databaseName,
      connection.type === 'postgresql' ? schemaName : undefined,
    )
    await fetchDatabaseDetails(connection.id, connection, databaseName)
  }

  // ── Sort helpers ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection('asc')
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
    const payload = {
      ...(await getConnPayloadWithPassword(connection)),
      database: databaseName,
    }
    await openDesignerWindow(
      {
        mode: 'edit',
        schema: schemaName,
        database: databaseName,
        connectionPayload: payload,
        tableName,
      },
      async () => {
        await refreshTableList()
      },
    )
  }

  const handleCreateInDesigner = async () => {
    const { connection, databaseName, schemaName } = getSqlContext()
    if (!databaseName) return
    const payload = {
      ...(await getConnPayloadWithPassword(connection)),
      database: databaseName,
    }
    await openDesignerWindow(
      {
        mode: 'create',
        schema: schemaName,
        database: databaseName,
        connectionPayload: payload,
      },
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
      const payload = {
        ...(await getConnPayloadWithPassword(connection)),
        database: databaseName,
      }
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
    const schema =
      selectedConnection?.type === 'postgresql'
        ? selectedSchema || querySchema || 'public'
        : undefined

    // Find the group name for this connection
    const groupName =
      selectedConnection && groupedConnections
        ? Object.entries(groupedConnections).find(([, profiles]) =>
            profiles.some((p) => p.id === selectedConnection.id),
          )?.[0]
        : undefined

    // Build full tree path: groupName/connectionName/db/schema/Tables/tableName
    const parts = []
    if (groupName && selectedConnection) {
      parts.push(groupName, selectedConnection.name)
    }
    if (db) parts.push(db)
    if (schema) parts.push(schema)
    parts.push('Tables', tableName)
    const tablePath = parts.join('/')

    wrappedHandleTreeNodeClick(tableName, db, tablePath)
  }

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
      {/* Toolbar */}
      <TablesToolbar
        selectedTableName={selectedTableName}
        viewMode={viewMode}
        search={search}
        onNewTable={handleCreateInDesigner}
        onDesignTable={() => {
          if (selectedTableName) {
            void handleOpenDesignerForEdit(selectedTableName)
          }
        }}
        onDeleteTable={() => {
          handleRequestDelete()
          setShowEditForm(false)
          setActionError(null)
        }}
        onViewModeChange={setViewMode}
        onSearchChange={setSearch}
      />

      {/* Inline edit form */}
      {showEditForm && selectedTableName && (
        <TableRenameForm
          tableName={selectedTableName}
          value={nextTableName}
          onChange={setNextTableName}
          onSave={() => void handleEditTable()}
          onCancel={() => {
            setShowEditForm(false)
            setNextTableName('')
            setActionError(null)
          }}
          disabled={actionLoading}
        />
      )}

      {/* Error banner */}
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

      {/* Content */}
      {sqlTableListLoading && (
        <CenteredLoadingState
          loading={sqlTableListLoading}
          label="Loading tables..."
        />
      )}

      {!sqlTableListLoading && viewMode === 'er-diagram' && (
        <div className="flex-1 min-h-0">
          <ReactFlowProvider>
            <ERDiagramViewer
              rows={filteredRows as SqlTableListItem[]}
              searchQuery={search}
              foreignKeys={(schemaForeignKeys ?? []) as SchemaForeignKey[]}
              columns={(schemaColumns ?? []) as SchemaColumn[]}
              onSelectTable={handleRowSelection}
            />
          </ReactFlowProvider>
        </div>
      )}

      {!sqlTableListLoading && viewMode === 'detail' && (
        <TablesListView
          rows={filteredRows}
          sortField={sortField}
          sortDirection={sortDirection}
          selectedTableName={selectedTableName}
          onSort={handleSort}
          onRowSelect={handleRowSelection}
          onRowDoubleClick={handleRowDoubleClick}
        />
      )}
    </section>
  )
}
