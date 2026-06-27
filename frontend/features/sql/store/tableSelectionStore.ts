/**
 * useTableSelectionStore — spreadsheet-like cell/row/range selection
 *
 * Tracks:
 * - activeCell: the cell that has focus border and receives keyboard input
 * - selectedCells: all cells currently selected (Set of "row:col" keys)
 * - selectionAnchor: start point for Shift+click / Shift+Arrow range
 *
 * Not persisted. Resets when tableName changes (caller responsibility).
 */

import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────────────────

export interface CellPosition {
  rowIndex: number
  columnId: string
}

export type CellKey = string // "rowIndex:columnId"

// ── Helpers ────────────────────────────────────────────────────────

export function cellKey(row: number, col: string): CellKey {
  return `${row}:${col}`
}

/** Compute all cell keys in a rectangular range (inclusive). */
export function rangeKeys(
  anchor: CellPosition,
  target: CellPosition,
  columnIds: readonly string[],
): CellKey[] {
  const minRow = Math.min(anchor.rowIndex, target.rowIndex)
  const maxRow = Math.max(anchor.rowIndex, target.rowIndex)
  const anchorColIdx = columnIds.indexOf(anchor.columnId)
  const targetColIdx = columnIds.indexOf(target.columnId)
  if (anchorColIdx < 0 || targetColIdx < 0) return []
  const minCol = Math.min(anchorColIdx, targetColIdx)
  const maxCol = Math.max(anchorColIdx, targetColIdx)

  const keys: CellKey[] = []
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      keys.push(cellKey(r, columnIds[c]!))
    }
  }
  return keys
}

/** Compute all cell keys for an entire row. */
export function rowKeys(rowIndex: number, columnIds: readonly string[]): CellKey[] {
  return columnIds.map((col) => cellKey(rowIndex, col))
}

/** Compute all cell keys for the entire table. */
export function allKeys(rowCount: number, columnIds: readonly string[]): CellKey[] {
  const keys: CellKey[] = []
  for (let r = 0; r < rowCount; r++) {
    for (const col of columnIds) {
      keys.push(cellKey(r, col))
    }
  }
  return keys
}

// ── Store interface ────────────────────────────────────────────────

interface SelectionState {
  activeCell: CellPosition | null
  selectedCells: Set<CellKey>
  selectionAnchor: CellPosition | null

  // ── Actions ──────────────────────────────────────────────────────
  setActiveCell: (pos: CellPosition | null) => void
  selectSingle: (pos: CellPosition) => void
  toggleCell: (pos: CellPosition) => void
  selectRange: (anchor: CellPosition, target: CellPosition, columnIds: readonly string[]) => void
  selectRow: (rowIndex: number, columnIds: readonly string[]) => void
  toggleRow: (rowIndex: number, columnIds: readonly string[]) => void
  selectAll: (rowCount: number, columnIds: readonly string[]) => void
  extendSelection: (target: CellPosition, columnIds: readonly string[]) => void
  clearSelection: () => void
  reset: () => void
}

// ── Store ──────────────────────────────────────────────────────────

export const useTableSelectionStore = create<SelectionState>()((set, get) => ({
  activeCell: null,
  selectedCells: new Set<CellKey>(),
  selectionAnchor: null,

  setActiveCell: (pos) => set({ activeCell: pos }),

  selectSingle: (pos) =>
    set({
      activeCell: pos,
      selectedCells: new Set([cellKey(pos.rowIndex, pos.columnId)]),
      selectionAnchor: pos,
    }),

  toggleCell: (pos) =>
    set((state) => {
      const key = cellKey(pos.rowIndex, pos.columnId)
      const next = new Set(state.selectedCells)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return {
        activeCell: pos,
        selectedCells: next,
        selectionAnchor: pos,
      }
    }),

  selectRange: (anchor, target, columnIds) =>
    set({
      activeCell: target,
      selectedCells: new Set(rangeKeys(anchor, target, columnIds)),
      selectionAnchor: anchor,
    }),

  selectRow: (rowIndex, columnIds) =>
    set((state) => ({
      activeCell: { rowIndex, columnId: state.activeCell?.columnId ?? columnIds[0] ?? '' },
      selectedCells: new Set(rowKeys(rowIndex, columnIds)),
      selectionAnchor: { rowIndex, columnId: columnIds[0] ?? '' },
    })),

  toggleRow: (rowIndex, columnIds) =>
    set((state) => {
      const keys = rowKeys(rowIndex, columnIds)
      const next = new Set(state.selectedCells)
      const allPresent = keys.every((k) => next.has(k))
      if (allPresent) {
        for (const k of keys) next.delete(k)
      } else {
        for (const k of keys) next.add(k)
      }
      return {
        activeCell: { rowIndex, columnId: state.activeCell?.columnId ?? columnIds[0] ?? '' },
        selectedCells: next,
        selectionAnchor: { rowIndex, columnId: columnIds[0] ?? '' },
      }
    }),

  selectAll: (rowCount, columnIds) =>
    set({
      selectedCells: new Set(allKeys(rowCount, columnIds)),
      selectionAnchor: { rowIndex: 0, columnId: columnIds[0] ?? '' },
    }),

  extendSelection: (target, columnIds) => {
    const { selectionAnchor } = get()
    if (!selectionAnchor) return
    set((state) => ({
      activeCell: target,
      selectedCells: new Set(rangeKeys(selectionAnchor, target, columnIds)),
      // keep anchor unchanged
      selectionAnchor: state.selectionAnchor,
    }))
  },

  clearSelection: () =>
    set({
      selectedCells: new Set(),
      selectionAnchor: null,
    }),

  reset: () =>
    set({
      activeCell: null,
      selectedCells: new Set(),
      selectionAnchor: null,
    }),
}))
