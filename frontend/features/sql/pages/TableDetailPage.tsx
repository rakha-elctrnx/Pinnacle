import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  CirclePlus,
  Download,
  Filter,
  Keyboard,
  Key,
  Redo2,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { useTabStore } from '../../_shared/store/tabStore'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import {
  useColumnResizer,
  calculateAutoColumnWidths,
} from '../hooks/useColumnResizer'
import { useCommitTableChanges } from '../hooks/useCommitTableChanges'
import { useTableKeyboard } from '../hooks/useTableKeyboard'
import {
  useTableEditStore,
  pendingChangeCount,
  resetInsertCounter,
  canUndo,
  canRedo,
} from '../store/tableEditStore'
import { useTableSelectionStore, cellKey } from '../store/tableSelectionStore'
import type { EditableColumnMeta } from '../store/tableEditStore'
import { EditableCell } from '../components/table-cells/EditableCell'
import { ConfirmDialog } from '../components/table-cells/ConfirmDialog'
import { ShortcutCheatsheet } from '../components/table-cells/ShortcutCheatsheet'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import { GridContextMenu } from '../components/GridContextMenu'
import { RowDetailDrawer } from '../components/table-cells/RowDetailDrawer'
import { Dropdown } from '../../_shared/components/ui/Dropdown'
import { GenerateSqlModal } from '../components/GenerateSqlModal'
import {
  formatTSV,
  formatTSVWithHeaders,
  formatCSVWithHeaders,
  formatJSON,
  generateInsertSQL,
  generateReviewSQL,
  parseTSV,
  mapPasteToColumns,
  copyToClipboard,
  readFromClipboard,
} from '../utils/clipboard'

/**
 * TableDetailPage — the table viewer for an individual SQL table.
 *
 * Route: `/sql/:connectionId/tables/:tableName`
 *
 * Responsibilities:
 * - Loads table data on mount via `explorerData.handleTreeNodeClick(tableName)`.
 * - Uses TanStack Table as a headless row/column model.
 * - Renders Pinnacle-owned table markup and token styling.
 * - Column resizing is handled by the `useColumnResizer` hook.
 * - Cell editing staged via `useTableEditStore` (task 011b).
 */

// ── Constants ────────────────────────────────────────────────────────────────

const ROW_GUTTER_WIDTH = 36
const MIN_COLUMN_WIDTH = 80
const MAX_COLUMN_WIDTH = 360
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ── Types ───────────────────────────────────────────────────────────────────

type TableRow = Record<string, unknown>

type ColumnMetadata = {
  columnName: string
  dataType?: string
  isPrimaryKey?: boolean
  primaryKey?: boolean
  columnKey?: string
}

// ── Filter Types ─────────────────────────────────────────────────────────────

type FilterOperator =
  | '='
  | '!='
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'is_null'
  | 'is_not_null'
  | 'in'

type FilterCondition = {
  column: string
  operator: FilterOperator
  value: string
}
// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build SQL WHERE condition from a filter condition.
 * Handles column escaping, value quoting, and operator translation for Postgres/MySQL.
 */
function buildSqlForCondition(
  cond: FilterCondition,
  dbType: 'postgresql' | 'mysql',
  columnsMeta: ColumnMetadata[],
): string {
  const { column, operator, value } = cond

  // Find column metadata for type information
  const columnMeta = columnsMeta.find((col) => col.columnName === column)
  const columnType = columnMeta?.dataType?.toLowerCase() || ''

  // Determine if this is a numeric column
  const numericTypes = [
    'int',
    'integer',
    'bigint',
    'smallint',
    'serial',
    'bigserial',
    'decimal',
    'numeric',
    'float',
    'double',
    'real',
  ]
  const isNumeric = numericTypes.some((type) => columnType.includes(type))

  // Escape column identifier based on database type
  const escapeColumn = (col: string) => {
    if (dbType === 'postgresql') {
      return `"${col.replace(/"/g, '""')}"`
    } else {
      return `\`${col.replace(/`/g, '``')}\``
    }
  }

  // Escape string values and handle special operators
  const escapeValue = (val: string) => {
    if (isNumeric && !isNaN(Number(val))) {
      return val // Return as-is for numeric values
    }
    // Escape single quotes by doubling them
    return `'${val.replace(/'/g, "''")}'`
  }

  const escapedColumn = escapeColumn(column)

  switch (operator) {
    case '=':
      return `${escapedColumn} = ${escapeValue(value)}`
    case '!=':
      return `${escapedColumn} != ${escapeValue(value)}`
    case 'contains':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`%${value}%`)}`
        : `${escapedColumn} LIKE ${escapeValue(`%${value}%`)}`
    case 'starts_with':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`${value}%`)}`
        : `${escapedColumn} LIKE ${escapeValue(`${value}%`)}`
    case 'ends_with':
      return dbType === 'postgresql'
        ? `${escapedColumn} ILIKE ${escapeValue(`%${value}`)}`
        : `${escapedColumn} LIKE ${escapeValue(`%${value}`)}`
    case '>':
      return `${escapedColumn} > ${escapeValue(value)}`
    case '>=':
      return `${escapedColumn} >= ${escapeValue(value)}`
    case '<':
      return `${escapedColumn} < ${escapeValue(value)}`
    case '<=':
      return `${escapedColumn} <= ${escapeValue(value)}`
    case 'is_null':
      return `${escapedColumn} IS NULL`
    case 'is_not_null':
      return `${escapedColumn} IS NOT NULL`
    case 'in': {
      // Parse comma-separated values for IN clause
      const values = value
        .split(',')
        .map((v) => escapeValue(v.trim()))
        .join(', ')
      return `${escapedColumn} IN (${values})`
    }
    default:
      return `${escapedColumn} = ${escapeValue(value)}`
  }
}

/**
 * Build complete WHERE clause from multiple filter conditions.
 * Joins conditions with AND.
 */
function buildWhereClause(
  filters: FilterCondition[],
  dbType: 'postgresql' | 'mysql',
  columnsMeta: ColumnMetadata[],
): string {
  if (filters.length === 0) return ''

  const conditions = filters.map((cond) =>
    buildSqlForCondition(cond, dbType, columnsMeta),
  )
  return conditions.join(' AND ')
}
/**
 * Build ORDER BY clause from sort state.
 * Escapes column identifiers for Postgres (double-quotes) or MySQL (backticks).
 */
function buildOrderByClause(
  column: string | null,
  direction: 'asc' | 'desc',
  dbType: 'postgresql' | 'mysql',
): string {
  if (!column) return ''

  const escapeColumn = (col: string) => {
    if (dbType === 'postgresql') {
      return `"${col.replace(/"/g, '""')}"`
    } else {
      return `\`${col.replace(/`/g, '``')}\``
    }
  }

  return `${escapeColumn(column)} ${direction.toUpperCase()}`
}

function isPrimaryKeyColumn(metadata: ColumnMetadata | undefined): boolean {
  return Boolean(
    metadata?.isPrimaryKey === true ||
    metadata?.primaryKey === true ||
    metadata?.columnKey?.toUpperCase() === 'PRI',
  )
}

function getPinnedLeftOffset(
  columnIndex: number,
  columns: string[],
  widths: number[],
  metadata: ColumnMetadata[],
): number | null {
  const currentColumn = columns[columnIndex]
  const currentMetadata = metadata.find(
    (column) => column.columnName === currentColumn,
  )

  if (!isPrimaryKeyColumn(currentMetadata)) return null

  return columns.slice(0, columnIndex).reduce((offset, column, index) => {
    const columnMetadata = metadata.find((item) => item.columnName === column)
    return isPrimaryKeyColumn(columnMetadata)
      ? offset + (widths[index] ?? MIN_COLUMN_WIDTH)
      : offset
  }, ROW_GUTTER_WIDTH)
}

/** Build a stable row ID: try first PK column, fall back to `${tableName}-${index}`. */
function buildRowId(
  row: TableRow,
  index: number,
  tableName: string | undefined,
  pkColumn?: string,
): string {
  // Insert rows carry a synthetic __rowId — return it directly
  // to guarantee uniqueness and avoid collision with persistent row IDs.
  const candidateId = (row as Record<string, unknown>)['__rowId']
  if (typeof candidateId === 'string' && candidateId.startsWith('__insert__')) {
    return candidateId
  }

  if (pkColumn) {
    const pkValue = row[pkColumn]
    if (pkValue != null && pkValue !== '') {
      return `${tableName ?? 'tbl'}-${String(pkValue)}`
    }
  }
  return `${tableName ?? 'tbl'}-${index}`
}

// ── Page component ───────────────────────────────────────────────────────────

export function TableDetailPage() {
  const { connectionId, tableName } = useParams<{
    connectionId: string
    tableName: string
  }>()

  // ── Context ──────────────────────────────────────────────────────────────
  const {
    explorerData: {
      handleTreeNodeClick,
      realTableColumns,
      realTableRows,
      realTableIndexes,
      selectedSchema,
      selectedDatabase,
      tableDataLoading,
      schemaColumnsByTable,
      totalRowCount,
    },
    selectedConnection,
    setSelectedTreeNode,
  } = useDataExplorerContext()

  // ── Edit store ──────────────────────────────────────────────────────────
  const stageEdit = useTableEditStore((s) => s.stageEdit)
  const stageInsert = useTableEditStore((s) => s.stageInsert)
  const stageDelete = useTableEditStore((s) => s.stageDelete)
  const clearAll = useTableEditStore((s) => s.clearAll)
  const undo = useTableEditStore((s) => s.undo)
  const redo = useTableEditStore((s) => s.redo)
  const pendingEdits = useTableEditStore((s) => s.pendingEdits)
  const pendingInserts = useTableEditStore((s) => s.pendingInserts)
  const pendingDeletes = useTableEditStore((s) => s.pendingDeletes)
  const totalPending = useTableEditStore((s) => pendingChangeCount(s))
  const undoAvailable = useTableEditStore((s) => canUndo(s))
  const redoAvailable = useTableEditStore((s) => canRedo(s))

  // ── Selection store ────────────────────────────────────────────────
  const activeCell = useTableSelectionStore((s) => s.activeCell)
  const selectedCells = useTableSelectionStore((s) => s.selectedCells)
  const selectSingle = useTableSelectionStore((s) => s.selectSingle)
  const toggleCell = useTableSelectionStore((s) => s.toggleCell)
  const selectRow = useTableSelectionStore((s) => s.selectRow)
  const toggleRow = useTableSelectionStore((s) => s.toggleRow)
  const selectRange = useTableSelectionStore((s) => s.selectRange)
  const resetSelection = useTableSelectionStore((s) => s.reset)

  // ── Local state ────────────────────────────────────────────────────
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false)
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [detailDrawerRow, setDetailDrawerRow] = useState<{
    row: Record<string, unknown>
    rowIndex: number
  } | null>(null)
  // Toast: { kind, message } or null. Announced via aria-live region.
  const [toast, setToast] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  // Track drag state for range selection
  const isDraggingRef = useRef(false)
  const dragAnchorRef = useRef<{ rowIndex: number; columnId: string } | null>(
    null,
  )
  const valueInputRef = useRef<HTMLInputElement>(null)

  // ── Pagination state (server-side) ────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [appliedWhereClause, setAppliedWhereClause] = useState<string>('')
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(false)
  const [newFilter, setNewFilter] = useState<Partial<FilterCondition>>({
    column: '',
    operator: '=',
    value: '',
  })

  // ── Sort state ─────────────────────────────────────────────────────────────
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [appliedOrderByClause, setAppliedOrderByClause] = useState<string>('')

  // ── Detect the first primary key column for row ID stability ────────────
  const tableColumnsMeta = useMemo<ColumnMetadata[]>(() => {
    if (!tableName || !schemaColumnsByTable) return []
    return schemaColumnsByTable[tableName] || []
  }, [tableName, schemaColumnsByTable])

  // ── Filter handler functions (auto-apply) ─────────────────────────────────
  const handleAddFilter = useCallback(() => {
    if (!newFilter.column || !newFilter.operator) return
    const isNullOp = ['is_null', 'is_not_null'].includes(newFilter.operator)
    if (!isNullOp && !newFilter.value) return

    const next = [
      ...filters,
      {
        column: newFilter.column,
        operator: newFilter.operator as FilterOperator,
        value: (isNullOp ? '' : newFilter.value) ?? '',
      },
    ]
    setFilters(next)
    setNewFilter({ column: '', operator: '=', value: '' })

    const dbType = selectedConnection?.type as 'postgresql' | 'mysql'
    if (dbType && ['postgresql', 'mysql'].includes(dbType) && tableName) {
      const whereClause = buildWhereClause(next, dbType, tableColumnsMeta)
      setAppliedWhereClause(whereClause)
    }
  }, [filters, newFilter, selectedConnection, tableColumnsMeta, tableName])

  const handleUpdateFilter = useCallback(
    (index: number, patch: Partial<FilterCondition>) => {
      const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f))
      setFilters(next)

      const dbType = selectedConnection?.type as 'postgresql' | 'mysql'
      if (dbType && ['postgresql', 'mysql'].includes(dbType) && tableName) {
        const whereClause = buildWhereClause(next, dbType, tableColumnsMeta)
        setAppliedWhereClause(whereClause)
      }
    },
    [filters, selectedConnection, tableColumnsMeta, tableName],
  )

  const handleRemoveFilter = useCallback(
    (index: number) => {
      const next = filters.filter((_, i) => i !== index)
      setFilters(next)

      const dbType = selectedConnection?.type as 'postgresql' | 'mysql'
      if (dbType && ['postgresql', 'mysql'].includes(dbType) && tableName) {
        const whereClause =
          next.length > 0
            ? buildWhereClause(next, dbType, tableColumnsMeta)
            : ''
        setAppliedWhereClause(whereClause)
      }
    },
    [filters, selectedConnection, tableColumnsMeta, tableName],
  )

  const handleClearAllFilters = useCallback(() => {
    setFilters([])
    setNewFilter({ column: '', operator: '=', value: '' })
    setAppliedWhereClause('')
    setSortColumn(null)
    setSortDirection('asc')
    setAppliedOrderByClause('')
  }, [])

  const handleSortColumn = useCallback(
    (column: string) => {
      let nextDirection: 'asc' | 'desc' = 'asc'

      if (sortColumn === column) {
        // Clicking the same column toggles direction: asc → desc → null
        if (sortDirection === 'asc') {
          nextDirection = 'desc'
        } else {
          // Third click clears sort
          setSortColumn(null)
          setSortDirection('asc')
          setAppliedOrderByClause('')
          return
        }
      }

      setSortColumn(column)
      setSortDirection(nextDirection)

      const dbType = selectedConnection?.type as 'postgresql' | 'mysql'
      if (dbType && ['postgresql', 'mysql'].includes(dbType)) {
        const orderByClause = buildOrderByClause(column, nextDirection, dbType)
        setAppliedOrderByClause(orderByClause)
      }
    },
    [sortColumn, sortDirection, selectedConnection],
  )

  const handleColumnFilterClick = useCallback((column: string) => {
    setFilterPanelOpen(true)
    setNewFilter((nf) => ({ ...nf, column }))
    setTimeout(() => valueInputRef.current?.focus(), 50)
  }, [])

  // Primary key is derived from `realTableIndexes` (already fetched per-table
  // in fetchTableData, populated for both PG and MySQL). `schemaColumnsByTable`
  // does NOT carry PK info — `sql_get_all_columns` only reads column_name/
  // data_type/nullability/default, so the prior hasPrimaryKey check was always
  // false. The first column of the first primary index is the PK column.
  // ponytail: composite-PK ceiling — only the first PK column is used for row
  // identity; upgrade to a join on all PK columns when composite-PK commit is in.
  const pkColumn = useMemo<string | undefined>(() => {
    const pkIndex = realTableIndexes.find(
      (idx) => idx.isPrimary && idx.tableName === tableName,
    )
    return pkIndex?.columnName[0]
  }, [realTableIndexes, tableName])

  // True when the table has at least one primary-key column. Without a PK,
  // commit is disabled because UPDATE/DELETE cannot target rows safely.
  const hasPrimaryKey = pkColumn !== undefined

  // ── Build column metadata map for validation ──────────────────────────
  const editableColumnMetaMap = useMemo<
    Record<string, EditableColumnMeta>
  >(() => {
    const map: Record<string, EditableColumnMeta> = {}
    for (const col of tableColumnsMeta) {
      map[col.columnName] = {
        columnName: col.columnName,
        dataType: col.dataType ?? '',
        isNullable: true, // default to nullable; SchemaColumn has isNullable
        maxLength: null,
      }
    }
    return map
  }, [tableColumnsMeta])
  // ── Helper to generate type-aware default values for new rows ──────────────

  /**
   * Generate appropriate default value for a column based on its SQL data type.
   * Matches the type handling in validateCellValue.
   */
  function getDefaultValueForType(dataType: string | undefined): unknown {
    if (!dataType) return ''

    const dt = dataType.toUpperCase()

    // Boolean types
    if (dt === 'BOOLEAN' || dt === 'BOOL') {
      return false // Default to false for boolean columns
    }

    // Numeric types
    if (
      dt.includes('INT') ||
      dt === 'SERIAL' ||
      dt === 'BIGSERIAL' ||
      dt === 'SMALLINT' ||
      dt === 'BIGINT'
    ) {
      return 0
    }

    if (
      dt === 'FLOAT' ||
      dt === 'REAL' ||
      dt === 'DOUBLE' ||
      dt === 'NUMERIC' ||
      dt === 'DECIMAL'
    ) {
      return 0
    }

    // UUID - empty string is valid, will be generated by DB on insert if DEFAULT is set
    if (dt === 'UUID') {
      return ''
    }

    // Date/Time types
    if (
      dt.includes('DATE') ||
      dt.includes('TIME') ||
      dt.includes('TIMESTAMP') ||
      dt === 'DATETIME'
    ) {
      return null // Let DB handle with DEFAULT CURRENT_TIMESTAMP or similar
    }

    // JSON types
    if (dt === 'JSON' || dt === 'JSONB') {
      return null
    }

    // Default: empty string for text and other types
    return ''
  }

  // ── Trigger data load when URL param changes ─────────────────────────────
  useEffect(() => {
    if (tableName) {
      handleTreeNodeClick(
        tableName,
        undefined,
        page,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
      )
    }
  }, [tableName, handleTreeNodeClick, appliedWhereClause, appliedOrderByClause])

  // Sync selectedTreeNode so the Footer breadcrumb updates correctly on
  // direct URL navigation and tab switch. Uses the full tree path stored
  // in the active tab when available, falls back to a partial path.
  useEffect(() => {
    if (!tableName || !selectedConnection) return
    const activeTab = useTabStore
      .getState()
      .tabs.find(
        (t) =>
          t.connectionId === selectedConnection.id &&
          t.pageType === 'table' &&
          t.label === tableName,
      )
    if (activeTab?.treePath) {
      setSelectedTreeNode(activeTab.treePath)
      return
    }
    const db = selectedDatabase || selectedConnection.database
    const schema =
      selectedConnection.type === 'postgresql'
        ? selectedSchema || 'public'
        : db || ''
    const path = [db, schema, 'Tables', tableName].filter(Boolean).join('/')
    setSelectedTreeNode(path)
  }, [
    tableName,
    selectedConnection,
    selectedDatabase,
    selectedSchema,
    setSelectedTreeNode,
  ])

  // Reset active row and clear edit store when table changes.
  useEffect(() => {
    queueMicrotask(() => {
      resetSelection()
    })
    clearAll()
    resetInsertCounter()
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
    setFilters([])
    setNewFilter({ column: '', operator: '=', value: '' })
    setAppliedWhereClause('')
    setFilterPanelOpen(false)
    setSortColumn(null)
    setSortDirection('asc')
    setAppliedOrderByClause('')
  }, [tableName, clearAll, resetSelection])

  // Refetch data when page or pageSize changes (skip on mount — handled above).
  const prevPageRef = useRef(page)
  const prevPageSizeRef = useRef(pageSize)
  useEffect(() => {
    if (!tableName) return
    // Skip the initial mount — the first load is triggered by the tableName effect.
    if (prevPageRef.current === page && prevPageSizeRef.current === pageSize)
      return
    prevPageRef.current = page
    prevPageSizeRef.current = pageSize
    handleTreeNodeClick(
      tableName,
      undefined,
      page,
      pageSize,
      appliedWhereClause,
      appliedOrderByClause,
    )
  }, [
    tableName,
    page,
    pageSize,
    handleTreeNodeClick,
    appliedWhereClause,
    appliedOrderByClause,
  ])
  // Track previous realTableRows to reset page when data is fully reloaded
  // (not just a page fetch). Compare reference — new fetch always creates a new array.
  const prevRealTableRowsRef = useRef(realTableRows)
  useEffect(() => {
    if (realTableRows !== prevRealTableRowsRef.current) {
      prevRealTableRowsRef.current = realTableRows
    }
  }, [realTableRows])

  // Sync pending change count to the tab badge in TabBar.
  const tabId = `${connectionId}:table:${tableName}`
  useEffect(() => {
    useTabStore.getState().setTabPendingCount(tabId, totalPending)
  }, [tabId, totalPending])

  // Auto-dismiss success toasts after 4s. Errors persist until dismissed.
  useEffect(() => {
    if (!toast || toast.kind !== 'success') return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // `?` toggles the shortcut cheatsheet (ignored while typing in inputs/textarea).
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((open) => !open)
      }
    }
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [])

  // Restore focus to the active cell after commit/revert/undo/redo.
  const restoreActiveCellFocus = useCallback(() => {
    const pos = useTableSelectionStore.getState().activeCell
    if (!pos) return
    requestAnimationFrame(() => {
      const cell = document.querySelector(
        `[data-cell-row="${pos.rowIndex}"][data-cell-col="${pos.columnId}"]`,
      ) as HTMLElement | null
      cell?.focus()
    })
  }, [])

  // ── Build the data array: real rows (minus staged deletes) + staged inserts ──
  const displayRows = useMemo<TableRow[]>(() => {
    const filtered = realTableRows.filter((_row, index) => {
      const rowId = buildRowId(_row, index, tableName, pkColumn)
      return !pendingDeletes.includes(rowId)
    })
    return [...filtered, ...pendingInserts]
  }, [realTableRows, pendingDeletes, pendingInserts, tableName, pkColumn])

  // ── Column widths ─────────────────────────────────────────────────────────
  const autoColumnWidths = useMemo(
    () =>
      calculateAutoColumnWidths({
        columns: realTableColumns,
        previewRows: displayRows,
        columnsMetadata: tableColumnsMeta.map((column) => ({
          columnName: column.columnName,
          dataType: column.dataType ?? '',
        })),
      }),
    [realTableColumns, displayRows, tableColumnsMeta],
  )

  const { widths, onMouseDown, syncWidths, handleDoubleClick } =
    useColumnResizer({
      initialWidths: autoColumnWidths,
    })

  const boundedWidths = useMemo(
    () =>
      widths.map((width) =>
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)),
      ),
    [widths],
  )

  const tableWidth = useMemo(
    () =>
      ROW_GUTTER_WIDTH +
      boundedWidths.reduce((total, width) => total + width, 0),
    [boundedWidths],
  )

  // Keep widths in sync with auto-sized values when data/columns change.
  useEffect(() => {
    syncWidths(autoColumnWidths)
  }, [tableName, autoColumnWidths, syncWidths])

  // ── TanStack Table model with editable cells ────────────────────────────
  const columns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      realTableColumns.map((column, columnIndex) => ({
        id: column,
        accessorKey: column,
        header: () => {
          const columnMetadata = tableColumnsMeta.find(
            (item) => item.columnName === column,
          )
          const dataType = columnMetadata?.dataType
          const isPrimaryKey = isPrimaryKeyColumn(columnMetadata)
          const hasActiveFilter = filters.some((f) => f.column === column)
          const isSorted = sortColumn === column
          return (
            <div className="group/hdr relative flex min-w-0 items-center overflow-hidden">
              {/* ── Column label — takes full width ── */}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
                onClick={() => handleSortColumn(column)}
              >
                {isPrimaryKey && (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10">
                    <Key size={10} className="text-primary" />
                  </span>
                )}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <span
                      className={`truncate text-xs leading-tight ${isSorted ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}`}
                    >
                      {column}
                    </span>
                    {/* Sort arrow — always visible when sorted, sits next to name */}
                    {isSorted &&
                      (sortDirection === 'asc' ? (
                        <ChevronUp
                          size={12}
                          className="shrink-0 text-primary"
                        />
                      ) : (
                        <ChevronDown
                          size={12}
                          className="shrink-0 text-primary"
                        />
                      ))}
                  </div>
                  {dataType && (
                    <span className="truncate text-[10px] leading-tight text-text-muted">
                      {dataType.toLowerCase()}
                    </span>
                  )}
                </div>
              </button>
              {/* ── Hover actions overlay — right-aligned, hidden by default ── */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-linear-to-l from-bg-muted from-60% to-transparent pr-1.5 pl-4 opacity-0 transition-opacity group-hover/hdr:pointer-events-auto group-hover/hdr:opacity-100">
                <button
                  type="button"
                  className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSortColumn(column)
                  }}
                  aria-label={
                    isSorted
                      ? `Sort ${sortDirection === 'asc' ? 'descending' : 'clear'}`
                      : `Sort by ${column}`
                  }
                >
                  {isSorted ? (
                    sortDirection === 'asc' ? (
                      <ChevronUp size={13} className="text-primary" />
                    ) : (
                      <ChevronDown size={13} className="text-primary" />
                    )
                  ) : (
                    <ArrowUpDown size={13} />
                  )}
                </button>
                <button
                  type="button"
                  className={`rounded p-1 transition-colors hover:bg-bg-hover ${
                    hasActiveFilter
                      ? 'text-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleColumnFilterClick(column)
                  }}
                  aria-label={
                    hasActiveFilter
                      ? `Filter active on ${column}`
                      : `Filter ${column}`
                  }
                >
                  <Filter size={13} />
                </button>
              </div>
              {/* ── Filter dot — tiny persistent indicator when filter is active ── */}
              {hasActiveFilter && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary group-hover/hdr:hidden" />
              )}
              {/* ── Resize handle ── */}
              <span
                role="separator"
                aria-label={`Resize ${column}`}
                className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/60"
                onMouseDown={(event) => onMouseDown(columnIndex, event)}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleDoubleClick(columnIndex, displayRows, column, dataType)
                }}
              />
            </div>
          )
        },
        cell: (context) => (
          <EditableCell
            context={context}
            columnMeta={editableColumnMetaMap[column]}
            getRowId={(_row, index) =>
              buildRowId(_row, index, tableName, pkColumn)
            }
          />
        ),
      })),
    [
      handleDoubleClick,
      onMouseDown,
      handleSortColumn,
      handleColumnFilterClick,
      sortColumn,
      sortDirection,
      filters,
      realTableColumns,
      tableColumnsMeta,
      editableColumnMetaMap,
      tableName,
      pkColumn,
    ],
  )

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_row, index) => buildRowId(_row, index, tableName, pkColumn),
  })

  // ── Keyboard navigation ────────────────────────────────────────────────
  const clearEditStateRef = useRef<() => void>(() => {})
  // Latest handleCommit reference for the keyboard callback (avoids stale closure).
  const handleCommitRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const handleCopyRef = useRef<(() => void) | undefined>(undefined)
  const handlePasteRef = useRef<(() => void) | undefined>(undefined)

  useTableKeyboard({
    containerRef: scrollContainerRef,
    columnIds: realTableColumns,
    rowCount: displayRows.length,
    onEnterEditMode: (pos) => {
      // Find the EditableCell at pos and trigger edit mode
      const cell = document.querySelector(
        `[data-cell-row="${pos.rowIndex}"][data-cell-col="${pos.columnId}"]`,
      )
      if (cell) {
        cell.dispatchEvent(
          new CustomEvent('table:enter-edit', { bubbles: true }),
        )
      }
    },
    onEscape: () => {
      clearEditStateRef.current?.()
    },
    onUndo: () => {
      undo()
      restoreActiveCellFocus()
    },
    onRedo: () => {
      redo()
      restoreActiveCellFocus()
    },
    onCommit: () => {
      void handleCommitRef.current?.()
    },
    onDelete: () => {
      handleDeleteRow()
      restoreActiveCellFocus()
    },
    onCopy: () => {
      handleCopyRef.current?.()
    },
    onPaste: () => {
      handlePasteRef.current?.()
    },
  })
  const handleCellMouseDown = useCallback(
    (rowIndex: number, columnId: string, e: React.MouseEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      if (isMeta) {
        toggleCell({ rowIndex, columnId })
        return
      }
      if (isShift && activeCell) {
        selectRange(activeCell, { rowIndex, columnId }, realTableColumns)
        return
      }

      // Start drag selection
      isDraggingRef.current = true
      dragAnchorRef.current = { rowIndex, columnId }
      selectSingle({ rowIndex, columnId })
    },
    [activeCell, toggleCell, selectRange, selectSingle, realTableColumns],
  )

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, columnId: string) => {
      if (!isDraggingRef.current || !dragAnchorRef.current) return
      selectRange(
        dragAnchorRef.current,
        { rowIndex, columnId },
        realTableColumns,
      )
    },
    [selectRange, realTableColumns],
  )

  const handleCellMouseUp = useCallback(() => {
    isDraggingRef.current = false
    dragAnchorRef.current = null
  }, [])

  // ── Gutter click handlers ──────────────────────────────────────────────
  const handleGutterMouseDown = useCallback(
    (rowIndex: number, e: React.MouseEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      if (isMeta) {
        toggleRow(rowIndex, realTableColumns)
        return
      }
      if (isShift && activeCell) {
        selectRange(
          activeCell,
          { rowIndex, columnId: activeCell.columnId },
          realTableColumns,
        )
        return
      }
      selectRow(rowIndex, realTableColumns)
    },
    [activeCell, toggleRow, selectRow, selectRange, realTableColumns],
  )

  // Register global mouseup to end drag selection
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false
      dragAnchorRef.current = null
    }
    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

  // ── Context menu state ──────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const [sqlModalOpen, setSqlModalOpen] = useState(false)
  const [generatedSql, setGeneratedSql] = useState('')
  // Track the context-row index for single-cell/row operations
  const contextRowIndexRef = useRef<number>(0)

  /**
   * Determine which rows are "selected" for context menu actions.
   * Uses the selection store: if cells are selected, return those rows;
   * otherwise fall back to the context-menu target row.
   */
  const getSelectedRows = useCallback((): Record<string, unknown>[] => {
    if (selectedCells.size > 0 && activeCell) {
      // Collect unique row indices from selected cells
      const rowIndices = new Set<number>()
      for (const key of selectedCells) {
        rowIndices.add(Number(key.split(':')[0]))
      }
      return [...rowIndices]
        .filter((i) => i >= 0 && i < displayRows.length)
        .sort((a, b) => a - b)
        .map((i) => displayRows[i])
    }
    // Fallback to context-menu target row
    return contextRowIndexRef.current >= 0 &&
      contextRowIndexRef.current < displayRows.length
      ? [displayRows[contextRowIndexRef.current]]
      : []
  }, [selectedCells, activeCell, displayRows])

  /**
   * Get the rowId for a given row. Uses the same stable ID logic
   * as the rest of the component.
   */
  const getSelectedRowIds = useCallback((): string[] => {
    const rows = getSelectedRows()
    return rows.map((row) => {
      const idx = displayRows.indexOf(row)
      return buildRowId(row, idx, tableName, pkColumn)
    })
  }, [getSelectedRows, displayRows, tableName, pkColumn])

  // ── Context menu action handlers ─────────────────────────────────────────

  /** Copy selected cell(s) as TSV */
  const handleContextCopy = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const tsv = formatTSV(rows, realTableColumns)
    await copyToClipboard(tsv)
  }, [getSelectedRows, realTableColumns])

  /** Copy selected cell(s) with header row */
  const handleContextCopyWithHeaders = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const tsv = formatTSVWithHeaders(rows, realTableColumns)
    await copyToClipboard(tsv)
  }, [getSelectedRows, realTableColumns])

  /** Copy selected rows as INSERT SQL */
  const handleContextCopyAsSQL = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const sql = generateInsertSQL(rows, realTableColumns, tableName ?? 'table')
    await copyToClipboard(sql)
  }, [getSelectedRows, realTableColumns, tableName])

  /** Copy selected rows as CSV */
  const handleContextCopyAsCSV = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const csv = formatCSVWithHeaders(rows, realTableColumns)
    await copyToClipboard(csv)
  }, [getSelectedRows, realTableColumns])

  /** Paste TSV from clipboard into the grid — replaces entire row(s) */
  const handleContextPaste = useCallback(async () => {
    const text = await readFromClipboard()
    if (!text) return
    const parsed = parseTSV(text)
    if (parsed.rows.length === 0) return

    const startRowIdx = contextRowIndexRef.current
    const mapped = mapPasteToColumns(parsed.rows, realTableColumns)

    // Stage each pasted row — replaces entire row (including empty values → null)
    for (let ri = 0; ri < mapped.length; ri++) {
      const targetIdx = startRowIdx + ri
      if (targetIdx >= displayRows.length) {
        // Beyond existing rows → create pending insert
        const template: Record<string, unknown> = { ...mapped[ri] }
        stageInsert(template)
      } else {
        const targetRow = displayRows[targetIdx]
        const rowId = buildRowId(targetRow, targetIdx, tableName, pkColumn)
        for (const col of realTableColumns) {
          const rawValue = mapped[ri][col] ?? ''
          const newValue = rawValue === '' ? null : rawValue
          const oldValue = targetRow[col]
          stageEdit(rowId, col, oldValue, newValue)
        }
      }
    }
  }, [
    displayRows,
    realTableColumns,
    tableName,
    pkColumn,
    stageInsert,
    stageEdit,
  ])

  /** Stage NULL for all cells in the selected row(s) */
  const handleContextSetToNull = useCallback(() => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    for (let ri = 0; ri < rows.length; ri++) {
      const idx = displayRows.indexOf(rows[ri])
      if (idx < 0) continue
      const rowId = buildRowId(rows[ri], idx, tableName, pkColumn)
      for (const col of realTableColumns) {
        stageEdit(rowId, col, rows[ri][col], null)
      }
    }
  }, [
    getSelectedRows,
    displayRows,
    realTableColumns,
    tableName,
    pkColumn,
    stageEdit,
  ])

  /** Stage delete for the selected row(s) */
  const handleContextDeleteRows = useCallback(() => {
    const rowIds = getSelectedRowIds()
    for (const rowId of rowIds) {
      stageDelete(rowId)
    }
    resetSelection()
  }, [getSelectedRowIds, stageDelete, resetSelection])

  /** Open the Generate SQL modal with INSERT/UPDATE/DELETE preview */
  const handleContextGenerateSQL = useCallback(() => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const columnInfo = tableColumnsMeta.map((c) => ({
      name: c.columnName,
      dataType: c.dataType,
      isPrimaryKey: isPrimaryKeyColumn(c),
    }))
    const sql = generateReviewSQL(
      rows,
      realTableColumns,
      tableName ?? 'table',
      columnInfo,
      'all',
    )
    setGeneratedSql(sql)
    setSqlModalOpen(true)
  }, [getSelectedRows, realTableColumns, tableName, tableColumnsMeta])

  // ── Keep copy/paste handlers referable from keyboard callbacks ────────────
  handleCopyRef.current = handleContextCopy
  handlePasteRef.current = handleContextPaste

  /** Open the row detail drawer for the first selected row */
  const handleViewDetails = useCallback(() => {
    // Use the first selected / context row as the detail target
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const idx = displayRows.indexOf(rows[0])
    if (idx < 0) return
    setDetailDrawerRow({ row: rows[0] as Record<string, unknown>, rowIndex: idx })
  }, [getSelectedRows, displayRows])

  // ── Export handlers ─────────────────────────────────────────────────────
  const handleExportCSV = useCallback(async () => {
    if (realTableRows.length === 0) {
      setToast({ kind: 'error', message: 'No data to export' })
      return
    }
    const csv = formatCSVWithHeaders(realTableRows, realTableColumns)
    await copyToClipboard(csv)
    setToast({ kind: 'success', message: 'Copied CSV to clipboard' })
    setExportOpen(false)
  }, [realTableRows, realTableColumns])

  const handleExportJSON = useCallback(async () => {
    if (realTableRows.length === 0) {
      setToast({ kind: 'error', message: 'No data to export' })
      return
    }
    const json = formatJSON(realTableRows, realTableColumns)
    await copyToClipboard(json)
    setToast({ kind: 'success', message: 'Copied JSON to clipboard' })
    setExportOpen(false)
  }, [realTableRows, realTableColumns])

  const handleAddRow = useCallback(() => {
    if (realTableColumns.length === 0) {
      setToast({ kind: 'error', message: 'No columns available to add a row' })
      return
    }
    const template: Record<string, unknown> = {}
    for (const col of realTableColumns) {
      const meta = editableColumnMetaMap[col]
      template[col] = getDefaultValueForType(meta?.dataType)
    }
    const newRowId = stageInsert(template)
    console.log(
      '[TableDetailPage] Added row with ID:',
      newRowId,
      'Template:',
      template,
    )
    setToast({
      kind: 'success',
      message: `Added new row (ID: ${newRowId})`,
    })
    // Scroll to bottom to show the new row
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop =
          scrollContainerRef.current.scrollHeight
      }
    })
  }, [realTableColumns, editableColumnMetaMap, stageInsert])

  const handleDeleteRow = useCallback(() => {
    // Prefer deleting all rows that have any selected cell; fall back to the
    // active cell's row. This matches the Delete/Backspace keyboard behavior.
    if (selectedCells.size > 0 && activeCell) {
      const rowIndices = new Set<number>()
      for (const key of selectedCells) {
        rowIndices.add(Number(key.split(':')[0]))
      }
      for (const idx of rowIndices) {
        const row = displayRows[idx]
        if (!row) continue
        const rowId = buildRowId(row, idx, tableName, pkColumn)
        stageDelete(rowId)
      }
      resetSelection()
      return
    }
    if (!activeCell) return
    const row = displayRows[activeCell.rowIndex]
    if (!row) return
    const rowId = buildRowId(row, activeCell.rowIndex, tableName, pkColumn)
    stageDelete(rowId)
    resetSelection()
  }, [
    selectedCells,
    activeCell,
    displayRows,
    tableName,
    pkColumn,
    stageDelete,
    resetSelection,
  ])

  const handleRefresh = useCallback(() => {
    if (!tableName) return
    if (totalPending > 0) {
      setConfirmRefreshOpen(true)
    } else {
      handleTreeNodeClick(
        tableName,
        undefined,
        1,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
      )
    }
  }, [
    tableName,
    handleTreeNodeClick,
    totalPending,
    pageSize,
    appliedWhereClause,
    appliedOrderByClause,
  ])
  const handleConfirmRefresh = useCallback(() => {
    setConfirmRefreshOpen(false)
    clearAll()
    resetInsertCounter()
    if (tableName) {
      handleTreeNodeClick(
        tableName,
        undefined,
        1,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
      )
    }
  }, [
    tableName,
    handleTreeNodeClick,
    clearAll,
    pageSize,
    appliedWhereClause,
    appliedOrderByClause,
  ])

  const handleCancelRefresh = useCallback(() => {
    setConfirmRefreshOpen(false)
  }, [])

  // ── Commit / Revert handlers ──────────────────────────────────────────────
  const commitMutation = useCommitTableChanges(connectionId)

  const handleCommit = useCallback(async () => {
    if (!tableName || !connectionId || !selectedConnection || !pkColumn) return
    if (totalPending === 0) return

    try {
      const payload = await getConnPayloadWithPassword(
        selectedConnection,
        selectedSchema,
      )
      // Override database with the one currently browsed (user may have
      // switched databases in the sidebar without updating the profile).
      payload.database =
        selectedDatabase || selectedConnection.database || payload.database
      const pkMapped = pkColumn

      // Build inserts: strip __rowId from staged drafts
      const inserts = pendingInserts.map((draft) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { __rowId, ...data } = draft as Record<string, unknown>
        return data
      })

      // Build updates: map rowId (which is prefixed with tableName-) to actual PK values
      const updates = Object.entries(pendingEdits).map(([rowId, edits]) => {
        const changes: Record<string, unknown> = {}
        for (const edit of edits) {
          changes[edit.field] = edit.newValue
        }
        // Extract the actual PK value from the rowId prefix
        // RowId format is `${tableName}-${pkValue}` or `${tableName}-${index}`
        const pkValue = rowId.startsWith(`${tableName}-`)
          ? rowId.slice(`${tableName}-`.length)
          : rowId
        return { rowId: pkValue, changes }
      })

      // Build deletes: same PK extraction
      const deletes = pendingDeletes.map((rowId) => {
        return rowId.startsWith(`${tableName}-`)
          ? rowId.slice(`${tableName}-`.length)
          : rowId
      })

      await commitMutation.mutateAsync({
        connection: payload,
        tableName,
        inserts,
        updates,
        deletes,
        primaryKeyColumn: pkMapped,
      })

      // On success: clear store, reload, toast, restore focus
      const committedCount = totalPending
      clearAll()
      resetInsertCounter()
      handleTreeNodeClick(
        tableName,
        undefined,
        1,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
      )
      setToast({
        kind: 'success',
        message: `Committed ${committedCount} change${committedCount !== 1 ? 's' : ''} successfully`,
      })
      restoreActiveCellFocus()
    } catch (err) {
      // Keep pending queue intact so user can retry; surface an error toast.
      const message = err instanceof Error ? err.message : 'Commit failed'
      console.error('[commit] Failed to commit changes:', err)
      setToast({ kind: 'error', message })
    }
  }, [
    tableName,
    connectionId,
    selectedConnection,
    selectedSchema,
    selectedDatabase,
    pkColumn,
    totalPending,
    pendingInserts,
    pendingEdits,
    pendingDeletes,
    commitMutation,
    clearAll,
    handleTreeNodeClick,
    restoreActiveCellFocus,
    appliedWhereClause,
    pageSize,
    appliedOrderByClause,
  ])

  // Keep latest handleCommit referable from the keyboard callback closure.
  handleCommitRef.current = handleCommit

  const handleRevert = useCallback(() => {
    if (totalPending === 0) return
    setConfirmRevertOpen(true)
  }, [totalPending])

  const handleConfirmRevert = useCallback(() => {
    setConfirmRevertOpen(false)
    clearAll()
    resetInsertCounter()
    restoreActiveCellFocus()
  }, [clearAll, restoreActiveCellFocus])

  const handleCancelRevert = useCallback(() => {
    setConfirmRevertOpen(false)
  }, [])

  const handleUndo = useCallback(() => {
    undo()
    restoreActiveCellFocus()
  }, [undo, restoreActiveCellFocus])

  const handleRedo = useCallback(() => {
    redo()
    restoreActiveCellFocus()
  }, [redo, restoreActiveCellFocus])

  // ── Common table header class ─────────────────────────────────────────────
  const theadClass =
    'sticky top-0 z-20 bg-bg-muted text-text-muted shadow-[0_1px_0_0_var(--color-border-default)]'

  // ── Guard: no tableName ──────────────────────────────────────────────────
  if (!tableName) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        <span className="text-caption">No table selected.</span>
      </div>
    )
  }

  return (
    <section
      className="relative flex h-full min-h-0 flex-col overflow-hidden"
      data-connection-id={connectionId ?? ''}
      data-table-name={tableName}
    >
      {/* ── Toolbar with pending changes badge ──────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
        <ActionButton
          icon={<Filter size={14} />}
          aria-label="Toggle Filter"
          variant={
            filters.length > 0
              ? 'active'
              : filterPanelOpen
                ? 'accent'
                : 'default'
          }
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
        />
        {filters.length > 0 && !filterPanelOpen && (
          <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary leading-none">
            {filters.length}
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
          disabled={
            totalPending === 0 || commitMutation.isPending || !hasPrimaryKey
          }
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

      {/* ── Filter Bar ───────────────────────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          filterPanelOpen || filters.length > 0 || sortColumn
            ? 'grid-rows-[1fr]'
            : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-b border-border-default">
            {/* ── Add filter row ──────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-2 py-1">
              <select
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary disabled:opacity-40"
                value={newFilter.column || ''}
                onChange={(e) =>
                  setNewFilter({ ...newFilter, column: e.target.value })
                }
                disabled={realTableColumns.length === 0}
              >
                <option value="">Column…</option>
                {realTableColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
              <select
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] outline-none focus:border-primary disabled:opacity-40"
                value={newFilter.operator || '='}
                onChange={(e) =>
                  setNewFilter({
                    ...newFilter,
                    operator: e.target.value as FilterOperator,
                  })
                }
                disabled={!newFilter.column}
              >
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value="contains">contains</option>
                <option value="starts_with">starts with</option>
                <option value="ends_with">ends with</option>
                <option value=">">&gt;</option>
                <option value=">=">&gt;=</option>
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
                <option value="is_null">is null</option>
                <option value="is_not_null">is not null</option>
                <option value="in">in</option>
              </select>
              {!['is_null', 'is_not_null'].includes(
                newFilter.operator || '=',
              ) && (
                <input
                  ref={valueInputRef}
                  type="text"
                  className="h-6 w-28 min-w-0 rounded border border-border-default bg-bg-base px-1.5 text-[11px] outline-none focus:border-primary disabled:opacity-40"
                  placeholder="Value…"
                  value={newFilter.value || ''}
                  onChange={(e) =>
                    setNewFilter({ ...newFilter, value: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFilter()
                  }}
                  disabled={!newFilter.column || !newFilter.operator}
                />
              )}
              <button
                type="button"
                className="flex h-6 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={handleAddFilter}
                disabled={
                  !newFilter.column ||
                  !newFilter.operator ||
                  (!newFilter.value &&
                    !['is_null', 'is_not_null'].includes(
                      newFilter.operator || '',
                    ))
                }
              >
                <CirclePlus size={11} />
                Add
              </button>
              {(filters.length > 0 || sortColumn) && (
                <>
                  <span className="ml-auto" />
                  <button
                    type="button"
                    className="flex h-6 items-center rounded px-1.5 text-[11px] text-text-muted transition-colors hover:text-danger"
                    onClick={handleClearAllFilters}
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>

            {/* ── Active filters + sort (inline, wrapping) ─────────────── */}
            {(filters.length > 0 || sortColumn) && (
              <div className="flex flex-wrap items-center gap-1 border-t border-border-default bg-bg-subtle px-2 py-1">
                {filters.map((filter, index) => (
                  <span
                    key={index}
                    className="group/chip inline-flex items-center gap-px rounded border border-primary/20 bg-primary/5 py-px pl-0.5 pr-0.5 text-[11px] leading-tight"
                  >
                    <Filter
                      size={9}
                      className="mx-0.5 shrink-0 text-primary/50"
                    />
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] font-mono text-text-primary outline-none focus:ring-0"
                      value={filter.column}
                      onChange={(e) =>
                        handleUpdateFilter(index, { column: e.target.value })
                      }
                    >
                      {realTableColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] text-text-muted outline-none focus:ring-0"
                      value={filter.operator}
                      onChange={(e) => {
                        const op = e.target.value as FilterOperator
                        const isNullOp = ['is_null', 'is_not_null'].includes(op)
                        handleUpdateFilter(index, {
                          operator: op,
                          ...(isNullOp ? { value: '' } : {}),
                        })
                      }}
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value="contains">contains</option>
                      <option value="starts_with">starts with</option>
                      <option value="ends_with">ends with</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="is_null">is null</option>
                      <option value="is_not_null">is not null</option>
                      <option value="in">in</option>
                    </select>
                    {!['is_null', 'is_not_null'].includes(filter.operator) && (
                      <input
                        type="text"
                        className="h-5 w-16 min-w-0 rounded border-none bg-transparent px-0.5 text-[11px] font-medium text-primary outline-none focus:ring-0"
                        value={filter.value}
                        onChange={(e) =>
                          handleUpdateFilter(index, { value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            (e.target as HTMLInputElement).blur()
                        }}
                      />
                    )}
                    <button
                      className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/chip:opacity-100"
                      onClick={() => handleRemoveFilter(index)}
                      aria-label={`Remove filter on ${filter.column}`}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
                {/* ── Sort chip ── */}
                {sortColumn && (
                  <span className="group/chip inline-flex items-center gap-px rounded border border-border-default bg-bg-muted py-px pl-0.5 pr-0.5 text-[11px] leading-tight">
                    {sortDirection === 'asc' ? (
                      <ChevronUp
                        size={10}
                        className="mx-0.5 shrink-0 text-text-muted"
                      />
                    ) : (
                      <ChevronDown
                        size={10}
                        className="mx-0.5 shrink-0 text-text-muted"
                      />
                    )}
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] font-mono text-text-primary outline-none focus:ring-0"
                      value={sortColumn}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setSortColumn(null)
                          setSortDirection('asc')
                          setAppliedOrderByClause('')
                        } else {
                          handleSortColumn(e.target.value)
                        }
                      }}
                    >
                      {realTableColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-5 rounded bg-transparent px-0.5 text-[11px] text-text-muted outline-none transition-colors hover:text-text-primary"
                      onClick={() => {
                        const next = sortDirection === 'asc' ? 'desc' : 'asc'
                        setSortDirection(next)
                        const dbType = selectedConnection?.type as
                          | 'postgresql'
                          | 'mysql'
                        if (
                          dbType &&
                          ['postgresql', 'mysql'].includes(dbType) &&
                          sortColumn
                        ) {
                          setAppliedOrderByClause(
                            buildOrderByClause(sortColumn, next, dbType),
                          )
                        }
                      }}
                    >
                      {sortDirection === 'asc' ? 'asc' : 'desc'}
                    </button>
                    <button
                      className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/chip:opacity-100"
                      onClick={() => {
                        setSortColumn(null)
                        setSortDirection('asc')
                        setAppliedOrderByClause('')
                      }}
                      aria-label="Clear sort"
                    >
                      <X size={9} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── No primary-key warning banner ─────────────────────────────── */}
      {/*
      {!hasPrimaryKey && (
        <div
          className="flex items-center gap-2 border-b border-border-strong bg-warning-subtle px-3 py-1.5 text-caption text-text-primary"
          role="alert"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            This table has no primary key. Editing is allowed but commit is disabled — use the
            SQL editor to apply changes manually.
          </span>
        </div>
      )}
      */}

      {/* ── sr-only aria-live region for screen readers ──────────────── */}
      <div className="sr-only" aria-live="polite" role="status">
        {totalPending > 0
          ? `${totalPending} pending change${totalPending !== 1 ? 's' : ''}`
          : 'No pending changes'}
        {toast
          ? `. ${toast.kind === 'success' ? 'Success' : 'Error'}: ${toast.message}`
          : ''}
      </div>

      {/* ── Toast (visual) ─────────────────────────────────────────── */}
      {toast && (
        <div
          className={[
            'pointer-events-auto fixed top-3 right-3 z-50 flex items-start gap-2 rounded-lg px-3 py-2 text-xs shadow-lg',
            toast.kind === 'success'
              ? 'border border-border-success bg-success-subtle text-success-text'
              : 'border border-border-danger bg-danger-subtle text-danger',
          ].join(' ')}
          role="alert"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.kind === 'error' && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-micro font-medium text-danger hover:bg-danger/10"
              onClick={() => setToast(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── Loading overlay ──────────────────────────────────────────────── */}
      {tableDataLoading && (
        <CenteredLoadingState
          loading={tableDataLoading}
          label="Loading table data..."
        />
      )}

      {/* ── Data table ────────────────────────────────────────────────────── */}
      {!tableDataLoading && (
        <div
          ref={scrollContainerRef}
          tabIndex={0}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default outline-none focus:ring-1 focus:ring-primary [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
        >
          <table
            role="grid"
            aria-label={`Table data for ${tableName}`}
            className="min-w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed', width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: ROW_GUTTER_WIDTH }} />
              {boundedWidths.map((width, index) => (
                <col
                  key={`col-${realTableColumns[index] ?? index}`}
                  style={{ width }}
                />
              ))}
            </colgroup>
            <thead className={theadClass}>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} role="row">
                  <th
                    role="columnheader"
                    className="sticky left-0 z-30 border-b border-r border-border-default bg-bg-muted px-0 py-0.5"
                  />
                  {headerGroup.headers.map((header, columnIndex) => {
                    const columnId = header.column.id
                    const stickyLeft = getPinnedLeftOffset(
                      columnIndex,
                      realTableColumns,
                      boundedWidths,
                      tableColumnsMeta,
                    )
                    const style: CSSProperties =
                      stickyLeft == null ? {} : { left: stickyLeft }

                    return (
                      <th
                        key={header.id}
                        role="columnheader"
                        className={[
                          'group relative border-b border-r border-border-default px-0 py-0 text-left whitespace-nowrap',
                          stickyLeft == null
                            ? 'bg-bg-muted'
                            : 'sticky z-20 bg-bg-muted shadow-[1px_0_0_0_var(--color-border-default)]',
                        ].join(' ')}
                        style={style}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        <span className="sr-only">{columnId}</span>
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr role="row">
                  <td
                    role="gridcell"
                    colSpan={realTableColumns.length + 1 || 1}
                    className="px-2 py-0"
                  >
                    <div className="h-16" />
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => {
                const rowIndex = row.index
                const rowHasActiveCell = activeCell?.rowIndex === rowIndex
                const rowId = buildRowId(
                  row.original,
                  row.index,
                  tableName,
                  pkColumn,
                )
                const isDeletedRow = pendingDeletes.includes(rowId)
                const hasRowEdits = rowId in pendingEdits
                const isInsertedRow = rowId.startsWith('__insert__')
                const hasSelectedCell = [...selectedCells].some(
                  (k) => Number(k.split(':')[0]) === rowIndex,
                )
                // Get edited fields for this row to highlight individual cells
                const editedFields = new Set(
                  pendingEdits[rowId]?.map((e) => e.field) || [],
                )

                return (
                  <tr
                    key={row.id}
                    role="row"
                    className={[
                      'text-text-primary transition-colors',
                      rowHasActiveCell ? 'bg-primary-subtle' : '',
                      hasSelectedCell && !rowHasActiveCell
                        ? 'bg-selection-bg'
                        : '',
                      !rowHasActiveCell && !hasSelectedCell
                        ? 'hover:bg-bg-muted/70'
                        : '',
                      isDeletedRow
                        ? 'line-through bg-red-100 dark:bg-red-900/25'
                        : '',
                      isInsertedRow ? 'bg-green-100 dark:bg-green-900/25' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      contextRowIndexRef.current = rowIndex
                      setContextMenu({ x: e.clientX, y: e.clientY })
                    }}
                  >
                    <td
                      role="gridcell"
                      className={[
                        'sticky left-0 z-10 cursor-pointer border-b border-r border-border-default p-0 text-center text-micro select-none',
                        rowHasActiveCell || hasSelectedCell
                          ? 'bg-primary-subtle text-primary'
                          : 'bg-bg-base text-text-muted',
                      ].join(' ')}
                      onMouseDown={(e) => handleGutterMouseDown(rowIndex, e)}
                      aria-label={`Select row ${rowIndex + 1}`}
                    >
                      {/* ── Dirty state dot ──────────────────── */}
                      <div className="flex items-center justify-center gap-1">
                        {(hasRowEdits || isDeletedRow || isInsertedRow) && (
                          <span
                            className={[
                              'inline-block h-1.5 w-1.5 rounded-full',
                              isDeletedRow
                                ? 'bg-red-500'
                                : isInsertedRow
                                  ? 'bg-green-500'
                                  : 'bg-yellow-500',
                            ].join(' ')}
                            aria-label="Pending changes"
                          />
                        )}
                        <span>{rowIndex + 1}</span>
                      </div>
                    </td>
                    {row.getVisibleCells().map((cell, columnIndex) => {
                      const stickyLeft = getPinnedLeftOffset(
                        columnIndex,
                        realTableColumns,
                        boundedWidths,
                        tableColumnsMeta,
                      )
                      const style: CSSProperties =
                        stickyLeft == null ? {} : { left: stickyLeft }
                      const columnId = cell.column.id
                      const isActiveCellHere =
                        activeCell?.rowIndex === rowIndex &&
                        activeCell?.columnId === columnId
                      const isSelectedCell = selectedCells.has(
                        cellKey(rowIndex, columnId),
                      )
                      const isDeletedHere = isDeletedRow
                      // Check if this specific cell has an edit
                      const isCellDirty = editedFields.has(columnId)

                      // Compute outer-border for block selections
                      let selectionBoxShadow = ''
                      if (isSelectedCell && selectedCells.size > 1) {
                        // Determine selection bounds
                        let minRow = Infinity,
                          maxRow = -Infinity
                        let minColIdx = Infinity,
                          maxColIdx = -Infinity
                        const colIndexMap = new Map<string, number>()
                        realTableColumns.forEach((c, i) =>
                          colIndexMap.set(c, i),
                        )
                        for (const key of selectedCells) {
                          const [r, c] = key.split(':')
                          const ri = Number(r)
                          const ci = colIndexMap.get(c) ?? -1
                          if (ri < minRow) minRow = ri
                          if (ri > maxRow) maxRow = ri
                          if (ci < minColIdx) minColIdx = ci
                          if (ci > maxColIdx) maxColIdx = ci
                        }
                        const colIdx = colIndexMap.get(columnId) ?? -1
                        const isTop = rowIndex === minRow
                        const isBottom = rowIndex === maxRow
                        const isLeft = colIdx === minColIdx
                        const isRight = colIdx === maxColIdx
                        const shadows = []
                        // Inset shadow on outer edges only
                        if (isTop)
                          shadows.push('inset 0 2px 0 0 var(--color-primary)')
                        if (isBottom)
                          shadows.push('inset 0 -2px 0 0 var(--color-primary)')
                        if (isLeft)
                          shadows.push('inset 2px 0 0 0 var(--color-primary)')
                        if (isRight)
                          shadows.push('inset -2px 0 0 0 var(--color-primary)')
                        selectionBoxShadow = shadows.join(', ')
                      }
                      return (
                        <td
                          key={cell.id}
                          role="gridcell"
                          data-cell-row={rowIndex}
                          data-cell-col={columnId}
                          className={[
                            'overflow-hidden border-b border-r border-border-default p-0 select-none',
                            stickyLeft == null ? '' : 'sticky z-10 bg-bg-base',
                            // Selection takes priority over dirty state
                            isActiveCellHere
                              ? 'ring-2 ring-inset ring-primary z-5'
                              : isSelectedCell
                                ? 'bg-selection-bg'
                                : isCellDirty && !isInsertedRow
                                  ? 'bg-yellow-100 dark:bg-yellow-900/25'
                                  : '',
                            rowHasActiveCell && !isDeletedHere
                              ? 'text-primary'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            ...style,
                            boxShadow: selectionBoxShadow || undefined,
                          }}
                          onMouseDown={(e) =>
                            handleCellMouseDown(rowIndex, columnId, e)
                          }
                          onMouseEnter={() =>
                            handleCellMouseEnter(rowIndex, columnId)
                          }
                          onMouseUp={handleCellMouseUp}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            contextRowIndexRef.current = rowIndex
                            setContextMenu({ x: e.clientX, y: e.clientY })
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination footer ─────────────────────────────────────────── */}
      {!tableDataLoading && (
        <div className="flex items-center justify-between border-t border-border-default px-3 py-2">
          <span className="text-micro text-text-muted">
            {(() => {
              const start = (page - 1) * pageSize + 1
              const end = Math.min(page * pageSize, totalRowCount)
              const label = `Showing ${start}–${end} of ${totalRowCount} record${totalRowCount !== 1 ? 's' : ''}`
              return totalPending > 0
                ? `${label} (${totalPending} pending)`
                : label
            })()}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-micro text-text-muted">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded border border-border-default bg-bg-base px-1 py-0.5 text-micro text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ‹
              </button>
              <span className="text-micro text-text-muted">
                Page {page} of {Math.ceil(totalRowCount / pageSize)}
              </span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
                disabled={page >= Math.ceil(totalRowCount / pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmRefreshOpen}
        title="Discard pending changes?"
        message="You have unsaved changes that will be lost if you refresh. Continue?"
        confirmLabel="Discard"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmRefresh}
        onCancel={handleCancelRefresh}
      />

      {/* ── Revert confirmation ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmRevertOpen}
        title={`Discard all ${totalPending} pending change${totalPending !== 1 ? 's' : ''}?`}
        message="This will undo every staged edit, insert, and delete. This cannot be undone."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmRevert}
        onCancel={handleCancelRevert}
      />

      {/* ── Keyboard shortcuts cheatsheet ─────────────────────────────── */}
      <ShortcutCheatsheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {contextMenu && (
        <GridContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onCopyRow={handleContextCopy}
          onCopyWithHeaders={handleContextCopyWithHeaders}
          onCopyAsSQL={handleContextCopyAsSQL}
          onCopyAsCSV={handleContextCopyAsCSV}
          onPaste={handleContextPaste}
          onSetToNull={handleContextSetToNull}
          onDeleteRows={handleContextDeleteRows}
          onGenerateSQL={handleContextGenerateSQL}
          onViewDetails={handleViewDetails}
        />
      )}

      {/* ── Generate SQL modal ────────────────────────────────────────── */}
      <GenerateSqlModal
        open={sqlModalOpen}
        sql={generatedSql}
        onClose={() => setSqlModalOpen(false)}
      />

      {/* ── Row detail drawer ────────────────────────────────────────── */}
      <RowDetailDrawer
        open={detailDrawerRow !== null}
        row={detailDrawerRow?.row ?? null}
        columns={realTableColumns}
        columnsMeta={tableColumnsMeta}
        rowIndex={detailDrawerRow?.rowIndex ?? 0}
        onClose={() => setDetailDrawerRow(null)}
      />

    </section>
  )
}
