/**
 * RowDetailDrawer — slide-over drawer from the right edge showing
 * column-by-column details for a single row.
 *
 * Supports:
 * - Record tab: vertical label-input form for each column
 * - Value tab: full-width Monaco Editor for the active field
 * - Bidirectional focus sync with the main table
 * - Inline editing with dirty indicators
 * - Smooth slide-in/out transitions
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Key, X } from 'lucide-react'
import Editor from '@monaco-editor/react'
import {
  useTableEditStore,
  validateCellValue,
  type EditableColumnMeta,
} from '../../store/tableEditStore'
import { useTableSelectionStore } from '../../store/tableSelectionStore'

// ── Types ──────────────────────────────────────────────────────────────────────


export type DrawerAnimState = 'entering' | 'open' | 'exiting' | 'closed'

export interface ColumnMeta {
  columnName: string
  dataType?: string
  isPrimaryKey?: boolean
  primaryKey?: boolean
  columnKey?: string
}

export interface RowDetailDrawerProps {
  open: boolean
  row: Record<string, unknown> | null
  columns: string[]
  columnsMeta: ColumnMeta[]
  rowIndex: number
  tableName?: string
  pkColumn?: string
  drawerWidth: number
  setDrawerWidth: (width: number) => void
  isResizing: boolean
  setIsResizing: (resizing: boolean) => void
  onAnimationStateChange?: (state: DrawerAnimState) => void
  onClose: () => void
}


const buildRowId = (
  row: Record<string, unknown>,
  index: number,
  tableName: string | undefined,
  pkColumn?: string,
): string => {
  const candidateId = (row as Record<string, unknown>)['__rowId']
  if (typeof candidateId === 'string' && candidateId.startsWith('__insert__')) {
    return candidateId
  }
  if (pkColumn) {
    const pkValue = row[pkColumn]
    if (pkValue != null && pkValue !== '') {
      return `${tableName ?? 'tbl'}-${String(pkValue)}`
    }
  }
  return `${tableName ?? 'tbl'}-${index}`
}
function getEditorLanguage(dataType: string | undefined): string {
  if (!dataType) return 'plaintext'
  const dt = dataType.toUpperCase()
  if (dt.includes('JSON')) return 'json'
  if (dt.includes('SQL')) return 'sql'
  if (dt.includes('XML')) return 'xml'
  return 'plaintext'
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RowDetailDrawer({
  open,
  row,
  columns,
  columnsMeta,
  rowIndex,
  tableName,
  pkColumn,
  drawerWidth,
  setDrawerWidth,
  setIsResizing,
  onAnimationStateChange,
  onClose,
}: RowDetailDrawerProps) {
  // ── Animation state ──────────────────────────────────────────────────
  const [animState, setAnimState] = useState<DrawerAnimState>(
    open ? 'open' : 'closed',
  )
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleClose = useCallback(() => {
    setAnimState('exiting')
    animTimerRef.current = setTimeout(() => {
      setAnimState('closed')
      onClose()
    }, 160)
  }, [onClose])

  // Side effects derived from prop changes. keep as effect; the inner state
  // update is the only way to drive the animation timeline.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && animState === 'closed') {
      setAnimState('entering')
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimState('open'))
      })
    }
    if (!open && animState === 'open') {
      handleClose()
    }
  }, [open, animState, handleClose])
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    onAnimationStateChange?.(animState)
  }, [animState, onAnimationStateChange])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current)
        animTimerRef.current = null
      }
    }
  }, [])

  const panelRef = useRef<HTMLDivElement>(null)

  // (name column resize removed; drawer uses a fixed two-column layout)

  // ── Resize state refs (drawer width driven by props) ────────────────
  const DRAWER_MIN_WIDTH = 280
  const DRAWER_MAX_WIDTH = 600
  const drawerDraggingRef = useRef(false)
  const drawerStartXRef = useRef(0)
  const drawerStartWidthRef = useRef(0)
  const setDrawerWidthRef = useRef(setDrawerWidth)
  // Mirror latest setDrawerWidth so the global mousemove listener can read it
  // without re-binding the listener every prop change (refs ≠ state).
  useLayoutEffect(() => {
    setDrawerWidthRef.current = setDrawerWidth
  })

  // ── Mousemove/mouseup listener for drawer resize handle ──────────
  useEffect(() => {
    const handleMove = (e: MouseEvent): void => {
      if (!drawerDraggingRef.current) return
      e.preventDefault()
      const cx = e.clientX
      const d = cx - drawerStartXRef.current
      const newWidth = Math.max(
        DRAWER_MIN_WIDTH,
        Math.min(DRAWER_MAX_WIDTH, drawerStartWidthRef.current - d),
      )
      setDrawerWidthRef.current(newWidth)
    }

    const handleUp = (): void => {
      if (!drawerDraggingRef.current) return
      drawerDraggingRef.current = false
      setIsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [setIsResizing])

  // ── Resize start handlers ──────────────────────────────────────────
  const handleDrawerResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      drawerDraggingRef.current = true
      drawerStartXRef.current = e.clientX
      drawerStartWidthRef.current = drawerWidth
      setIsResizing(true)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [drawerWidth, setIsResizing],
  )

  // ── Tab and focus state ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'record' | 'value'>('record')
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // ── Edit store ──────────────────────────────────────────────────────
  const rowId = row
    ? buildRowId(row, rowIndex, tableName, pkColumn)
    : ''
  const pendingEdits = useTableEditStore((s) => s.pendingEdits)
  const stageEdit = useTableEditStore((s) => s.stageEdit)
  const rowEdits = rowId ? pendingEdits[rowId] : undefined

  // ── Selection store ─────────────────────────────────────────────────
  const activeCell = useTableSelectionStore((s) => s.activeCell)
  const selectSingle = useTableSelectionStore((s) => s.selectSingle)

  // ── Column metadata lookup ──────────────────────────────────────────
  const metaMap = useCallback(
    (col: string): ColumnMeta | undefined =>
      columnsMeta.find((m) => m.columnName === col),
    [columnsMeta],
  )

  // ── EditableColumnMeta lookup for validation ────────────────────────
  const editableMetaMap = useMemo(() => {
    const map: Record<string, EditableColumnMeta> = {}
    for (const col of columnsMeta) {
      map[col.columnName] = {
        columnName: col.columnName,
        dataType: col.dataType ?? '',
        isNullable: true,
        maxLength: null,
      }
    }
    return map
  }, [columnsMeta])

  // ── Get effective value for a field ─────────────────────────────────
  const getEffectiveValue = useCallback(
    (field: string): unknown => {
      const existingEdit = rowEdits?.find((e) => e.field === field)
      if (existingEdit !== undefined) return existingEdit.newValue
      return row ? row[field] : undefined
    },
    [rowEdits, row],
  )

  const getOriginalValue = useCallback(
    (field: string): unknown => (row ? row[field] : undefined),
    [row],
  )

  // ── Bidirectional focus sync ────────────────────────────────────────

  // Table → Drawer: when activeCell changes, focus the corresponding input.
  // setFocusedField here is required to keep the local highlight in sync with
  // the external selection state from the table.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open || !activeCell) return
    if (activeCell.rowIndex !== rowIndex) return
    setFocusedField(activeCell.columnId)
    if (activeTab === 'record') {
      requestAnimationFrame(() => {
        const inputEl = document.getElementById(
          `drawer-field-${activeCell.columnId}`,
        ) as HTMLInputElement | HTMLSelectElement | null
        if (inputEl && document.activeElement !== inputEl) {
          inputEl.focus()
        }
      })
    }
  }, [open, activeCell, rowIndex, activeTab])

  // Auto-focus first field when drawer opens
  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => {
      const targetCol = activeCell?.rowIndex === rowIndex
        ? activeCell.columnId
        : columns[0]
      if (!targetCol) return
      setFocusedField(targetCol)
      if (!activeCell || activeCell.rowIndex !== rowIndex || activeCell.columnId !== targetCol) {
        selectSingle({ rowIndex, columnId: targetCol })
      }
      if (activeTab === 'record') {
        const inputEl = document.getElementById(`drawer-field-${targetCol}`)
        if (inputEl) inputEl.focus()
      }
    })
    // Only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Input handlers ──────────────────────────────────────────────────

  const handleInputFocus = useCallback(
    (colName: string) => {
      setFocusedField(colName)
      if (activeCell?.rowIndex !== rowIndex || activeCell?.columnId !== colName) {
        selectSingle({ rowIndex, columnId: colName })
      }
    },
    [rowIndex, activeCell, selectSingle],
  )

  const handleInputChange = useCallback(
    (field: string, rawValue: string) => {
      const meta = editableMetaMap[field]
      const originalValue = getOriginalValue(field)

      // Type-aware conversion
      let newValue: unknown = rawValue
      if (rawValue === '' && meta?.isNullable) {
        newValue = null
      } else if (meta?.dataType && ['BOOLEAN', 'BOOL'].includes(meta.dataType.toUpperCase())) {
        if (rawValue === 'true') newValue = true
        else if (rawValue === 'false') newValue = false
        else if (rawValue === '') newValue = null
      }

      stageEdit(rowId, field, originalValue, newValue)
    },
    [rowId, editableMetaMap, getOriginalValue, stageEdit],
  )

  // ── Monaco Editor for Value tab ─────────────────────────────────────
  const editorRef = useRef<unknown>(null)

  const handleEditorMount = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco editor instance type from @monaco-editor/react
    (editorInstance: any) => {
      editorRef.current = editorInstance
      editorInstance.focus()
    },
    [],
  )

  const handleMonacoChange = useCallback(
    (val: string | undefined) => {
      if (!focusedField || !row) return
      const meta = editableMetaMap[focusedField]
      const originalValue = getOriginalValue(focusedField)
      let newValue: unknown = val ?? ''
      if (newValue === '' && meta?.isNullable) {
        newValue = null
      }
      stageEdit(rowId, focusedField, originalValue, newValue)
    },
    [focusedField, row, rowId, editableMetaMap, getOriginalValue, stageEdit],
  )

  const monacoValue = useMemo(() => {
    if (!focusedField) return ''
    const val = getEffectiveValue(focusedField)
    if (val === null || val === undefined) return ''
    return String(val)
  }, [focusedField, getEffectiveValue])

  // ── Escape key closes the drawer ────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, handleClose])

  // ── Document click: close on outside click, but not table cells ─────
  useEffect(() => {
    if (!open) return
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      // Inside the drawer panel → ignore
      if (panelRef.current?.contains(target)) return

      // Resize handle → ignore
      if (target.closest('[role="separator"]')) return

      // Inside the table grid container → ignore
      const gridEl = document.querySelector('[role="grid"]')
      const tableContainer = gridEl?.parentElement
      if (tableContainer?.contains(target)) return

      // Outside the drawer and outside the table → close
      handleClose()
    }
    // Use capture to intercept before React handlers
    document.addEventListener('click', handleDocumentClick, true)
    return () => document.removeEventListener('click', handleDocumentClick, true)
  }, [open, handleClose])

  if (animState === 'closed') return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end pointer-events-none">
      {/* ── Resize handle — left edge of drawer panel ─────────────────── */}
      <div
        onMouseDown={handleDrawerResizeStart}

        role="separator"
        className={[
          'group/handle pointer-events-auto flex shrink-0 cursor-col-resize items-center justify-center -ml-1.5 transition-opacity duration-150 ease-out',
          animState === 'exiting' ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
        style={{ width: 12 }}
      >
        <span
          aria-hidden
          className="h-10 w-0.5 rounded-full bg-border-default/40 transition-all duration-150 group-hover/handle:bg-primary/60 group-hover/handle:w-1"
        />
      </div>

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Row ${rowIndex + 1} details`}
        tabIndex={-1}
        className={[
          'pointer-events-auto flex min-w-0 flex-col overflow-hidden border-l border-border-default bg-bg-base shadow-xl outline-none',
          'transition-[transform,opacity] duration-150 ease-out',
          animState === 'exiting' ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100',
        ].join(' ')}
        style={{ width: drawerWidth }}
      >
        {/* ── Header with tabs ────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-bg-subtle/50 px-3 py-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate text-sm font-semibold text-text-primary leading-tight">
              Row {rowIndex + 1}
            </h3>
            <p className="truncate text-[11px] text-text-muted leading-tight">
              {Object.keys(row ?? {}).length} columns
            </p>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="ml-2 rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-hover hover:text-primary active:scale-95"
            aria-label="Close detail drawer"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className="flex shrink-0 border-b border-border-default bg-bg-subtle/30 px-3">
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className={[
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === 'record'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            Record
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('value')}
            className={[
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              activeTab === 'value'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            ].join(' ')}
          >
            Value
          </button>
        </div>

        {/* ── Record tab: scrollable field list ───────────────────────── */}
        {activeTab === 'record' && (
          <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-transparent">
            {row && columns.map((col) => {
              const meta = metaMap(col)
              const isPK = meta?.isPrimaryKey === true
              const effectiveValue = getEffectiveValue(col)
              const existingEdit = rowEdits?.find((e) => e.field === col)
              const isDirty = existingEdit !== undefined
              const isFocused = focusedField === col
              const valStr =
                effectiveValue === null || effectiveValue === undefined
                  ? ''
                  : String(effectiveValue)
              const metaDt = meta?.dataType?.toUpperCase()
              const isBoolean = metaDt === 'BOOLEAN' || metaDt === 'BOOL'
              const isNullable = editableMetaMap[col]?.isNullable ?? true

              return (
                <div
                  key={col}
                  className={[
                    'border-b border-border-default/40 px-3 py-2 flex flex-col gap-1 transition-colors',
                    isFocused ? 'bg-primary/5' : '',
                    isDirty ? 'bg-yellow-500/[0.07]' : '',
                  ].join(' ')}
                >
                  {/* Label row */}
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor={`drawer-field-${col}`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary select-none"
                    >
                      {isPK && (
                        <span className="text-primary/70" aria-label="Primary key">
                          <Key size={10} />
                        </span>
                      )}
                      <span className={isPK ? 'text-primary' : ''}>
                        {col}
                      </span>
                    </label>
                    {meta?.dataType && (
                      <span className="text-[10px] text-text-muted/70 font-mono">
                        {meta.dataType.toLowerCase()}
                      </span>
                    )}
                  </div>

                  {/* Validation error */}
                  {isDirty && (() => {
                    const err = validateCellValue(
                      existingEdit.newValue,
                      editableMetaMap[col],
                    )
                    return err ? (
                      <p className="text-[10px] text-error leading-tight">
                        {err}
                      </p>
                    ) : null
                  })()}

                  {/* Input */}
                  {isBoolean ? (
                    <select
                      id={`drawer-field-${col}`}
                      value={valStr}
                      onFocus={() => handleInputFocus(col)}
                      onChange={(e) => handleInputChange(col, e.target.value)}
                      className={[
                        'w-full rounded border px-2 py-1.5 text-xs outline-none transition-all',
                        'bg-bg-base border-border-default focus:border-primary focus:ring-1 focus:ring-primary',
                        isDirty
                          ? 'bg-yellow-50 dark:bg-yellow-950/25 border-yellow-500/40 focus:border-yellow-500 focus:ring-yellow-500'
                          : '',
                      ].join(' ')}
                    >
                      <option value="">
                        {isNullable ? 'NULL' : 'Select…'}
                      </option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      id={`drawer-field-${col}`}
                      type="text"
                      value={valStr}
                      onFocus={() => handleInputFocus(col)}
                      onChange={(e) => handleInputChange(col, e.target.value)}
                      className={[
                        'w-full rounded border px-2 py-1.5 text-xs outline-none transition-all',
                        'bg-bg-base border-border-default focus:border-primary focus:ring-1 focus:ring-primary',
                        isDirty
                          ? 'bg-yellow-50 dark:bg-yellow-950/25 border-yellow-500/40 focus:border-yellow-500 focus:ring-yellow-500'
                          : '',
                      ].join(' ')}
                      placeholder={isNullable ? 'NULL' : ''}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Value tab: Monaco Editor ────────────────────────────────── */}
        {activeTab === 'value' && focusedField && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-border-default bg-bg-subtle px-3 py-1.5">
              <span className="text-[11px] text-text-muted">
                Editing field:{' '}
                <strong className="text-text-primary">{focusedField}</strong>
              </span>
              {metaMap(focusedField)?.dataType && (
                <span className="rounded border border-border-default bg-bg-base px-1.5 py-0.5 font-mono text-micro">
                  {metaMap(focusedField)?.dataType?.toLowerCase()}
                </span>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <Editor
                height="100%"
                language={getEditorLanguage(metaMap(focusedField)?.dataType)}
                theme="vs-dark"
                value={monacoValue}
                onChange={handleMonacoChange}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        )}

        {/* ── Value tab fallback when no field is focused ─────────────── */}
        {activeTab === 'value' && !focusedField && (
          <div className="flex flex-1 items-center justify-center px-3 py-6">
            <p className="text-xs text-text-muted italic">
              Select a field in the Record tab to edit its value here.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}
