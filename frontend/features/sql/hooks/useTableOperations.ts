import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  useTableEditStore,
  pendingChangeCount,
  resetInsertCounter,
  canUndo,
  canRedo,
} from '../store/tableEditStore'
import { useTableSelectionStore } from '../store/tableSelectionStore'
import { useTableDetailCacheStore } from '../store/tableDetailCacheStore'
import { useCommitTableChanges } from '../hooks/useCommitTableChanges'
import type { TableRow, ColumnMetadata } from '../types/tableDetail'
import { buildRowId, DEFAULT_PAGE_SIZE } from '../logic/tableDetailPageHelpers'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import {
  formatCSVWithHeaders,
  formatJSON,
  copyToClipboard,
} from '../utils/clipboard'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { DrawerAnimState } from '../components/table-cells/RowDetailDrawer'
import type { EditableColumnMeta } from '../store/tableEditStore'

interface UseTableOperationsProps {
  connectionId: string | undefined
  tableName: string | undefined
  selectedConnection: ConnectionProfile | null
  selectedSchema: string
  selectedDatabase: string
  tableColumnsMeta: ColumnMetadata[]
  pkColumn: string | undefined
  realTableColumns: string[]
  realTableRows: Record<string, string>[]
  appliedWhereClause: string
  appliedOrderByClause: string
  handleTreeNodeClick: (
    nodeLabel: string,
    databaseName?: string,
    page?: number,
    pageSize?: number,
    whereClause?: string,
    orderByClause?: string,
  ) => Promise<boolean>
  restoreActiveCellFocus: () => void
  tabId: string
}

export function useTableOperations({
  connectionId,
  tableName,
  selectedConnection,
  selectedSchema,
  selectedDatabase,
  tableColumnsMeta,
  pkColumn,
  realTableColumns,
  realTableRows,
  appliedWhereClause,
  appliedOrderByClause,
  handleTreeNodeClick,
  restoreActiveCellFocus,
  tabId,
}: UseTableOperationsProps) {
  const cacheEntry = useTableDetailCacheStore.getState().get(tabId)

  // ── Edit store selectors ─────────────────────────────────────────────────
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

  // ── Selection store ───────────────────────────────────────────────────
  const activeCell = useTableSelectionStore((s) => s.activeCell)
  const resetSelection = useTableSelectionStore((s) => s.reset)

  // ── Pagination state (server-side) ────────────────────────────────────────
  const [page, setPage] = useState(cacheEntry?.page ?? 1)
  const [pageSize, setPageSize] = useState(
    cacheEntry?.pageSize ?? DEFAULT_PAGE_SIZE,
  )

  // ── Dialog / UI state ────────────────────────────────────────────────────
  const [confirmRefreshOpen, setConfirmRefreshOpen] = useState(false)
  const [confirmRevertOpen, setConfirmRevertOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [detailDrawerRow, setDetailDrawerRow] = useState<{
    row: Record<string, unknown>
    rowIndex: number
  } | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(340)
  const [isResizingDetailDrawer, setIsResizingDetailDrawer] = useState(false)
  const [drawerAnimState, setDrawerAnimState] =
    useState<DrawerAnimState>('closed')
  const [toast, setToast] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  // ── Build the data array: real rows (minus staged deletes) + staged inserts ──
  const displayRows = useMemo<TableRow[]>(() => {
    const filtered = realTableRows.filter((_row, index) => {
      const rowId = buildRowId(_row, index, tableName, pkColumn)
      return !pendingDeletes.includes(rowId)
    })
    const activeInserts = pendingInserts.filter((draft) => {
      const rowId = draft.__rowId as string | undefined
      if (!rowId) return false
      const hasEdits = pendingEdits[rowId] && pendingEdits[rowId].length > 0
      const isBeingEdited = detailDrawerRow?.row?.__rowId === rowId
      return hasEdits || isBeingEdited
    })
    return [...filtered, ...activeInserts]
  }, [
    realTableRows,
    pendingDeletes,
    pendingInserts,
    pendingEdits,
    tableName,
    pkColumn,
    detailDrawerRow,
  ])

  // ── Read-only column metadata map for default values ──────────────────────
  const editableColumnMetaMap = useMemo<
    Record<string, EditableColumnMeta>
  >(() => {
    const map: Record<string, EditableColumnMeta> = {}
    for (const col of tableColumnsMeta) {
      map[col.columnName] = {
        columnName: col.columnName,
        dataType: col.dataType ?? '',
        isNullable: true,
        maxLength: null,
      }
    }
    return map
  }, [tableColumnsMeta])
  // ── Sync states synchronously when tabId changes ──────────────────────────
  const [prevTabId, setPrevTabId] = useState(tabId)
  if (tabId !== prevTabId) {
    setPrevTabId(tabId)
    const cached = useTableDetailCacheStore.getState().get(tabId)
    setPage(cached?.page ?? 1)
    setPageSize(cached?.pageSize ?? DEFAULT_PAGE_SIZE)
  }

  // ── Sync pagination state to cache ──────────────────────────────────────
  useEffect(() => {
    if (!tabId) return
    useTableDetailCacheStore.getState().set(tabId, {
      page,
      pageSize,
    })
  }, [tabId, page, pageSize])

  // ── Commit mutation hook ──────────────────────────────────────────────────
  const commitMutation = useCommitTableChanges(connectionId)

  // ── Handlers ──────────────────────────────────────────────────────────────

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
    const draft = { ...template, __rowId: newRowId }
    setDetailDrawerRow({
      row: draft as Record<string, unknown>,
      rowIndex: displayRows.length,
    })
    setToast({
      kind: 'success',
      message: 'New row ready — fill fields below to display it in the table',
    })
  }, [realTableColumns, editableColumnMetaMap, stageInsert, displayRows.length])

  const handleDeleteRow = useCallback(() => {
    const cells = useTableSelectionStore.getState().selectedCells
    const actCell = useTableSelectionStore.getState().activeCell
    if (cells.size > 0 && actCell) {
      const rowIndices = new Set<number>()
      for (const key of cells) {
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
    if (!actCell) return
    const row = displayRows[actCell.rowIndex]
    if (!row) return
    const rowId = buildRowId(row, actCell.rowIndex, tableName, pkColumn)
    stageDelete(rowId)
    resetSelection()
  }, [displayRows, tableName, pkColumn, stageDelete, resetSelection])

  const handleRefresh = useCallback(() => {
    if (!tableName) return
    const pendingTotal = pendingChangeCount(useTableEditStore.getState())
    if (pendingTotal > 0) {
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

  const handleCommit = useCallback(async () => {
    if (!tableName || !connectionId || !selectedConnection || !pkColumn) return
    const pendingTotal = pendingChangeCount(useTableEditStore.getState())
    if (pendingTotal === 0) return

    try {
      const payload = await getConnPayloadWithPassword(
        selectedConnection,
        selectedSchema,
      )
      payload.database =
        selectedDatabase || selectedConnection.database || payload.database
      const pkMapped = pkColumn

      const currentPendingEdits = useTableEditStore.getState().pendingEdits
      const currentPendingInserts = useTableEditStore.getState().pendingInserts
      const currentPendingDeletes = useTableEditStore.getState().pendingDeletes

      // Build inserts: merge edits from pendingEdits into each insert draft
      const inserts = currentPendingInserts.map((draft) => {
        const rowId = draft.__rowId as string | undefined
        const merged = { ...draft } as Record<string, unknown>
        if (rowId && currentPendingEdits[rowId]) {
          for (const edit of currentPendingEdits[rowId]) {
            merged[edit.field] = edit.newValue
          }
        }
        delete merged.__rowId
        return merged
      })

      // Build updates
      const updates = Object.entries(currentPendingEdits)
        .filter(([rowId]) => !rowId.startsWith('__insert__'))
        .map(([rowId, edits]) => {
          const changes: Record<string, unknown> = {}
          for (const edit of edits) {
            changes[edit.field] = edit.newValue
          }
          const pkValue = rowId.startsWith(`${tableName}-`)
            ? rowId.slice(`${tableName}-`.length)
            : rowId
          return { rowId: pkValue, changes }
        })

      // Build deletes
      const deletes = currentPendingDeletes.map((rowId) => {
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

      const committedCount = pendingTotal
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
    commitMutation,
    clearAll,
    handleTreeNodeClick,
    restoreActiveCellFocus,
    appliedWhereClause,
    pageSize,
    appliedOrderByClause,
  ])

  const handleRevert = useCallback(() => {
    const pendingTotal = pendingChangeCount(useTableEditStore.getState())
    if (pendingTotal === 0) return
    setConfirmRevertOpen(true)
  }, [])

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

  return {
    displayRows,
    // Pagination
    page,
    setPage,
    pageSize,
    setPageSize,
    // Dialog / UI state
    confirmRefreshOpen,
    confirmRevertOpen,
    shortcutsOpen,
    setShortcutsOpen,
    exportOpen,
    setExportOpen,
    detailDrawerRow,
    setDetailDrawerRow,
    drawerWidth,
    setDrawerWidth,
    isResizingDetailDrawer,
    setIsResizingDetailDrawer,
    drawerAnimState,
    setDrawerAnimState,
    toast,
    setToast,
    // Store-derived state
    activeCell,
    totalPending,
    undoAvailable,
    redoAvailable,
    pendingEdits,
    pendingInserts,
    pendingDeletes,
    commitMutation,
    // Actions
    handleAddRow,
    handleDeleteRow,
    handleRefresh,
    handleConfirmRefresh,
    handleCancelRefresh,
    handleCommit,
    handleRevert,
    handleConfirmRevert,
    handleCancelRevert,
    handleUndo,
    handleRedo,
    handleExportCSV,
    handleExportJSON,
    editableColumnMetaMap,
  }
}

function getDefaultValueForType(dataType: string | undefined): unknown {
  if (!dataType) return ''
  const dt = dataType.toUpperCase()
  if (dt === 'BOOLEAN' || dt === 'BOOL') return false
  if (
    dt.includes('INT') ||
    dt === 'SERIAL' ||
    dt === 'BIGSERIAL' ||
    dt === 'SMALLINT' ||
    dt === 'BIGINT'
  )
    return 0
  if (
    dt === 'FLOAT' ||
    dt === 'REAL' ||
    dt === 'DOUBLE' ||
    dt === 'NUMERIC' ||
    dt === 'DECIMAL'
  )
    return 0
  if (dt === 'UUID') return ''
  if (
    dt.includes('DATE') ||
    dt.includes('TIME') ||
    dt.includes('TIMESTAMP') ||
    dt === 'DATETIME'
  )
    return null
  if (dt === 'JSON' || dt === 'JSONB') return null
  return ''
}
