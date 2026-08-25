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
import {
  buildRowId,
  getRowKey,
  DEFAULT_PAGE_SIZE,
} from '../logic/tableDetailPageHelpers'
import { getConnPayloadWithPassword } from '../../_shared/utils'
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
  primaryKeyColumns: string[]
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
    options?: { invalidateMeta?: boolean; bypassCache?: boolean },
  ) => Promise<boolean>
  restoreActiveCellFocus: () => void
  /** Called before explicit Refresh fetches — drops cached table metadata. */
  onBeforeRefresh?: () => void
  tabId: string
}

export function useTableOperations({
  connectionId,
  tableName,
  selectedConnection,
  selectedSchema,
  selectedDatabase,
  tableColumnsMeta,
  primaryKeyColumns,
  realTableColumns,
  realTableRows,
  appliedWhereClause,
  appliedOrderByClause,
  handleTreeNodeClick,
  restoreActiveCellFocus,
  onBeforeRefresh,
  tabId,
}: UseTableOperationsProps) {
  const cacheEntry = useTableDetailCacheStore.getState().get(tabId)

  // ── Edit store selectors ─────────────────────────────────────────────────
  const stageInsert = useTableEditStore((s) => s.stageInsert)
  const stageDelete = useTableEditStore((s) => s.stageDelete)
  const clearAll = useTableEditStore((s) => s.clearAll)
  const undo = useTableEditStore((s) => s.undo)
  const redo = useTableEditStore((s) => s.redo)
  const selectSingle = useTableSelectionStore((s) => s.selectSingle)
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
  const [detailDrawerRow, setDetailDrawerRow] = useState<{
    row: Record<string, unknown>
    rowIndex: number
    rowId: string
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
      const rowId = buildRowId(_row, index, tableName, primaryKeyColumns)
      return !pendingDeletes.includes(rowId)
    })
    const activeInserts = pendingInserts.filter((draft) => {
      const rowId = draft.__rowId as string | undefined
      if (!rowId) return false
      const hasEdits = pendingEdits[rowId] && pendingEdits[rowId].length > 0
      const isBeingEdited = detailDrawerRow?.row?.__rowId === rowId
      const isNewestInsert = pendingInserts.length > 0 && pendingInserts[pendingInserts.length - 1].__rowId === rowId
      return hasEdits || isBeingEdited || isNewestInsert
    })
    return [...filtered, ...activeInserts]
  }, [
    realTableRows,
    pendingDeletes,
    pendingInserts,
    pendingEdits,
    tableName,
    primaryKeyColumns,
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
        isNullable: col.isNullable ?? true,
        maxLength: col.maxLength ?? null,
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
    if (primaryKeyColumns.length === 0) {
      setToast({ kind: 'error', message: 'Read-only: this table has no primary key' })
      return
    }
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
    const newRowIndex = displayRows.length
    selectSingle({ rowIndex: newRowIndex, columnId: realTableColumns[0] })
    setDetailDrawerRow({
      row: draft as Record<string, unknown>,
      rowIndex: newRowIndex,
      rowId: newRowId,
    })
    setToast({
      kind: 'success',
      message: 'New row ready — fill fields below to display it in the table',
    })
  }, [primaryKeyColumns, realTableColumns, editableColumnMetaMap, stageInsert, selectSingle, displayRows.length])

  const handleDeleteRow = useCallback(() => {
    const cells = useTableSelectionStore.getState().selectedCells
    const actCell = useTableSelectionStore.getState().activeCell
    const stageDeleteForRow = (row: TableRow | undefined, idx: number) => {
      if (!row) return
      // Rows without a usable key are read-only — skip silently.
      const keyValues = getRowKey(row, primaryKeyColumns)
      if (!keyValues && !(row as Record<string, unknown>).__rowId) return
      stageDelete(buildRowId(row, idx, tableName, primaryKeyColumns))
    }
    if (cells.size > 0 && actCell) {
      const rowIndices = new Set<number>()
      for (const key of cells) {
        rowIndices.add(Number(key.split(':')[0]))
      }
      for (const idx of rowIndices) {
        stageDeleteForRow(displayRows[idx], idx)
      }
      resetSelection()
      return
    }
    if (!actCell) return
    stageDeleteForRow(displayRows[actCell.rowIndex], actCell.rowIndex)
    resetSelection()
  }, [primaryKeyColumns, displayRows, tableName, stageDelete, resetSelection])

  const handleRefresh = useCallback(() => {
    if (!tableName) return
    const pendingTotal = pendingChangeCount(useTableEditStore.getState())
    if (pendingTotal > 0) {
      setConfirmRefreshOpen(true)
    } else {
      onBeforeRefresh?.()
      handleTreeNodeClick(
        tableName,
        undefined,
        1,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
        { invalidateMeta: true, bypassCache: true },
      )
    }
  }, [
    tableName,
    handleTreeNodeClick,
    onBeforeRefresh,
    pageSize,
    appliedWhereClause,
    appliedOrderByClause,
  ])

  const handleConfirmRefresh = useCallback(() => {
    setConfirmRefreshOpen(false)
    clearAll()
    resetInsertCounter()
    if (tableName) {
      onBeforeRefresh?.()
      handleTreeNodeClick(
        tableName,
        undefined,
        1,
        pageSize,
        appliedWhereClause,
        appliedOrderByClause,
        { invalidateMeta: true, bypassCache: true },
      )
    }
  }, [
    tableName,
    handleTreeNodeClick,
    clearAll,
    onBeforeRefresh,
    pageSize,
    appliedWhereClause,
    appliedOrderByClause,
  ])

  const handleCancelRefresh = useCallback(() => {
    setConfirmRefreshOpen(false)
  }, [])

  const handleCommit = useCallback(async () => {
    if (!tableName || !connectionId || !selectedConnection) return
    const pendingTotal = pendingChangeCount(useTableEditStore.getState())
    if (pendingTotal === 0) return
    if (primaryKeyColumns.length === 0) {
      setToast({ kind: 'error', message: 'Read-only: this table has no primary key' })
      return
    }

    try {
      const payload = await getConnPayloadWithPassword(
        selectedConnection,
        selectedSchema,
      )
      payload.database =
        selectedDatabase || selectedConnection.database || payload.database

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

      // Resolve a staged rowId back to its display row snapshot. Keys are
      // ALWAYS rebuilt from the snapshot — never parsed out of the row ID.
      const resolveRow = (rowId: string): TableRow | undefined => {
        const realIdx = realTableRows.findIndex(
          (row, idx) =>
            buildRowId(row, idx, tableName, primaryKeyColumns) === rowId,
        )
        if (realIdx >= 0) return realTableRows[realIdx]
        const draft = currentPendingInserts.find((d) => d.__rowId === rowId)
        if (draft) return draft as unknown as TableRow
        return undefined
      }

      // Build updates from row snapshots; skip unresolvable or keyless rows.
      const updates: {
        key: { values: string[] }
        changes: Record<string, unknown>
      }[] = []
      for (const [rowId, edits] of Object.entries(currentPendingEdits)) {
        if (rowId.startsWith('__insert__')) continue
        const changes: Record<string, unknown> = {}
        for (const edit of edits) {
          changes[edit.field] = edit.newValue
        }
        const row = resolveRow(rowId)
        const keyValues = row ? getRowKey(row, primaryKeyColumns) : null
        if (!keyValues) continue
        updates.push({ key: { values: keyValues }, changes })
      }

      // Build deletes from row snapshots; skip unresolvable or keyless rows.
      const deletes: { values: string[] }[] = []
      for (const rowId of currentPendingDeletes) {
        if (rowId.startsWith('__insert__')) continue
        const row = resolveRow(rowId)
        const keyValues = row ? getRowKey(row, primaryKeyColumns) : null
        if (!keyValues) continue
        deletes.push({ values: keyValues })
      }

      await commitMutation.mutateAsync({
        connection: payload,
        tableName,
        inserts,
        updates,
        deletes,
        primaryKeyColumns,
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
        { bypassCache: true },
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
    primaryKeyColumns,
    realTableRows,
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
