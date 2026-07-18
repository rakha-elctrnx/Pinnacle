import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTabStore } from '../../_shared/store/tabStore'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { useTableFiltersAndSort } from '../hooks/useTableFiltersAndSort'
import { useTableOperations } from '../hooks/useTableOperations'
import { useTableColumns } from '../hooks/useTableColumns'
import { useTableGridSelectionAndActions } from '../hooks/useTableGridSelectionAndActions'
import { useTableEditStore, resetInsertCounter } from '../store/tableEditStore'
import { useTableSelectionStore } from '../store/tableSelectionStore'
import { ConfirmDialog } from '../components/table-cells/ConfirmDialog'
import { ShortcutCheatsheet } from '../components/table-cells/ShortcutCheatsheet'
import { RowDetailDrawer } from '../components/table-cells/RowDetailDrawer'
import { GridContextMenu } from '../components/GridContextMenu'
import { GenerateSqlModal } from '../components/GenerateSqlModal'
import type { ColumnMetadata } from '../types/tableDetail'
import { TableToolbar } from '../components/table-detail/TableToolbar'
import { TableFilterBar } from '../components/table-detail/TableFilterBar'
import { TableGrid } from '../components/table-detail/TableGrid'
import { TablePaginationFooter } from '../components/table-detail/TablePaginationFooter'

export function TableDetailPage() {
  const { connectionId, tableName } = useParams<{
    connectionId: string
    tableName: string
  }>()

  const safeTableName = tableName ?? ''
  const tabId = `${connectionId}:table:${safeTableName}`

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

  // ── Edit store actions ───────────────────────────────────────────────────
  const stageEdit = useTableEditStore((s) => s.stageEdit)
  const stageInsert = useTableEditStore((s) => s.stageInsert)
  const stageDelete = useTableEditStore((s) => s.stageDelete)
  const clearAll = useTableEditStore((s) => s.clearAll)
  const undo = useTableEditStore((s) => s.undo)
  const redo = useTableEditStore((s) => s.redo)

  // ── Refs ─────────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const valueInputRef = useRef<HTMLInputElement>(null)

  // ── Detect column metadata and primary keys ──────────────────────────────
  const tableColumnsMeta = useMemo<ColumnMetadata[]>(() => {
    if (!schemaColumnsByTable) return []
    return schemaColumnsByTable[safeTableName] || []
  }, [safeTableName, schemaColumnsByTable])

  const pkColumn = useMemo<string | undefined>(() => {
    const pkIndex = realTableIndexes.find(
      (idx) => idx.isPrimary && idx.tableName === safeTableName,
    )
    return pkIndex?.columnName[0]
  }, [realTableIndexes, safeTableName])

  const hasPrimaryKey = pkColumn !== undefined

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

  // ── Filters & Sort Hook ──────────────────────────────────────────────────
  const {
    filters,
    appliedWhereClause,
    filterPanelOpen,
    setFilterPanelOpen,
    newFilter,
    setNewFilter,
    sortColumn,
    setSortColumn,
    sortDirection,
    setSortDirection,
    appliedOrderByClause,
    setAppliedOrderByClause,
    handleAddFilter,
    handleUpdateFilter,
    handleRemoveFilter,
    handleClearAllFilters,
    handleSortColumn,
  } = useTableFiltersAndSort({
    tabId,
    dbType: selectedConnection?.type as 'postgresql' | 'mysql' | undefined,
    tableColumnsMeta,
    tableName: safeTableName,
  })

  const handleColumnFilterClick = useCallback(
    (column: string) => {
      setFilterPanelOpen(true)
      setNewFilter((nf) => ({ ...nf, column }))
      setTimeout(() => valueInputRef.current?.focus(), 50)
    },
    [setFilterPanelOpen, setNewFilter],
  )

  // ── Operations Hook ──────────────────────────────────────────────────────
  const {
    displayRows,
    page,
    setPage,
    pageSize,
    setPageSize,
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
    totalPending,
    undoAvailable,
    redoAvailable,
    pendingEdits,
    pendingInserts,
    pendingDeletes,
    commitMutation,
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
  } = useTableOperations({
    connectionId,
    tableName: safeTableName,
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
  })

  // ── Column specifications & TanStack Table hook ──────────────────────────
  const { table, tableWidth, boundedWidths } = useTableColumns({
    tableName: safeTableName,
    realTableColumns,
    tableColumnsMeta,
    filters,
    sortColumn,
    sortDirection,
    handleSortColumn,
    handleColumnFilterClick,
    displayRows,
    editableColumnMetaMap,
    pkColumn,
  })

  // ── Keyboard & Mouse event selection orchestration hook ──────────────────
  const {
    selectedCells,
    activeCell,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    handleGutterMouseDown,
    contextMenu,
    setContextMenu,
    sqlModalOpen,
    setSqlModalOpen,
    generatedSql,
    contextRowIndexRef,
    handleViewDetails,
    handleContextCopy,
    handleContextCopyWithHeaders,
    handleContextCopyAsSQL,
    handleContextCopyAsCSV,
    handleContextPaste,
    handleContextSetToNull,
    handleContextDeleteRows,
    handleContextGenerateSQL,
    resetSelection,
  } = useTableGridSelectionAndActions({
    tableName: safeTableName,
    realTableColumns,
    displayRows,
    pkColumn,
    tableColumnsMeta,
    stageEdit,
    stageInsert,
    stageDelete,
    undo,
    redo,
    restoreActiveCellFocus,
    handleDeleteRow,
    handleCommit,
    pendingInserts,
    detailDrawerRow,
    setDetailDrawerRow,
    drawerAnimState,
    scrollContainerRef,
    setShortcutsOpen,
  })

  // ── Trigger data load when URL param changes ─────────────────────────────
  useEffect(() => {
    handleTreeNodeClick(
      safeTableName,
      undefined,
      page,
      pageSize,
      appliedWhereClause,
      appliedOrderByClause,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    safeTableName,
    handleTreeNodeClick,
    appliedWhereClause,
    appliedOrderByClause,
  ])

  // Sync selectedTreeNode so the Footer breadcrumb updates correctly.
  useEffect(() => {
    if (!selectedConnection) return
    const activeTab = useTabStore
      .getState()
      .tabs.find(
        (t) =>
          t.connectionId === selectedConnection.id &&
          t.pageType === 'table' &&
          t.label === safeTableName,
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
    const path = [db, schema, 'Tables', safeTableName].filter(Boolean).join('/')
    setSelectedTreeNode(path)
  }, [
    safeTableName,
    selectedConnection,
    selectedDatabase,
    selectedSchema,
    setSelectedTreeNode,
  ])

  // Reset active row, clear edit store, and restore filter/sort/page state.
  useEffect(() => {
    queueMicrotask(() => {
      resetSelection()
    })
    clearAll()
    resetInsertCounter()
    setDetailDrawerRow(null)
  }, [
    safeTableName,
    clearAll,
    resetSelection,
    connectionId,
    setDetailDrawerRow,
  ])

  // Refetch data when page or pageSize changes (skip on mount).
  const prevPageRef = useRef(page)
  const prevPageSizeRef = useRef(pageSize)
  useEffect(() => {
    if (prevPageRef.current === page && prevPageSizeRef.current === pageSize)
      return
    prevPageRef.current = page
    prevPageSizeRef.current = pageSize
    handleTreeNodeClick(
      safeTableName,
      undefined,
      page,
      pageSize,
      appliedWhereClause,
      appliedOrderByClause,
    )
  }, [
    safeTableName,
    page,
    pageSize,
    handleTreeNodeClick,
    appliedWhereClause,
    appliedOrderByClause,
  ])

  // Sync pending change count to the tab badge in TabBar.
  useEffect(() => {
    useTabStore.getState().setTabPendingCount(tabId, totalPending)
  }, [tabId, totalPending])

  // Auto-dismiss toasts — 4s for success, 6s for errors
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.kind === 'success' ? 4000 : 6000)
    return () => clearTimeout(t)
  }, [toast, setToast])

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
      data-table-name={safeTableName}
    >
      <TableToolbar
        filtersLength={filters.length}
        filterPanelOpen={filterPanelOpen}
        setFilterPanelOpen={setFilterPanelOpen}
        handleAddRow={handleAddRow}
        activeCell={activeCell}
        handleDeleteRow={handleDeleteRow}
        handleRefresh={handleRefresh}
        undoAvailable={undoAvailable}
        handleUndo={handleUndo}
        redoAvailable={redoAvailable}
        handleRedo={handleRedo}
        totalPending={totalPending}
        isCommitPending={commitMutation.isPending}
        hasPrimaryKey={hasPrimaryKey}
        handleCommit={handleCommit}
        handleRevert={handleRevert}
        setShortcutsOpen={setShortcutsOpen}
        exportOpen={exportOpen}
        setExportOpen={setExportOpen}
        handleExportCSV={handleExportCSV}
        handleExportJSON={handleExportJSON}
      />

      <TableFilterBar
        filterPanelOpen={filterPanelOpen}
        filters={filters}
        newFilter={newFilter}
        setNewFilter={setNewFilter}
        realTableColumns={realTableColumns}
        handleAddFilter={handleAddFilter}
        handleClearAllFilters={handleClearAllFilters}
        handleUpdateFilter={handleUpdateFilter}
        handleRemoveFilter={handleRemoveFilter}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        setSortColumn={setSortColumn}
        setSortDirection={setSortDirection}
        setAppliedOrderByClause={setAppliedOrderByClause}
        selectedConnection={selectedConnection}
        handleSortColumn={handleSortColumn}
        valueInputRef={valueInputRef}
      />

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
            'pointer-events-auto absolute left-1/2 z-50 flex -translate-x-1/2 items-start gap-2 rounded-lg px-3 py-2 text-xs shadow-lg',
            toast.kind === 'success'
              ? 'bottom-3 border border-border-success bg-success-subtle text-success-text'
              : 'bottom-3 border border-border-danger bg-danger-subtle text-danger',
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
        <TableGrid
          scrollContainerRef={scrollContainerRef}
          drawerAnimState={drawerAnimState}
          drawerWidth={drawerWidth}
          isResizingDetailDrawer={isResizingDetailDrawer}
          tableName={safeTableName}
          tableWidth={tableWidth}
          realTableColumns={realTableColumns}
          boundedWidths={boundedWidths}
          table={table}
          tableColumnsMeta={tableColumnsMeta}
          activeCell={activeCell}
          selectedCells={selectedCells}
          pendingDeletes={pendingDeletes}
          pendingEdits={pendingEdits}
          pkColumn={pkColumn}
          handleCellMouseDown={handleCellMouseDown}
          handleCellMouseEnter={handleCellMouseEnter}
          handleCellMouseUp={handleCellMouseUp}
          handleGutterMouseDown={handleGutterMouseDown}
          setContextMenu={setContextMenu}
          contextRowIndexRef={contextRowIndexRef}
        />
      )}

      {/* ── Pagination footer ─────────────────────────────────────────── */}
      {!tableDataLoading && (
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          setPage={setPage}
          setPageSize={setPageSize}
          totalRowCount={totalRowCount}
          totalPending={totalPending}
        />
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
        tableName={safeTableName}
        pkColumn={pkColumn}
        drawerWidth={drawerWidth}
        setDrawerWidth={setDrawerWidth}
        isResizing={isResizingDetailDrawer}
        setIsResizing={setIsResizingDetailDrawer}
        onAnimationStateChange={setDrawerAnimState}
        onClose={() => setDetailDrawerRow(null)}
      />
    </section>
  )
}
