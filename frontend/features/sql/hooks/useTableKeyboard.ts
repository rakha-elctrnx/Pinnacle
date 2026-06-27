/**
 * useTableKeyboard — keyboard navigation for the table grid
 *
 * Registers a keydown handler on the table container (via ref).
 * Only handles navigation keys; editing keys (Enter/F2/Escape)
 * are handled by EditableCell when a cell is in edit mode.
 *
 * This hook is designed to be called once in TableDetailPage
 * and attached to the scroll container ref.
 */

import { useCallback, useEffect, type RefObject } from 'react'
import {
  useTableSelectionStore,
  type CellPosition,
} from '../store/tableSelectionStore'

interface UseTableKeyboardOptions {
  containerRef: RefObject<HTMLElement | null>
  columnIds: readonly string[]
  rowCount: number
  /** Called when Enter/F2 is pressed on an active cell to start editing. */
  onEnterEditMode?: (pos: CellPosition) => void
  /** Called when Escape is pressed to clear selection or cancel edit. */
  onEscape?: () => void
  /** Ctrl/Cmd+Z → undo last staged action. */
  onUndo?: () => void
  /** Ctrl/Cmd+Shift+Z (or Ctrl+Y) → redo last undone action. */
  onRedo?: () => void
  /** Ctrl/Cmd+Enter → commit all pending changes. */
  onCommit?: () => void
  /** Delete/Backspace → stage selected row(s) for deletion. */
  onDelete?: () => void
}

export function useTableKeyboard({
  containerRef,
  columnIds,
  rowCount,
  onEnterEditMode,
  onEscape,
  onUndo,
  onRedo,
  onCommit,
  onDelete,
}: UseTableKeyboardOptions) {
  const activeCell = useTableSelectionStore((s) => s.activeCell)
  const extendSelection = useTableSelectionStore((s) => s.extendSelection)
  const selectAll = useTableSelectionStore((s) => s.selectAll)
  const selectSingle = useTableSelectionStore((s) => s.selectSingle)
  const clearSelection = useTableSelectionStore((s) => s.clearSelection)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Only intercept Escape in inputs (to exit edit mode)
        if (e.key === 'Escape') {
          // Let EditableCell handle it via its own handler
          return
        }
        return
      }

      if (columnIds.length === 0 || rowCount === 0) return

      const current = activeCell
      const isMeta = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey

      // ── Ctrl/Cmd+A → select all ──────────────────────────────────
      if (isMeta && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll(rowCount, columnIds)
        return
      }

      // ── Ctrl/Cmd+Enter → commit pending changes ──────────────────
      if (isMeta && e.key === 'Enter') {
        e.preventDefault()
        onCommit?.()
        return
      }

      // ── Ctrl/Cmd+Shift+Z → redo (Ctrl/Cmd+Y alias) ──────────────
      // ── Ctrl/Cmd+Z → undo ─────────────────────────────────────────
      if (isMeta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (isShift) {
          onRedo?.()
        } else {
          onUndo?.()
        }
        return
      }

      if (isMeta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        onRedo?.()
        return
      }

      // ── Delete / Backspace → stage selected row(s) for deletion ─
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!current) return
        e.preventDefault()
        onDelete?.()
        return
      }

      // ── Escape → clear selection ─────────────────────────────────
      if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
        onEscape?.()
        return
      }

      // All remaining keys require an active cell
      if (!current) {
        // If no active cell, any arrow key selects the first cell
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
          e.preventDefault()
          const pos: CellPosition = { rowIndex: 0, columnId: columnIds[0] ?? '' }
          selectSingle(pos)
          scrollToCell(pos)
        }
        return
      }

      const colIdx = columnIds.indexOf(current.columnId)

      // ── Arrow keys ───────────────────────────────────────────────
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        const next: CellPosition = {
          rowIndex: Math.max(0, current.rowIndex - 1),
          columnId: current.columnId,
        }
        if (isShift) {
          extendSelection(next, columnIds)
        } else {
          selectSingle(next)
        }
        scrollToCell(next)
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const next: CellPosition = {
          rowIndex: Math.min(rowCount - 1, current.rowIndex + 1),
          columnId: current.columnId,
        }
        if (isShift) {
          extendSelection(next, columnIds)
        } else {
          selectSingle(next)
        }
        scrollToCell(next)
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const next: CellPosition = {
          rowIndex: current.rowIndex,
          columnId: columnIds[Math.max(0, colIdx - 1)] ?? current.columnId,
        }
        if (isShift) {
          extendSelection(next, columnIds)
        } else {
          selectSingle(next)
        }
        scrollToCell(next)
        return
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault()
        const next: CellPosition = {
          rowIndex: current.rowIndex,
          columnId: columnIds[Math.min(columnIds.length - 1, colIdx + 1)] ?? current.columnId,
        }
        if (isShift) {
          extendSelection(next, columnIds)
        } else {
          selectSingle(next)
        }
        scrollToCell(next)
        return
      }

      // ── Home / End ───────────────────────────────────────────────
      if (e.key === 'Home') {
        e.preventDefault()
        if (isMeta) {
          // Ctrl+Home → first cell in table
          const next: CellPosition = { rowIndex: 0, columnId: columnIds[0] ?? '' }
          if (isShift) {
            extendSelection(next, columnIds)
          } else {
            selectSingle(next)
          }
          scrollToCell(next)
        } else {
          // Home → first cell in row
          const next: CellPosition = { rowIndex: current.rowIndex, columnId: columnIds[0] ?? '' }
          if (isShift) {
            extendSelection(next, columnIds)
          } else {
            selectSingle(next)
          }
          scrollToCell(next)
        }
        return
      }

      if (e.key === 'End') {
        e.preventDefault()
        if (isMeta) {
          // Ctrl+End → last cell in table
          const next: CellPosition = {
            rowIndex: rowCount - 1,
            columnId: columnIds[columnIds.length - 1] ?? '',
          }
          if (isShift) {
            extendSelection(next, columnIds)
          } else {
            selectSingle(next)
          }
          scrollToCell(next)
        } else {
          // End → last cell in row
          const next: CellPosition = {
            rowIndex: current.rowIndex,
            columnId: columnIds[columnIds.length - 1] ?? '',
          }
          if (isShift) {
            extendSelection(next, columnIds)
          } else {
            selectSingle(next)
          }
          scrollToCell(next)
        }
        return
      }

      // ── Enter / F2 → enter edit mode ────────────────────────────
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        onEnterEditMode?.(current)
        return
      }

      // ── Tab → move to next cell ──────────────────────────────────
      if (e.key === 'Tab') {
        e.preventDefault()
        if (isShift) {
          // Shift+Tab → previous cell
          if (colIdx > 0) {
            selectSingle({ rowIndex: current.rowIndex, columnId: columnIds[colIdx - 1]! })
          } else if (current.rowIndex > 0) {
            selectSingle({
              rowIndex: current.rowIndex - 1,
              columnId: columnIds[columnIds.length - 1]!,
            })
          }
        } else {
          // Tab → next cell
          if (colIdx < columnIds.length - 1) {
            selectSingle({ rowIndex: current.rowIndex, columnId: columnIds[colIdx + 1]! })
          } else if (current.rowIndex < rowCount - 1) {
            selectSingle({ rowIndex: current.rowIndex + 1, columnId: columnIds[0]! })
          }
        }
        return
      }
    },
    [
      activeCell,
      columnIds,
      rowCount,
      extendSelection,
      selectAll,
      selectSingle,
      clearSelection,
      onEnterEditMode,
      onEscape,
      onUndo,
      onRedo,
      onCommit,
      onDelete,
    ],
  )

  // Register on the container
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('keydown', handleKeyDown)
    return () => el.removeEventListener('keydown', handleKeyDown)
  }, [containerRef, handleKeyDown])
}

/** Scroll a cell into view within the container. */
function scrollToCell(pos: CellPosition) {
  // Use a small delay to let DOM update
  requestAnimationFrame(() => {
    const cell = document.querySelector(
      `[data-cell-row="${pos.rowIndex}"][data-cell-col="${pos.columnId}"]`,
    )
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })
}
