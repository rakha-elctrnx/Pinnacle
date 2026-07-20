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

/** Format timestamp string to readable format */
function formatTimestampValue(ts: string): string {
  // Try parsing as ISO date first
  let date: Date | null = null

  // Handle ISO format: 2024-01-15T10:30:45.123Z or 2024-01-15T10:30:45+07:00
  if (ts.includes('T')) {
    date = new Date(ts)
  }
  // Handle PostgreSQL/MySQL format: 2024-01-15 10:30:45.123456+07 or 2024-01-15 10:30:45
  else if (ts.match(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/)) {
    // Remove timezone and microseconds for parsing
    const cleanTs = ts
      .replace(/\.\d+/, '')
      .replace(/[+-]\d{2}:?\d{2}$/, '')
      .trim()
    date = new Date(cleanTs)
  }
  // Handle date only: 2024-01-15
  else if (ts.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(ts)
  }

  if (date && !isNaN(date.getTime())) {
    // For DATE type, show only date part
    if (ts.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return date.toISOString().substring(0, 10) // YYYY-MM-DD
    }
    // For time types, show time with date
    return date.toISOString().replace('T', ' ').substring(0, 19)
  }

  // If parsing fails, return original
  return ts
}

// ── Types ──────────────────────────────────────────────────────────

type TableRow = Record<string, unknown>

export interface EditableCellProps {
  context: CellContext<TableRow, unknown>
  columnMeta: EditableColumnMeta | undefined
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

// ── Component ───────────────────────────────────────────────────────

export function EditableCell({
  context,
  columnMeta,
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
        ? '&#8203;'
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

  // Show staged value if present, otherwise original value
  const effectiveValue =
    stagedValue !== undefined ? valueToDisplayString(stagedValue) : displayValue

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
  const enterEditMode = useCallback(() => {
    if (isDeleted) return
    if (isBinary) return // binary columns are not editable
    setEditValue(effectiveValue)
    setValidationError(null)
    setIsEditing(true)
  }, [isDeleted, isBinary, effectiveValue])

  // Listen for table:enter-edit custom event (dispatched by keyboard hook)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = () => enterEditMode()
    el.addEventListener('table:enter-edit', handler)
    return () => el.removeEventListener('table:enter-edit', handler)
  }, [enterEditMode])

  // Validate and commit edit
  const commitEdit = useCallback(() => {
    let newValue: unknown = editValue

    // If value is empty and column is nullable → treat as null
    if (editValue === '' && columnMeta?.isNullable) {
      newValue = null
    }

    // Validate
    if (editValue !== '' || !columnMeta?.isNullable) {
      const error = validateCellValue(newValue, columnMeta)
      if (error) {
        setValidationError(error)
        return // don't exit edit mode
      }
    }

    // Compare with original value
    const originalRaw =
      rawValue === null || rawValue === undefined ? null : valueToDisplayString(rawValue)
    const newRaw = newValue === null ? null : valueToDisplayString(newValue)

    if (newRaw !== originalRaw) {
      stageEdit(rowId, field, rawValue, newValue)
    } else {
      // No change — unstage if previously staged
      unstageEdit(rowId, field)
    }

    setIsEditing(false)
    setValidationError(null)
  }, [editValue, columnMeta, rawValue, rowId, field, stageEdit, unstageEdit])

  // Cancel edit (revert to original)
  const cancelEdit = useCallback(() => {
    setEditValue(effectiveValue)
    setIsEditing(false)
    setValidationError(null)
  }, [effectiveValue])

  // ── Handlers ───────────────────────────────────────────────────────
  const handleDoubleClick = useCallback(() => {
    enterEditMode()
  }, [enterEditMode])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
    setValidationError(null) // clear error on new input
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
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
    },
    [commitEdit, cancelEdit],
  )

  const handleBlur = useCallback(() => {
    // Commit on blur (clicking elsewhere saves the edit)
    if (isEditing) {
      commitEdit()
    }
  }, [isEditing, commitEdit])

  // ── Global key handler when not editing ────────────────────────────
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent<HTMLSpanElement>) => {
      if (isEditing) return
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault()
        enterEditMode()
      }
    },
    [isEditing, enterEditMode],
  )

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
            displayValue || <span className="text-text-muted">&#8203;</span>}
    </span>
  )
}
