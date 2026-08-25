/**
 * EditableCell — TanStack Table cell renderer with inline editing
 *
 * Supports:
 * - Double-click / Enter / F2 to enter edit mode
 * - Enter / Tab to commit, Escape to cancel
 * - Frontend validation against column metadata
 * - Visual feedback (dirty state, error state)
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react'
import type { CellContext } from '@tanstack/react-table'

import {
  useTableEditStore,
  validateCellValue,
  normalizeCellValue,
  valuesEqual,
  type EditableColumnMeta,
} from '../../store/tableEditStore'

// ── Value formatting helpers ──────────────────────────────────────────

/** Safely convert a raw cell value to a display string.
 *  Objects/arrays are JSON-stringified instead of falling back to
 *  `String()` which produces `"[object Object]"`. */
function valueToDisplayString(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }
  return String(val)
}

// ── Timestamp formatting ─────────────────────────────────────────────

const TIMESTAMP_TYPES = new Set([
  'TIMESTAMP',
  'TIMESTAMPTZ',
  'DATETIME',
  'DATE',
  'TIME',
  'TIME WITH TIME ZONE',
])

/**
 * Format a timestamp string without changing the wall-clock time it carries.
 * Normalizes the ISO `T` separator to a space, trims fractional seconds for
 * display, keeps the source date/time as-is (no UTC conversion), and keeps
 * any timezone suffix.
 */
function formatTimestampValue(ts: string): string {
  let out = ts.trim().replace('T', ' ')
  // Trim fractional seconds (e.g. .123456) for display only.
  out = out.replace(/(\s\d{2}:\d{2}:\d{2})\.\d+/, '$1')
  return out
}

// ── Types ──────────────────────────────────────────────────────────

type TableRow = Record<string, unknown>

export interface EditableCellProps {
  context: CellContext<TableRow, unknown>
  columnMeta: EditableColumnMeta | undefined
  /** Disables all editing affordances for read-only rows/tables. */
  readOnly?: boolean
  getRowId: (row: TableRow, index: number) => string
}

// ── Binary/BLOB detection ──────────────────────────────────────────

const BINARY_TYPES = new Set([
  'BLOB',
  'BYTEA',
  'BINARY',
  'VARBINARY',
  'TINYBLOB',
  'MEDIUMBLOB',
  'LONGBLOB',
  'IMAGE',
])

/** Returns true when the column data type holds binary data. */
function isBinaryColumn(dataType: string | undefined): boolean {
  if (!dataType) return false
  const dt = dataType.toUpperCase()
  return BINARY_TYPES.has(dt) || dt.includes('BLOB') || dt.includes('BINARY')
}

export function EditableCell({
  context,
  columnMeta,
  readOnly = false,
  getRowId: getRowIdFn,
}: EditableCellProps) {
  const { row, column, getValue } = context
  const field = column.id
  const rawValue = getValue()
  const displayValue = valueToDisplayString(rawValue)
  // Format timestamp values
  const isTimestamp =
    columnMeta?.dataType &&
    TIMESTAMP_TYPES.has(columnMeta.dataType.toUpperCase())
  const formattedValue =
    isTimestamp && rawValue
      ? formatTimestampValue(valueToDisplayString(rawValue))
      : isTimestamp
        ? '\u200B'
        : null

  const isNull = rawValue === null || rawValue === undefined

  // Resolve stable rowId from the row context
  const rowId = getRowIdFn(row.original, row.index)

  // ── Store state ────────────────────────────────────────────────────
  const stageEdit = useTableEditStore((s) => s.stageEdit)
  const unstageEdit = useTableEditStore((s) => s.unstageEdit)
  const rowEdits = useTableEditStore((s) => s.pendingEdits[rowId])
  const pendingDeletes = useTableEditStore((s) => s.pendingDeletes)

  const isDeleted = pendingDeletes.includes(rowId)
  // Check if this specific cell has an edit, not the whole row
  const isCellDirty = rowEdits?.some((e) => e.field === field)

  // Find the staged edit for this cell
  const existingEdit = rowEdits?.find((e) => e.field === field)
  const stagedValue = existingEdit?.newValue
  const effectiveValue =
    stagedValue !== undefined ? valueToDisplayString(stagedValue) : displayValue

  // Restore grid focus to this cell after the editor closes. The view span
  // mounts on the next frame, so schedule after commit/cancel.
  const restoreCellFocus = useCallback(() => {
    requestAnimationFrame(() => containerRef.current?.focus())
  }, [])

  // ── Binary column detection ───────────────────────────────────────
  const isBinary = isBinaryColumn(columnMeta?.dataType)

  // ── Edit mode state ────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(effectiveValue)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement | HTMLSpanElement>(null)

  // Focus and select all on enter edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Enter edit mode
  const enterEditMode = () => {
    if (isDeleted) return
    if (isBinary) return // binary columns are not editable
    if (readOnly) return // read-only rows/tables cannot enter edit mode
    setEditValue(effectiveValue)
    setValidationError(null)
    setIsEditing(true)
  }

  // Listen for table:enter-edit custom event (dispatched by keyboard hook)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = () => {
      if (isDeleted) return
      if (isBinary) return // binary columns are not editable
      if (readOnly) return // read-only rows/tables cannot enter edit mode
      setEditValue(effectiveValue)
      setValidationError(null)
      setIsEditing(true)
    }
    el.addEventListener('table:enter-edit', handler)
    return () => el.removeEventListener('table:enter-edit', handler)
  }, [isDeleted, isBinary, readOnly, effectiveValue])

  // Validate, normalize, and commit edit
  const commitEdit = useCallback(() => {
    const normalized = normalizeCellValue(editValue, columnMeta)

    const error = validateCellValue(normalized, columnMeta)
    if (error) {
      setValidationError(error)
      return // don't exit edit mode — invalid values are never staged
    }

    if (valuesEqual(rawValue, normalized)) {
      // No change vs the original DB value — unstage if previously staged.
      unstageEdit(rowId, field)
    } else {
      stageEdit(rowId, field, rawValue, normalized)
    }

    setIsEditing(false)
    setValidationError(null)
    restoreCellFocus()
  }, [
    editValue,
    columnMeta,
    rawValue,
    rowId,
    field,
    stageEdit,
    unstageEdit,
    restoreCellFocus,
  ])

  // Cancel edit (revert to original). Plain function — the React Compiler
  // memoizes it; useCallback on effectiveValue broke compiler preservation.
  const cancelEdit = () => {
    setEditValue(effectiveValue)
    setIsEditing(false)
    setValidationError(null)
    restoreCellFocus()
  }

  // ── Handlers ───────────────────────────────────────────────────────
  const handleDoubleClick = () => {
    enterEditMode()
  }

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
    setValidationError(null) // clear error on new input
  }, [])
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // IME composition in progress — Enter/Escape/Tab confirm the
    // composition, they must not commit or cancel the cell edit.
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      commitEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // keep document-level Escape handlers out
      cancelEdit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commitEdit()
      // Tab will naturally move focus; the parent can handle next-cell
      // navigation via a broader handler if needed.
    } else if (e.key === 'F2') {
      e.preventDefault()
      // F2 toggles edit mode (already in edit mode, no-op)
    }
  }

  const handleBlur = useCallback(() => {
    // Commit on blur (clicking elsewhere saves the edit)
    if (isEditing) {
      commitEdit()
    }
  }, [isEditing, commitEdit])

  // ── Global key handler when not editing ────────────────────────────
  const handleGlobalKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (isEditing) return
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      enterEditMode()
    }
  }

  // ── Derived classes ────────────────────────────────────────────────
  const isInvalid = validationError != null

  const cellClasses = [
    'block min-w-0 truncate px-2 py-1.5',
    isNull && !isEditing && !stagedValue
      ? 'italic text-text-muted'
      : 'text-text-primary',
    isInvalid && isEditing && validationError ? 'ring-2 ring-red-500' : '',
    'transition-colors',
  ]
    .filter(Boolean)
    .join(' ')

  // ── Rendered when editing ─────────────────────────────────────────
  if (isEditing) {
    return (
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="relative"
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={[
            'w-full px-2 py-1.5 text-text-primary outline-none',
            'bg-bg-base border border-primary',
            isInvalid ? 'border-red-500 ring-1 ring-red-500' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-cell-editing="true"
        />
        {validationError && (
          <div
            role="tooltip"
            className="absolute left-0 top-full z-50 mt-0.5 rounded bg-red-600 px-2 py-1 text-micro text-white shadow-md"
          >
            {validationError}
          </div>
        )}
      </div>
    )
  }

  // ── Rendered when viewing ─────────────────────────────────────────
  // Binary/BLOB columns are read-only — show a [binary] marker.
  if (isBinary) {
    return (
      <span
        ref={containerRef as React.RefObject<HTMLSpanElement>}
        className="block min-w-0 truncate px-2 py-1.5 font-mono text-micro text-text-muted"
        title={`Binary data (${columnMeta?.dataType ?? 'BLOB'}) — editing disabled`}
        tabIndex={0}
        role="gridcell"
        aria-label={`${field}: binary data (not editable)`}
      >
        [binary]
      </span>
    )
  }

  // ── Rendered when read-only (no-PK table or incomplete row key) ────
  // Reduced affordance: no pointer/tab handlers, announced as read-only.
  if (readOnly) {
    return (
      <span
        className="block min-w-0 cursor-default truncate px-2 py-1.5 text-text-muted"
        title={displayValue || undefined}
        role="gridcell"
        aria-readonly="true"
        aria-label={`${field}: ${isNull ? 'NULL' : displayValue} (read-only)`}
      >
        {isNull
          ? '(null)'
          : formattedValue ||
            displayValue || <span className="text-text-muted">{'\u200B'}</span>}
      </span>
    )
  }

  return (
    <span
      ref={containerRef as React.RefObject<HTMLSpanElement>}
      className={cellClasses}
      title={
        isInvalid
          ? (validationError ?? displayValue)
          : stagedValue !== undefined
            ? `Changed: ${displayValue} → ${valueToDisplayString(stagedValue)}`
            : displayValue
      }
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleGlobalKeyDown}
      tabIndex={0}
      role="gridcell"
      aria-label={`${field}: ${isNull ? 'NULL' : displayValue}${isCellDirty ? ' (modified)' : ''}`}
    >
      {isNull
        ? '(null)'
        : stagedValue !== undefined
          ? valueToDisplayString(stagedValue)
          : formattedValue ||
            displayValue || <span className="text-text-muted">{'\u200B'}</span>}
    </span>
  )
}
