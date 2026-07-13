import { useState, useRef, useCallback, useEffect } from 'react'
import { useTableSelectionStore } from '../store/tableSelectionStore'
import { useTableKeyboard } from '../hooks/useTableKeyboard'
import {
  formatTSV,
  formatTSVWithHeaders,
  generateInsertSQL,
  formatCSVWithHeaders,
  parseTSV,
  mapPasteToColumns,
  copyToClipboard,
  readFromClipboard,
  generateReviewSQL,
} from '../utils/clipboard'
import { buildRowId, isPrimaryKeyColumn } from '../logic/tableDetailPageHelpers'
import type { TableRow, ColumnMetadata } from '../types/tableDetail'

interface UseTableGridSelectionAndActionsProps {
  tableName: string
  realTableColumns: string[]
  displayRows: TableRow[]
  pkColumn: string | undefined
  tableColumnsMeta: ColumnMetadata[]
  stageEdit: (
    rowId: string,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ) => void
  stageInsert: (template: Record<string, unknown>) => string
  stageDelete: (rowId: string) => void
  undo: () => void
  redo: () => void
  restoreActiveCellFocus: () => void
  handleDeleteRow: () => void
  handleCommit: () => Promise<void>
  pendingInserts: TableRow[]
  detailDrawerRow: { row: Record<string, unknown>; rowIndex: number } | null
  setDetailDrawerRow: (
    row: { row: Record<string, unknown>; rowIndex: number } | null,
  ) => void
  drawerAnimState: string
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  setShortcutsOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export function useTableGridSelectionAndActions({
  tableName,
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
  const clearEditStateRef = useRef<() => void>(() => {})

  // Keep latest handlers ref to avoid stale closures in keyboard events
  const handleCommitRef = useRef(handleCommit)
  useEffect(() => {
    handleCommitRef.current = handleCommit
  }, [handleCommit])

  // ── Cell Mouse selection dragging handlers ─────────────────────────────
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
    if (selectedCells.size > 0 && activeCell) {
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
  }, [selectedCells, activeCell, displayRows])

  const getSelectedRowIds = useCallback((): string[] => {
    const rows = getSelectedRows()
    return rows.map((row) => {
      const idx = displayRows.indexOf(row)
      return buildRowId(row, idx, tableName, pkColumn)
    })
  }, [getSelectedRows, displayRows, tableName, pkColumn])

  // ── Context menu action handlers ─────────────────────────────────────────
  const handleContextCopy = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const tsv = formatTSV(rows, realTableColumns)
    await copyToClipboard(tsv)
  }, [getSelectedRows, realTableColumns])

  const handleContextCopyWithHeaders = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const tsv = formatTSVWithHeaders(rows, realTableColumns)
    await copyToClipboard(tsv)
  }, [getSelectedRows, realTableColumns])

  const handleContextCopyAsSQL = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const sql = generateInsertSQL(rows, realTableColumns, tableName ?? 'table')
    await copyToClipboard(sql)
  }, [getSelectedRows, realTableColumns, tableName])

  const handleContextCopyAsCSV = useCallback(async () => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const csv = formatCSVWithHeaders(rows, realTableColumns)
    await copyToClipboard(csv)
  }, [getSelectedRows, realTableColumns])

  const handleContextPaste = useCallback(async () => {
    const text = await readFromClipboard()
    if (!text) return
    const parsed = parseTSV(text)
    if (parsed.rows.length === 0) return

    const startRowIdx = contextRowIndexRef.current
    const mapped = mapPasteToColumns(parsed.rows, realTableColumns)

    for (let ri = 0; ri < mapped.length; ri++) {
      const targetIdx = startRowIdx + ri
      if (targetIdx >= displayRows.length) {
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

  const handleContextDeleteRows = useCallback(() => {
    const rowIds = getSelectedRowIds()
    for (const rowId of rowIds) {
      stageDelete(rowId)
    }
    resetSelection()
  }, [getSelectedRowIds, stageDelete, resetSelection])

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

  const handleViewDetails = useCallback(() => {
    const rows = getSelectedRows()
    if (rows.length === 0) return
    const idx = displayRows.indexOf(rows[0])
    if (idx < 0) return
    setDetailDrawerRow({
      row: rows[0] as Record<string, unknown>,
      rowIndex: idx,
    })
  }, [getSelectedRows, displayRows, setDetailDrawerRow])

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
    })
  }, [
    activeCell,
    detailDrawerRow,
    displayRows,
    drawerAnimState,
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
