/**
 * useTableEditStore — Zustand store for pending table changes
 *
 * Tracks staged cell edits, new rows, and pending deletes before
 * commit. Plain-object based (not persisted, not serializable Map/Set)
 * to keep Zustand internals simple.
 *
 * Row identity: stable string IDs derived from primary key values
 * when available, falling back to `${tableName}-${index}`.
 */

import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────────────────

export interface CellEdit {
  field: string
  oldValue: unknown
  newValue: unknown
}

/** A row awaiting insertion — maps column name → value */
export type InsertDraft = Record<string, unknown>

// ── Column metadata used for frontend validation ───────────────────

export interface EditableColumnMeta {
  columnName: string
  dataType: string
  isNullable: boolean
  maxLength?: number | null
}

// ── Undo/redo action records ───────────────────────────────────────

export type EditActionType = 'edit' | 'insert' | 'delete'

export interface EditAction {
  type: EditActionType
  timestamp: number
  /** edit: rowId + field being changed */
  rowId?: string
  field?: string
  /** edit: original DB value (rawValue at stage time) */
  oldValue?: unknown
  /** edit: value staged before this action (undefined if cell was unedited) */
  prevNewValue?: unknown
  /** edit: value staged by this action */
  newValue?: unknown
  /** insert: the full draft (including __rowId) so redo can re-add it */
  draft?: InsertDraft
}

// ── Store interface ────────────────────────────────────────────────

interface TableEditState {
  /** RowId → array of cell edits for that row */
  pendingEdits: Record<string, CellEdit[]>
  /** Rows to be inserted (empty templates filled by the user) */
  pendingInserts: InsertDraft[]
  /** RowIds marked for deletion */
  pendingDeletes: string[]
  /** Bounded undo history (newest last) */
  undoStack: EditAction[]
  /** Bounded redo history (newest last) */
  redoStack: EditAction[]

  // ── Actions ────────────────────────────────────────────────────
  stageEdit: (rowId: string, field: string, oldValue: unknown, newValue: unknown) => void
  unstageEdit: (rowId: string, field: string) => void
  stageInsert: (template: InsertDraft) => string
  stageDelete: (rowId: string) => void
  unstageDelete: (rowId: string) => void
  undo: () => void
  redo: () => void
  clearAll: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────

let insertCounter = 0

/** Generate a stable pseudo-ID for staged-insert rows */
export function generateInsertRowId(): string {
  insertCounter += 1
  return `__insert__${insertCounter}`
}

/** Reset the insert counter (call when table changes) */
export function resetInsertCounter(): void {
  insertCounter = 0
}

// ── Selectors (convenience helpers for components) ─────────────────

const MAX_UNDO_STACK = 20

/** Returns true if any pending changes exist */
export function hasPendingChanges(state: TableEditState): boolean {
  return (
    Object.keys(state.pendingEdits).length > 0 ||
    state.pendingInserts.length > 0 ||
    state.pendingDeletes.length > 0
  )
}

/** Returns total number of pending changes (edits + inserts + deletes) */
export function pendingChangeCount(state: TableEditState): number {
  const editCount = Object.values(state.pendingEdits).reduce((sum, edits) => sum + edits.length, 0)
  return editCount + state.pendingInserts.length + state.pendingDeletes.length
}

/** Returns true when a specific rowId has any pending change */
export function rowHasChanges(state: TableEditState, rowId: string): boolean {
  return (
    rowId in state.pendingEdits ||
    state.pendingDeletes.includes(rowId) ||
    rowId.startsWith('__insert__')
  )
}

/** Returns the set of rows that are staged inserts */
export function insertRowIds(state: TableEditState): Set<string> {
  return new Set(
    state.pendingInserts
      .map((draft) => draft.__rowId as string | undefined)
      .filter(Boolean) as string[],
  )
}

/** Returns true if undo is available. */
export function canUndo(state: TableEditState): boolean {
  return state.undoStack.length > 0
}

/** Returns true if redo is available. */
export function canRedo(state: TableEditState): boolean {
  return state.redoStack.length > 0
}

// ── Validation ─────────────────────────────────────────────────────

/** Check whether a cell value passes frontend column validation. */
export function validateCellValue(
  value: unknown,
  meta: EditableColumnMeta | undefined,
): string | null {
  if (meta == null) return null

  const strValue = value === null || value === undefined ? '' : String(value)

  // NOT NULL check
  if (!meta.isNullable && (strValue === '' || value === null || value === undefined)) {
    return 'Value cannot be empty (NOT NULL column)'
  }

  // Empty is OK if nullable
  if (strValue === '') return null

  // Max length check
  if (meta.maxLength != null && strValue.length > meta.maxLength) {
    return `Exceeds max length of ${meta.maxLength} characters`
  }

  // Type-specific validation
  const dt = (meta.dataType ?? '').toUpperCase()

  if (dt.includes('INT') || dt === 'SERIAL' || dt === 'BIGSERIAL') {
    if (!/^-?\d+$/.test(strValue)) {
      return 'Value must be an integer'
    }
  }

  if (dt === 'FLOAT' || dt === 'REAL' || dt === 'DOUBLE' || dt === 'NUMERIC' || dt === 'DECIMAL') {
    if (!/^-?\d+(\.\d+)?$/i.test(strValue)) {
      return 'Value must be a number'
    }
  }

  if (dt === 'BOOLEAN' || dt === 'BOOL') {
    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(strValue.toLowerCase())) {
      return 'Value must be a boolean (true/false)'
    }
  }

  if (dt === 'UUID') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(strValue)) {
      return 'Value must be a valid UUID'
    }
  }

  return null
}

// ── Store ──────────────────────────────────────────────────────────

export const useTableEditStore = create<TableEditState>()((set) => ({
  pendingEdits: {},
  pendingInserts: [],
  pendingDeletes: [],
  undoStack: [],
  redoStack: [],

  stageEdit: (rowId, field, oldValue, newValue) =>
    set((state) => {
      const edits = [...(state.pendingEdits[rowId] ?? [])]
      const existingIndex = edits.findIndex((e) => e.field === field)

      // Record the staged value BEFORE this action so undo can restore it.
      const prevNewValue = existingIndex !== -1 ? edits[existingIndex]!.newValue : undefined

      if (String(oldValue) === String(newValue)) {
        // No actual change → remove edit if it existed
        const newEdits = { ...state.pendingEdits }
        if (existingIndex !== -1) {
          edits.splice(existingIndex, 1)
          if (edits.length === 0) {
            delete newEdits[rowId]
          } else {
            newEdits[rowId] = edits
          }
          // Only record undo if we actually removed a previously-staged edit
          const action: EditAction = {
            type: 'edit',
            timestamp: Date.now(),
            rowId,
            field,
            oldValue,
            prevNewValue,
            newValue,
          }
          return {
            pendingEdits: newEdits,
            undoStack: pushBounded(state.undoStack, action),
            redoStack: [],
          }
        }
        return { pendingEdits: newEdits }
      }

      if (existingIndex !== -1) {
        edits[existingIndex] = { field, oldValue, newValue }
      } else {
        edits.push({ field, oldValue, newValue })
      }

      const action: EditAction = {
        type: 'edit',
        timestamp: Date.now(),
        rowId,
        field,
        oldValue,
        prevNewValue,
        newValue,
      }
      return {
        pendingEdits: { ...state.pendingEdits, [rowId]: edits },
        undoStack: pushBounded(state.undoStack, action),
        redoStack: [],
      }
    }),

  unstageEdit: (rowId, field) =>
    set((state) => {
      const existing = (state.pendingEdits[rowId] ?? []).find((e) => e.field === field)
      if (!existing) return state
      const edits = (state.pendingEdits[rowId] ?? []).filter((e) => e.field !== field)
      const newEdits = { ...state.pendingEdits }
      if (edits.length === 0) {
        delete newEdits[rowId]
      } else {
        newEdits[rowId] = edits
      }
      return { pendingEdits: newEdits }
    }),

  stageInsert: (template) => {
    const rowId = generateInsertRowId()
    const draft = { ...template, __rowId: rowId }
    set((state) => ({
      pendingInserts: [...state.pendingInserts, draft],
      undoStack: pushBounded(state.undoStack, {
        type: 'insert',
        timestamp: Date.now(),
        draft,
      } as EditAction),
      redoStack: [],
    }))
    return rowId
  },

  stageDelete: (rowId) =>
    set((state) => {
      if (state.pendingDeletes.includes(rowId)) return state
      return {
        pendingDeletes: [...state.pendingDeletes, rowId],
        undoStack: pushBounded(state.undoStack, {
          type: 'delete',
          timestamp: Date.now(),
          rowId,
        } as EditAction),
        redoStack: [],
      }
    }),

  unstageDelete: (rowId) =>
    set((state) => ({
      pendingDeletes: state.pendingDeletes.filter((id) => id !== rowId),
    })),

  undo: () =>
    set((state) => {
      if (state.undoStack.length === 0) return state
      const action = state.undoStack[state.undoStack.length - 1]!
      const next = applyUndo(state, action)
      return {
        ...next,
        undoStack: state.undoStack.slice(0, -1),
        // Push the action onto redo so redo() can replay it forward
        redoStack: [...state.redoStack, action],
      }
    }),

  redo: () =>
    set((state) => {
      if (state.redoStack.length === 0) return state
      const action = state.redoStack[state.redoStack.length - 1]!
      const next = applyRedo(state, action)
      return {
        ...next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: pushBounded(state.undoStack, action),
      }
    }),

  clearAll: () =>
    set({
      pendingEdits: {},
      pendingInserts: [],
      pendingDeletes: [],
      undoStack: [],
      redoStack: [],
    }),
}))

// ── Undo/redo internals ─────────────────────────────────────────────

/** Push onto a bounded stack, dropping oldest beyond the cap. */
function pushBounded(stack: EditAction[], action: EditAction): EditAction[] {
  const next = [...stack, action]
  return next.length > MAX_UNDO_STACK ? next.slice(next.length - MAX_UNDO_STACK) : next
}

/**
 * Apply the inverse of an action to the pending state.
 * Returns the changed slices only (does not touch the stacks).
 */
function applyUndo(
  state: TableEditState,
  action: EditAction,
): Pick<TableEditState, 'pendingEdits' | 'pendingInserts' | 'pendingDeletes'> {
  if (action.type === 'edit') {
    const { rowId, field, prevNewValue } = action
    const edits = [...(state.pendingEdits[rowId!] ?? [])]
    const idx = edits.findIndex((e) => e.field === field)

    if (prevNewValue === undefined) {
      // This action originally created the edit → remove it
      if (idx !== -1) edits.splice(idx, 1)
    } else {
      // Restore the previously-staged value
      if (idx !== -1) {
        edits[idx] = { field: field!, oldValue: action.oldValue!, newValue: prevNewValue }
      } else {
        edits.push({ field: field!, oldValue: action.oldValue!, newValue: prevNewValue })
      }
    }

    const pendingEdits = { ...state.pendingEdits }
    if (edits.length === 0) {
      delete pendingEdits[rowId!]
    } else {
      pendingEdits[rowId!] = edits
    }
    return { pendingEdits, pendingInserts: state.pendingInserts, pendingDeletes: state.pendingDeletes }
  }

  if (action.type === 'insert') {
    const draft = action.draft!
    return {
      pendingEdits: state.pendingEdits,
      pendingInserts: state.pendingInserts.filter((d) => d.__rowId !== draft.__rowId),
      pendingDeletes: state.pendingDeletes,
    }
  }

  // delete → unstage delete
  return {
    pendingEdits: state.pendingEdits,
    pendingInserts: state.pendingInserts,
    pendingDeletes: state.pendingDeletes.filter((id) => id !== action.rowId),
  }
}

/**
 * Re-apply an action forward (after it was undone).
 */
function applyRedo(
  state: TableEditState,
  action: EditAction,
): Pick<TableEditState, 'pendingEdits' | 'pendingInserts' | 'pendingDeletes'> {
  if (action.type === 'edit') {
    const { rowId, field, oldValue, newValue } = action
    const edits = [...(state.pendingEdits[rowId!] ?? [])]
    const idx = edits.findIndex((e) => e.field === field)

    // If newValue equals oldValue (the action originally removed a staged edit),
    // redo should also remove any existing staged value
    if (String(oldValue) === String(newValue)) {
      if (idx !== -1) edits.splice(idx, 1)
    } else if (idx !== -1) {
      edits[idx] = { field: field!, oldValue: oldValue!, newValue: newValue! }
    } else {
      edits.push({ field: field!, oldValue: oldValue!, newValue: newValue! })
    }

    const pendingEdits = { ...state.pendingEdits }
    if (edits.length === 0) {
      delete pendingEdits[rowId!]
    } else {
      pendingEdits[rowId!] = edits
    }
    return { pendingEdits, pendingInserts: state.pendingInserts, pendingDeletes: state.pendingDeletes }
  }

  if (action.type === 'insert') {
    return {
      pendingEdits: state.pendingEdits,
      pendingInserts: [...state.pendingInserts, action.draft!],
      pendingDeletes: state.pendingDeletes,
    }
  }

  // delete → re-stage delete
  return {
    pendingEdits: state.pendingEdits,
    pendingInserts: state.pendingInserts,
    pendingDeletes: state.pendingDeletes.includes(action.rowId!)
      ? state.pendingDeletes
      : [...state.pendingDeletes, action.rowId!],
  }
}

