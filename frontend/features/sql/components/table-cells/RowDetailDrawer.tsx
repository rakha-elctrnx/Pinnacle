/**
 * RowDetailDrawer — slide-over drawer from the right edge showing
 * column-by-column details for a single row.
 *
 * Compact, clean, dark-mode-first, matching Pinnacle's design tokens.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

type TableRow = Record<string, unknown>

export interface ColumnMeta {
  columnName: string
  dataType?: string
  isPrimaryKey?: boolean
  primaryKey?: boolean
  columnKey?: string
}

export interface RowDetailDrawerProps {
  open: boolean
  row: TableRow | null
  columns: string[]
  columnsMeta: ColumnMeta[]
  rowIndex: number
  onClose: () => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────


const TIMESTAMP_TYPES: Record<string, true> = {
  DATE: true,
  DATETIME: true,
  TIMESTAMP: true,
  TIMESTAMPTZ: true,
  'TIMESTAMP WITH TIME ZONE': true,
  'TIMESTAMP WITHOUT TIME ZONE': true,
}

/** Format a timestamp value for display. */
function formatTimestampValue(ts: string): string {
  try {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    }
    return ts
  } catch {
    return ts
  }
}

/** Render a cell value as a display string. */
function formatCellValue(
  raw: unknown,
  dataType: string | undefined,
): { text: string; isNull: boolean; isTimestamp: boolean } {
  if (raw === null || raw === undefined) return { text: 'NULL', isNull: true, isTimestamp: false }

  const str = String(raw)

  if (dataType && TIMESTAMP_TYPES[dataType.toUpperCase()]) {
    return { text: formatTimestampValue(str), isNull: false, isTimestamp: true }
  }

  return { text: str, isNull: false, isTimestamp: false }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function RowDetailDrawer({
  open,
  row,
  columns,
  columnsMeta,
  rowIndex,
  onClose,
}: RowDetailDrawerProps) {
  // ── Animation state ──────────────────────────────────────────────────
  const [animState, setAnimState] = useState<'entering' | 'open' | 'exiting' | 'closed'>(
    open ? 'open' : 'closed',
  )
  const animTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const handleClose = useCallback(() => {
    setAnimState('exiting')
    animTimerRef.current = setTimeout(() => {
      setAnimState('closed')
      onClose()
    }, 160)
  }, [onClose])

  // Sync `open` prop → enter
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(animTimerRef.current)
  }, [])

  const panelRef = useRef<HTMLDivElement>(null)

  // ── Resize state (drawer width) ──────────────────────────────────────
  const DRAWER_MIN_WIDTH = 280
  const DRAWER_MAX_WIDTH = 600
  const [drawerWidth, setDrawerWidth] = useState(340)
  const drawerDraggingRef = useRef(false)
  const drawerStartXRef = useRef(0)
  const drawerStartWidthRef = useRef(0)
  const setDrawerWidthRef = useRef(setDrawerWidth)
  setDrawerWidthRef.current = setDrawerWidth

  // ── Resize state (name column split) ───────────────────────────────
  const NAME_COL_MIN = 100
  const NAME_COL_MAX = 320
  const [nameColWidth, setNameColWidth] = useState(120)
  const colDraggingRef = useRef(false)
  const colStartXRef = useRef(0)
  const colStartWidthRef = useRef(0)
  const setNameColWidthRef = useRef(setNameColWidth)
  setNameColWidthRef.current = setNameColWidth

  // ── Combined mousemove/mouseup listeners ───────────────────────────
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const cx = e.clientX

      if (drawerDraggingRef.current) {
        e.preventDefault()
        const d = cx - drawerStartXRef.current
        const newWidth = Math.max(
          DRAWER_MIN_WIDTH,
          Math.min(DRAWER_MAX_WIDTH, drawerStartWidthRef.current - d),
        )
        setDrawerWidthRef.current(newWidth)
        return
      }

      if (colDraggingRef.current) {
        e.preventDefault()
        const d = cx - colStartXRef.current
        const newWidth = Math.max(
          NAME_COL_MIN,
          Math.min(NAME_COL_MAX, colStartWidthRef.current + d),
        )
        setNameColWidthRef.current(newWidth)
      }
    }

    const handleUp = () => {
      if (!drawerDraggingRef.current && !colDraggingRef.current) return
      drawerDraggingRef.current = false
      colDraggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [])

  // ── Resize start handlers ──────────────────────────────────────────
  const handleDrawerResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    drawerDraggingRef.current = true
    drawerStartXRef.current = e.clientX
    drawerStartWidthRef.current = drawerWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [drawerWidth])

  const handleColResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    colDraggingRef.current = true
    colStartXRef.current = e.clientX
    colStartWidthRef.current = nameColWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [nameColWidth])

  // Escape key closes the drawer
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Auto-focus the close button when drawer opens
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        panelRef.current?.focus()
      })
    }
  }, [open])

  // Build a quick column metadata lookup
  const metaMap = useCallback(
    (col: string): ColumnMeta | undefined =>
      columnsMeta.find((m) => m.columnName === col),
    [columnsMeta],
  )
  if (animState === 'closed') return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end pointer-events-none">
      {/* Click-to-close area */}
      <div className="pointer-events-auto flex-1" onClick={handleClose} />

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
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-bg-subtle/50 px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="truncate text-sm font-semibold text-text-primary leading-tight">
              Row {rowIndex + 1}
            </h3>
            <p className="truncate text-[11px] text-text-muted leading-tight">
              {Object.keys(row).length} columns
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

        {/* ── Body — scrollable field list ────────────────────────────── */}
        <div className="scrollbar-thin flex-1 overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-transparent">
          <table className="w-full table-fixed border-collapse text-xs">
            <tbody>
              {columns.map((col) => {
                const meta = metaMap(col)
                const raw = row[col]
                const { text, isNull, isTimestamp } = formatCellValue(
                  raw,
                  meta?.dataType,
                )
                const isPK = meta?.isPrimaryKey === true
                const isBinary =
                  meta?.dataType &&
                  ['BLOB', 'BINARY', 'VARBINARY', 'BYTEA', 'IMAGE'].includes(
                    meta.dataType.toUpperCase(),
                  )

                return (
                  <tr
                    key={col}
                    className="border-b border-border-default/40 transition-colors last:border-b-0 hover:bg-bg-subtle/30"
                  >
                    {/* Column name */}
                    <td
                      className="relative min-w-0 border-r border-border-default/30 px-2.5 py-2 align-top"
                      style={{ width: nameColWidth }}
                    >
                      <div className="flex items-center gap-1">
                        {isPK && (
                          <span className="text-primary/60" aria-label="Primary key">
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="shrink-0"
                            >
                              <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                            </svg>
                          </span>
                        )}
                        <span
                          className={`truncate font-medium leading-snug ${isPK ? 'text-primary' : 'text-text-secondary'}`}
                          title={col}
                        >
                          {col}
                        </span>
                      </div>
                      {meta?.dataType && (
                        <span className="mt-0.5 block truncate text-[10px] leading-tight text-text-muted/70">
                          {meta.dataType.toLowerCase()}
                        </span>
                      )}
                      {/* ── Column resize handle ── */}
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        tabIndex={-1}
                        onMouseDown={handleColResizeStart}
                        className="group/handle absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors hover:bg-primary/60"
                      />
                    </td>

                    {/* Value */}
                    <td className="min-w-0 px-2.5 py-2 align-top">
                      <CopyableValue
                        text={text}
                        isNull={isNull}
                        isBinary={!!isBinary}
                        isTimestamp={isTimestamp}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Footer hint ────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border-default bg-bg-subtle/50 px-3 py-1.5 text-[10px] text-text-muted/60 text-center">
          Click a value to copy &middot; Esc to close
        </div>

      </aside>
    </div>
  )
}

// ── Sub-component: click-to-copy value ──────────────────────────────────────────

function CopyableValue({
  text,
  isNull,
  isBinary,
  isTimestamp,
}: {
  text: string
  isNull: boolean
  isBinary: boolean
  isTimestamp: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard API not available — silently ignore
    }
  }, [text])

  if (isNull) {
    return (
      <span className="inline-flex items-center italic text-text-muted/50 font-mono text-[11px]">
        NULL
      </span>
    )
  }

  if (isBinary) {
    return (
      <span className="font-mono text-[10px] text-text-muted/60 italic">
        [binary]
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={isTimestamp ? text : text}
      className={[
        'group/value relative w-full min-w-0 rounded px-1 -mx-1 py-0.5 text-left transition-colors',
        isTimestamp
          ? 'font-mono text-[11px] text-text-primary'
          : 'text-xs text-text-primary',
        'hover:bg-bg-hover/60',
      ].join(' ')}
    >
      <span className="min-w-0 truncate whitespace-pre-wrap break-all leading-snug">
        {isTimestamp ? (
          <time dateTime={text} className="whitespace-nowrap">
            {text}
          </time>
        ) : (
          text
        )}
      </span>
      {/* ── Floating copy indicator ── */}
      <span className="pointer-events-none absolute right-0 top-0 flex h-full items-center pl-3 opacity-0 transition-opacity group-hover/value:opacity-100 bg-gradient-to-l from-bg-base via-bg-base/90 to-transparent">
        {copied ? (
          <span className="text-[10px] font-medium text-success">Copied!</span>
        ) : (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-text-muted"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </span>
    </button>
  )
}
