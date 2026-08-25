import { useState, useRef, useCallback, useEffect } from 'react'
import { useTableSelectionStore } from '../store/tableSelectionStore'
import { useTableKeyboard } from '../hooks/useTableKeyboard'
import {
  formatTSV,
  formatTSVWithHeaders,
  generateInsertSQL,
  formatCSVWithHeaders,
  parseDelimitedText,
  mapPasteToColumns,
  copyToClipboard,
  readFromClipboard,
  generateReviewSQL,
} from '../utils/clipboard'
import {
  normalizeCellValue,
  validateCellValue,
  type EditableColumnMeta,
} from '../store/tableEditStore'
import {
  buildRowId,
  getRowKey,
  isPrimaryKeyColumn,
  getDefaultValueForType,
} from '../logic/tableDetailPageHelpers'
import type { TableRow, ColumnMetadata } from '../types/tableDetail'

interface UseTableGridSelectionAndActionsProps {
  tableName: string
  realTableColumns: string[]
  displayRows: TableRow[]
  primaryKeyColumns: string[]
  tableColumnsMeta: ColumnMetadata[]
  stageEdit: (
    rowId: string,
    field: string,
    oldValue: unknown,
    newValue: unknown,
    options?: { coalesceUndo?: boolean },
  ) => void
  stageInsert: (template: Record<string, unknown>) => string
  stageDelete: (rowId: string) => void
  undo: () => void
  redo: () => void
  restoreActiveCellFocus: () => void
  handleDeleteRow: () => void
  handleCommit: () => Promise<void>
  pendingInserts: TableRow[]
  detailDrawerRow: {
    row: Record<string, unknown>
    rowIndex: number
    rowId: string
  } | null
  setDetailDrawerRow: (
    row: {
      row: Record<string, unknown>
      rowIndex: number
      rowId: string
    } | null,
  ) => void
  drawerAnimState: string
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>
  /** Dialect for SQL generation and filter escaping. */
  dbType?: 'postgresql' | 'mysql'
  /** Surface paste-validation failures to the user. */
  onToast?: (toast: { kind: 'success' | 'error'; message: string }) => void
  /** Column metadata for validation during paste (nullable/maxLength). */
  editableColumnMetaMap?: Record<string, EditableColumnMeta>
}

export function useTableGridSelectionAndActions({
  tableName,
  realTableColumns,
  displayRows,
  primaryKeyColumns,
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
  dbType = 'postgresql',
  onToast,
  editableColumnMetaMap = {},
}: UseTableGridSelectionAndActionsProps) {
  // ── Selection store ───────────────────────────────────────────────────
  const selectedCells = useTableSelectionStore((s) => s.selectedCells)
  const activeCell = useTableSelectionStore((s) => s.activeCell)
  const selectSingle = useTableSelectionStore((s) => s.selectSingle)
  const toggleCell = useTableSelectionStore((s) => s.toggleCell)
  const selectRow = useTableSelectionStore((s) => s.selectRow)
  const toggleRow = useTableSelectionStore((s) => s.toggleRow)
  const selectRange = useTableSelectionStore((s) => s.selectRange)
  const resetSelection = useTableSelectionStore((s) => s.reset)

  // ── Refs for dragging & keyboard event handlers ──────────────────────
  const isDraggingRef = useRef(false)
  const dragAnchorRef = useRef<{ rowIndex: number; columnId: string } | null>(
    null,
  )

  // Keep latest handlers ref to avoid stale closures in keyboard events
  const handleCommitRef = useRef(handleCommit)
  useEffect(() => {
    handleCommitRef.current = handleCommit
  }, [handleCommit])

  // ── Cell Mouse selection dragging handlers ─────────────────────────────
  const handleCellMouseDown = useCallback(
    (rowIndex: number, columnId: string, e: React.MouseEvent) => {
      // Ignore right-click mousedown so existing multi-cell selection is not reset
      if (e.button === 2) return

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

  // ── Gutter click row selection handler ─────────────────────────────────
  const handleGutterMouseDown = useCallback(
    (rowIndex: number, e: React.MouseEvent) => {
      // Ignore right-click mousedown so existing selection is not reset before contextmenu fires
      if (e.button === 2) return

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
  const contextRowIndexRef = useRef<number>(0)

  // ── Selection helper getters ───────────────────────────────────────────
  const getSelectedRows = useCallback((): Record<string, unknown>[] => {
    if (selectedCells.size > 0) {
      const rowIndices = new Set<number>()
      for (const key of selectedCells) {
        rowIndices.add(Number(key.split(':')[0]))
      }
      return [...rowIndices]
        .filter((i) => i >= 0 && i < displayRows.length)
        .sort((a, b) => a - b)
        .map((i) => displayRows[i])
    }
    return contextRowIndexRef.current >= 0 &&
      contextRowIndexRef.current < displayRows.length
      ? [displayRows[contextRowIndexRef.current]]
      : []
  }, [selectedCells, displayRows])

  const getSelectedGridData = useCallback(() => {
    if (selectedCells.size === 0) {
      const rows = getSelectedRows()
      return { rows, columns: realTableColumns }
    }
    const rowIndices = [...new Set([...selectedCells].map((k) => Number(k.split(':')[0])))]
      .filter((i) => i >= 0 && i < displayRows.length)
      .sort((a, b) => a - b)
    const selectedCols = realTableColumns.filter((col) =>
      [...selectedCells].some((k) => k.split(':')[1] === col),
    )
    const activeColumns = selectedCols.length > 0 ? selectedCols : realTableColumns
    const rows = rowIndices.map((i) => displayRows[i])
    return { rows, columns: activeColumns }
  }, [selectedCells, getSelectedRows, displayRows, realTableColumns])

  // ── Context menu action handlers ─────────────────────────────────────────
  const handleContextCopy = useCallback(async () => {
    const { rows, columns } = getSelectedGridData()
    if (rows.length === 0) return
    const tsv = formatTSV(rows, columns)
    await copyToClipboard(tsv)
  }, [getSelectedGridData])

  const handleContextCopyWithHeaders = useCallback(async () => {
    const { rows, columns } = getSelectedGridData()
    if (rows.length === 0) return
    const tsv = formatTSVWithHeaders(rows, columns)
    await copyToClipboard(tsv)
  }, [getSelectedGridData])

  const handleContextCopyAsSQL = useCallback(async () => {
    const { rows, columns } = getSelectedGridData()
    if (rows.length === 0) return
    const sql = generateInsertSQL(
      rows,
      columns,
      tableName ?? 'table',
      dbType,
    )
    await copyToClipboard(sql)
  }, [getSelectedGridData, tableName, dbType])

  const handleContextCopyAsCSV = useCallback(async () => {
    const { rows, columns } = getSelectedGridData()
    if (rows.length === 0) return
    const csv = formatCSVWithHeaders(rows, columns)
    await copyToClipboard(csv)
  }, [getSelectedGridData])


  const handleContextPaste = useCallback(async () => {
    const text = await readFromClipboard()
    if (!text) return
    const parsed = parseDelimitedText(text)
    if (parsed.rows.length === 0) return

    // Partial records: only cells physically present in each pasted row.
    const mapped = mapPasteToColumns(parsed.rows, realTableColumns)

    const startRowIdx = contextRowIndexRef.current

    // Validate every target cell first; stage nothing when any cell is invalid.
    interface PlannedEdit {
      rowId: string
      field: string
      oldValue: unknown
      newValue: unknown
    }
    const plannedEdits: PlannedEdit[] = []
    const plannedInserts: Record<string, unknown>[] = []
    let failure: { row: number; column: string; error: string } | null = null

    outer: for (let ri = 0; ri < mapped.length; ri++) {
      const record = mapped[ri]
      const targetIdx = startRowIdx + ri
      if (targetIdx >= displayRows.length) {
        // Appended row: start from the full default template and overlay
        // only the pasted cells.
        const template: Record<string, unknown> = {}
        for (const col of realTableColumns) {
          template[col] =
            getDefaultValueForType(editableColumnMetaMap[col]?.dataType)
        }
        for (const [col, rawValue] of Object.entries(record)) {
          const meta = editableColumnMetaMap[col]
          const normalized = normalizeCellValue(rawValue, meta)
          const error = validateCellValue(normalized, meta)
          if (error) {
            failure = { row: ri + 1, column: col, error }
            break outer
          }
          template[col] = normalized
        }
        plannedInserts.push(template)
        continue
      }

      // No-PK tables are read-only and rows without a usable key cannot
      // be mutated — skip them.
      const targetRow = displayRows[targetIdx]
      if (primaryKeyColumns.length === 0) continue
      if (getRowKey(targetRow, primaryKeyColumns) === null) continue
      const rowId = buildRowId(
        targetRow,
        targetIdx,
        tableName,
        primaryKeyColumns,
      )
      for (const [col, rawValue] of Object.entries(record)) {
        const meta = editableColumnMetaMap[col]
        const normalized = normalizeCellValue(rawValue, meta)
        const error = validateCellValue(normalized, meta)
        if (error) {
          failure = { row: ri + 1, column: col, error }
          break outer
        }
        plannedEdits.push({
          rowId,
          field: col,
          oldValue: targetRow[col],
          newValue: normalized,
        })
      }
    }

    if (failure) {
      onToast?.({
        kind: 'error',
        message: `Paste cancelled — row ${failure.row}, column "${failure.column}": ${failure.error}. Fix the value and paste again.`,
      })
      return
    }

    // All cells valid — apply atomically.
    for (const edit of plannedEdits) {
      stageEdit(edit.rowId, edit.field, edit.oldValue, edit.newValue)
    }
    for (const template of plannedInserts) {
      stageInsert(template)
    }
  }, [
    displayRows,
    realTableColumns,
    tableName,
    primaryKeyColumns,
    editableColumnMetaMap,
    onToast,
    stageInsert,
    stageEdit,
  ])

  const handleContextSetToNull = useCallback(() => {
    if (primaryKeyColumns.length === 0) return
    const rows = getSelectedRows()
    if (rows.length === 0) return
    for (let ri = 0; ri < rows.length; ri++) {
      const idx = displayRows.indexOf(rows[ri])
      if (idx < 0) continue
      // Rows without a usable key are read-only — skip silently.
      if (getRowKey(rows[ri], primaryKeyColumns) === null) continue
      const rowId = buildRowId(rows[ri], idx, tableName, primaryKeyColumns)
      for (const col of realTableColumns) {
        stageEdit(rowId, col, rows[ri][col], null)
      }
    }
  }, [
    getSelectedRows,
    displayRows,
    realTableColumns,
    tableName,
    primaryKeyColumns,
    stageEdit,
  ])

  const handleContextDeleteRows = useCallback(() => {
    if (primaryKeyColumns.length === 0) return
    // Only rows with a usable composite key can be staged for deletion.
    const rows = getSelectedRows()
    const deletableIds = rows
      .filter((row) => getRowKey(row, primaryKeyColumns) !== null)
      .map((row) => {
        const idx = displayRows.indexOf(row)
        return buildRowId(row, idx, tableName, primaryKeyColumns)
      })
    for (const rowId of deletableIds) {
      stageDelete(rowId)
    }
    resetSelection()
  }, [primaryKeyColumns, getSelectedRows, displayRows, tableName, stageDelete, resetSelection])

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
      dbType,
    )
    setGeneratedSql(sql)
    setSqlModalOpen(true)
  }, [
    getSelectedRows,
    realTableColumns,
    tableName,
    tableColumnsMeta,
    dbType,
  ])

  const handleViewDetails = useCallback(() => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const idx = displayRows.indexOf(rows[0])
    if (idx < 0) return
    // Capture identity with the snapshot — the drawer must not recompute
    // it from a mutable rowIndex later.
    setDetailDrawerRow({
      row: rows[0] as Record<string, unknown>,
      rowIndex: idx,
      rowId: buildRowId(rows[0], idx, tableName, primaryKeyColumns),
    })
  }, [getSelectedRows, displayRows, tableName, primaryKeyColumns, setDetailDrawerRow])

  // ── Keyboard shortcuts cheatsheet listener ───────────────────────────────
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
  }, [setShortcutsOpen, scrollContainerRef])

  // ── Table keyboard actions ───────────────────────────────────────────────
  useTableKeyboard({
    containerRef: scrollContainerRef,
    columnIds: realTableColumns,
    rowCount: displayRows.length,
    onEnterEditMode: (pos) => {
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
      // Escape at container level only clears selection; cell-level Escape
      // (cancel edit) is handled inside EditableCell's own input handler.
      restoreActiveCellFocus()
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
      void handleContextCopy()
    },
    onPaste: () => {
      void handleContextPaste()
    },
  })

  // ── Detail drawer row selection synchronization ──────────────────────────
  useEffect(() => {
    if (!detailDrawerRow) return
    if (!activeCell) return
    if (drawerAnimState !== 'open' && drawerAnimState !== 'entering') return
    if (activeCell.rowIndex === detailDrawerRow.rowIndex) return
    const activeRow = displayRows[activeCell.rowIndex]
    if (!activeRow) return
    const activeRowId = (activeRow as Record<string, unknown>).__rowId
    if (
      typeof activeRowId === 'string' &&
      activeRowId.startsWith('__insert__')
    ) {
      return
    }
    setDetailDrawerRow({
      row: activeRow,
      rowIndex: activeCell.rowIndex,
      rowId: buildRowId(
        activeRow,
        activeCell.rowIndex,
        tableName,
        primaryKeyColumns,
      ),
    })
  }, [
    activeCell,
    detailDrawerRow,
    displayRows,
    drawerAnimState,
    tableName,
    primaryKeyColumns,
    setDetailDrawerRow,
  ])

  // ── Detail drawer row insert removal synchronization ─────────────────────
  useEffect(() => {
    if (!detailDrawerRow) return
    const rowId = detailDrawerRow.row.__rowId as string | undefined
    if (!rowId || !rowId.startsWith('__insert__')) return
    const insertExists = pendingInserts.some((d) => d.__rowId === rowId)
    if (!insertExists) {
      setDetailDrawerRow(null)
    }
  }, [detailDrawerRow, pendingInserts, setDetailDrawerRow])

  // ── Scroll active cell into view when focused ────────────────────────────
  useEffect(() => {
    if (!activeCell) return
    requestAnimationFrame(() => {
      const cell = document.querySelector(
        `[data-cell-row="${activeCell.rowIndex}"][data-cell-col="${activeCell.columnId}"]`,
      )
      cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }, [activeCell])

  return {
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
  }
}
