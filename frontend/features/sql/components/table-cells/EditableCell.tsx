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
import { Calendar, ChevronLeft, ChevronRight, Eraser } from 'lucide-react'
import {
  useTableEditStore,
  validateCellValue,
  normalizeCellValue,
  valuesEqual,
  isTimestampColumn,
  formatTimestampValue,
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

function getPickerMode(
  dataType: string | undefined,
): 'date' | 'datetime' | 'time' {
  if (!dataType) return 'datetime'
  const dt = dataType.toUpperCase()
  if (dt === 'DATE') return 'date'
  if (dt === 'TIME' || dt === 'TIME WITH TIME ZONE') return 'time'
  return 'datetime'
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const YEAR_RANGE = 12
const pad2 = (n: number): string => String(n).padStart(2, '0')

const TIME_INPUT_CLASS = [
  'w-full rounded-lg border border-border-default bg-bg-subtle px-2 py-1.5',
  'text-caption font-mono tabular-nums text-text-primary outline-none transition-colors',
  'focus:border-primary focus:ring-2 focus:ring-focus-ring',
  '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
  '[&::-webkit-calendar-picker-indicator]:opacity-60',
  'hover:[&::-webkit-calendar-picker-indicator]:opacity-100',
  'dark:[&::-webkit-calendar-picker-indicator]:invert',
].join(' ')

/**
 * MiniCalendar — custom month-grid picker styled with app tokens (the native
 * browser calendar popup cannot be themed). `value` is the full cell
 * timestamp; `onChange` receives an updated timestamp preserving
 * time-of-day and timezone offset.
 */
function MiniCalendar({
  mode,
  value,
  onChange,
}: {
  mode: 'date' | 'datetime' | 'time'
  value: string
  onChange: (ts: string) => void
}) {
  const now = new Date()

  const dateMatch = /(\d{4})-(\d{2})-(\d{2})/.exec(value)
  const selYear = dateMatch ? Number(dateMatch[1]) : now.getUTCFullYear()
  const selMonth = dateMatch ? Number(dateMatch[2]) - 1 : now.getUTCMonth()
  const selDay = dateMatch ? Number(dateMatch[3]) : 0

  const timeMatch = /(\d{2}:\d{2})(?::\d{2})?/.exec(value)
  const timeValue = timeMatch ? timeMatch[1] : ''

  let tz = ' +00:00'
  const tzMatch = value.match(/([+-]\d{2}:\d{2})$/)
  if (tzMatch) tz = ` ${tzMatch[1]}`

  // Sync the visible month with the selected date (render-time reset,
  // same pattern as Dropdown's lastOpen).
  const viewKey = `${selYear}-${selMonth}`
  const [lastViewKey, setLastViewKey] = useState(viewKey)
  const [viewYear, setViewYear] = useState(selYear)
  const [viewMonth, setViewMonth] = useState(selMonth)
  if (viewKey !== lastViewKey) {
    setLastViewKey(viewKey)
    setViewYear(selYear)
    setViewMonth(selMonth)
  }

  const buildTs = (y: number, m: number, d: number): string => {
    if (mode === 'date') return `${y}-${pad2(m + 1)}-${pad2(d)}`
    const time = timeValue ? `${timeValue}:00` : '00:00:00'
    return `${y}-${pad2(m + 1)}-${pad2(d)} ${time}.000000${tz}`
  }

  const onTimeChange = (t: string): void => {
    if (!t) return
    if (mode === 'time') {
      onChange(t.length === 5 ? `${t}:00` : t)
      return
    }
    const day =
      dateMatch?.[0] ??
      `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`
    onChange(`${day} ${t}:00.000000${tz}`)
  }

  if (mode === 'time') {
    return (
      <input
        type="time"
        value={timeValue}
        onChange={(e) => onTimeChange(e.target.value)}
        className={TIME_INPUT_CLASS}
      />
    )
  }

  const lead = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7
  const daysInMonth = new Date(
    Date.UTC(viewYear, viewMonth + 1, 0),
  ).getUTCDate()
  const todayStr = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`

  const stepMonth = (delta: number): void => {
    const m = viewMonth + delta
    if (m < 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else if (m > 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(m)
    }
  }

  return (
    <div>
      {/* Month/Year selector + navigation */}
      <div className="mb-1 flex items-center gap-0.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => stepMonth(-1)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-muted hover:text-text-primary"
          title="Bulan sebelumnya"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <select
          tabIndex={-1}
          value={viewMonth}
          onChange={(e) => setViewMonth(Number(e.target.value))}
          title="Pilih bulan"
        >
          {MONTH_LABELS.map((label, idx) => (
            <option key={label} value={idx}>
              {label}
            </option>
          ))}
        </select>

        <select
          tabIndex={-1}
          value={viewYear}
          onChange={(e) => setViewYear(Number(e.target.value))}
          className="w-16 shrink-0 cursor-pointer appearance-none rounded-md bg-transparent px-1 py-0.5 text-center text-caption font-medium tabular-nums text-text-primary outline-none transition-colors hover:bg-bg-muted focus-visible:ring-2 focus-visible:ring-focus-ring"
          title="Pilih tahun"
        >
          {Array.from({ length: YEAR_RANGE }, (_, i) => selYear - YEAR_RANGE / 2 + i).map(
            (y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ),
          )}
        </select>

        <button
          type="button"
          tabIndex={-1}
          onClick={() => stepMonth(1)}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-bg-muted hover:text-text-primary"
          title="Bulan berikutnya"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map((d) => (
          <span
            key={d}
            className="text-center text-micro font-medium text-text-muted"
          >
            {d}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="mt-0.5 grid grid-cols-7">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const isSelected =
            day === selDay && viewYear === selYear && viewMonth === selMonth
          const isToday =
            `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}` === todayStr
          return (
            <button
              key={day}
              type="button"
              tabIndex={-1}
              onClick={() => onChange(buildTs(viewYear, viewMonth, day))}
              className={[
                'mx-auto flex h-6 w-6 items-center justify-center rounded text-caption tabular-nums transition-colors',
                isSelected
                  ? 'bg-primary font-medium text-text-inverse'
                  : isToday
                    ? 'font-semibold text-primary hover:bg-bg-muted'
                    : 'text-text-primary hover:bg-bg-muted',
              ].join(' ')}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* Time (datetime mode) */}
      {mode === 'datetime' && (
        <input
          type="time"
          value={timeValue}
          onChange={(e) => onTimeChange(e.target.value)}
          className={`${TIME_INPUT_CLASS} mt-2`}
        />
      )}
    </div>
  )
}

function getPresetTimestamp(
  preset: 'now' | 'today',
  currentValStr: string,
  dataType: string | undefined,
): string {
  const now = new Date()
  const targetDate = new Date(now)

  if (preset === 'today') {
    targetDate.setUTCHours(0, 0, 0, 0)
  }

  const dt = (dataType ?? '').toUpperCase()
  if (dt === 'DATE') {
    const y = targetDate.getUTCFullYear()
    const m = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
    const d = String(targetDate.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  if (dt === 'TIME' || dt === 'TIME WITH TIME ZONE') {
    const h = String(targetDate.getUTCHours()).padStart(2, '0')
    const min = String(targetDate.getUTCMinutes()).padStart(2, '0')
    const s = String(targetDate.getUTCSeconds()).padStart(2, '0')
    return `${h}:${min}:${s}`
  }

  const year = targetDate.getUTCFullYear()
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getUTCDate()).padStart(2, '0')
  const hours = String(targetDate.getUTCHours()).padStart(2, '0')
  const mins = String(targetDate.getUTCMinutes()).padStart(2, '0')
  const secs = String(targetDate.getUTCSeconds()).padStart(2, '0')

  let tz = ' +00:00'
  if (currentValStr) {
    const tzMatch = currentValStr.match(/([+-]\d{2}:\d{2})$/)
    if (tzMatch) {
      tz = ` ${tzMatch[1]}`
    }
  }

  return `${year}-${month}-${day} ${hours}:${mins}:${secs}.000000${tz}`
}

/**
 * Shift the date component of a timestamp by `days` (negative = backward).
 * Time-of-day and timezone are preserved; falls back to UTC now when the
 * cell value is empty or unparseable.
 */
function shiftDateBy(
  tsStr: string,
  days: number,
  dataType: string | undefined,
): string {
  const dt = (dataType ?? '').toUpperCase()
  const base = /(\d{4})-(\d{2})-(\d{2})/.exec(tsStr)
  const target = new Date()
  if (base) {
    target.setUTCFullYear(Number(base[1]), Number(base[2]) - 1, Number(base[3]))
    target.setUTCHours(0, 0, 0, 0)
  }

  target.setUTCDate(target.getUTCDate() + days)

  const y = target.getUTCFullYear()
  const m = String(target.getUTCMonth() + 1).padStart(2, '0')
  const d = String(target.getUTCDate()).padStart(2, '0')

  if (dt === 'DATE') return `${y}-${m}-${d}`

  // Preserve the existing time-of-day and timezone from the original value.
  const timeMatch = /(\d{2}:\d{2}:\d{2})(\.\d+)?/.exec(tsStr)
  const time = timeMatch ? timeMatch[0] : '00:00:00.000000'
  let tz = ' +00:00'
  const tzMatch = tsStr.match(/([+-]\d{2}:\d{2})$/)
  if (tzMatch) tz = ` ${tzMatch[1]}`

  return `${y}-${m}-${d} ${time}${tz}`
}


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
  const isTimestamp = isTimestampColumn(columnMeta?.dataType)
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
    stagedValue !== undefined
      ? valueToDisplayString(stagedValue)
      : formattedValue || displayValue

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
  const [showPicker, setShowPicker] = useState(false)
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
    if (isTimestamp) {
      setShowPicker(true)
    }
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
      if (isTimestamp) {
        setShowPicker(true)
      }
    }
    el.addEventListener('table:enter-edit', handler)
    return () => el.removeEventListener('table:enter-edit', handler)
  }, [isDeleted, isBinary, readOnly, effectiveValue, isTimestamp])
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
    setShowPicker(false)
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
    setShowPicker(false)
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

  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      // If focus moves inside container (picker or preset buttons), don't exit edit mode
      if (containerRef.current?.contains(e.relatedTarget as Node)) {
        return
      }
      if (isEditing) {
        commitEdit()
      }
    },
    [isEditing, commitEdit],
  )

  // Click outside to commit edit when timestamp picker is open
  useEffect(() => {
    if (!isEditing || !isTimestamp) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        commitEdit()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, isTimestamp, commitEdit])
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
    'block min-w-0 truncate px-2 py-1.5 font-mono tabular-nums',
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
    const pickerMode = getPickerMode(columnMeta?.dataType)

    return (
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="relative flex items-center"
      >
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={[
            'w-full px-2 py-1.5 font-mono tabular-nums text-text-primary outline-none',
            isTimestamp ? 'pr-7' : '',
            'bg-bg-base border border-primary',
            isInvalid ? 'border-red-500 ring-1 ring-red-500' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-cell-editing="true"
        />

        {isTimestamp && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPicker((v) => !v)}
            className={[
              'absolute right-1 rounded p-1 transition-colors',
              showPicker
                ? 'bg-primary-subtle text-primary'
                : 'text-text-muted hover:bg-bg-muted hover:text-primary',
            ].join(' ')}
            title="Toggle Date/Time Helper"
          >
            <Calendar className="h-3.5 w-3.5" />
          </button>
        )}

        {isTimestamp && showPicker && (
          <div
            tabIndex={-1}
            className="absolute left-0 top-full z-50 mt-1 w-56 origin-top-left overflow-hidden rounded-xl border border-border-default bg-bg-base p-2 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Custom calendar */}
            <MiniCalendar
              mode={pickerMode}
              value={editValue}
              onChange={(ts) => {
                setEditValue(ts)
                setValidationError(null)
              }}
            />

            {/* Presets — single row */}
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setEditValue(
                    getPresetTimestamp('now', editValue, columnMeta?.dataType),
                  )
                  setValidationError(null)
                }}
                className="flex-1 rounded-md bg-bg-subtle px-2 py-1 text-caption text-text-primary transition-colors hover:bg-primary-subtle hover:text-primary"
              >
                Now
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setEditValue(
                    getPresetTimestamp('today', editValue, columnMeta?.dataType),
                  )
                  setValidationError(null)
                }}
                className="flex-1 rounded-md bg-bg-subtle px-2 py-1 text-caption text-text-primary transition-colors hover:bg-primary-subtle hover:text-primary"
              >
                Today
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setEditValue(
                    shiftDateBy(editValue, -1, columnMeta?.dataType),
                  )
                  setValidationError(null)
                }}
                className="rounded-md bg-bg-subtle p-1 text-text-muted transition-colors hover:bg-primary-subtle hover:text-primary"
                title="Sebelumnya (-1 hari)"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setEditValue(shiftDateBy(editValue, +1, columnMeta?.dataType))
                  setValidationError(null)
                }}
                className="rounded-md bg-bg-subtle p-1 text-text-muted transition-colors hover:bg-primary-subtle hover:text-primary"
                title="Berikutnya (+1 hari)"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {columnMeta?.isNullable && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  setEditValue('')
                  setValidationError(null)
                }}
                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-default px-2 py-1 text-caption text-text-muted transition-colors hover:border-danger hover:bg-danger-subtle hover:text-danger"
              >
                <Eraser className="h-3 w-3" />
                <span>Set NULL</span>
              </button>
            )}
          </div>
        )}

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
        className="block min-w-0 cursor-default truncate px-2 py-1.5 font-mono tabular-nums text-text-muted"
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
