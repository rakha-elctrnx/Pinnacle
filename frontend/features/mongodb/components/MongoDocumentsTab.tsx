import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  CirclePlus,
  FileJson,
  Inbox,
  Play,
  RefreshCw,
  Search,
  Table,
  X,
} from 'lucide-react'
import { useTheme } from '../../../app/theme'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { MongoFindResult } from '../types/mongodb'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import {
  MAX_COL_WIDTH,
  MIN_COL_WIDTH,
  calculateAutoColumnWidths,
  useColumnResizer,
} from '../../sql/hooks/useColumnResizer'
import {
  mongoFindDocuments,
  mongoInsertDocument,
  mongoUpdateDocument,
  mongoDeleteDocument,
} from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

const ROW_GUTTER_WIDTH = 36

export function MongoDocumentsTab({ payload, database, collection }: Props) {
  const [filterText, setFilterText] = useState('{}')
  const [filterBarVisible, setFilterBarVisible] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [results, setResults] = useState<MongoFindResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | 'new'>('view')
  const [drawerJson, setDrawerJson] = useState('')

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null)

  // ── Sort state ──────────────────────────────────────────────────────────
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  /** Core fetch — takes an already-parsed filter so callers control staleness. */
  const fetchDocs = useCallback(
    async (filter: Record<string, unknown>, sort?: Record<string, unknown>) => {
      if (!payload) return
      setError(null)
      setLoading(true)
      try {
        const res = await mongoFindDocuments({
          connection: payload,
          database,
          collection,
          filter,
          ...(sort ? { sort } : {}),
          offset: 0,
          pageSize: 50,
        })
        setResults(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [payload, database, collection],
  )

  const parseFilterText = (): Record<string, unknown> | null => {
    try {
      return filterText.trim() ? JSON.parse(filterText) : {}
    } catch (e) {
      setError(
        `Invalid JSON filter: ${e instanceof Error ? e.message : String(e)}`,
      )
      return null
    }
  }

  const currentSortSpec = () =>
    sortColumn ? { [sortColumn]: sortDirection === 'asc' ? 1 : -1 } : undefined

  const executeFind = () => {
    const filter = parseFilterText()
    if (filter === null) return
    void fetchDocs(filter, currentSortSpec())
  }

  const handleSortColumn = (col: string) => {
    let nextCol: string | null
    let nextDir: 'asc' | 'desc'
    if (sortColumn !== col) {
      nextCol = col
      nextDir = 'asc'
    } else if (sortDirection === 'asc') {
      nextCol = col
      nextDir = 'desc'
    } else {
      nextCol = null
      nextDir = 'asc'
    }
    setSortColumn(nextCol)
    setSortDirection(nextDir)
    const filter = parseFilterText()
    if (filter === null) return
    void fetchDocs(
      filter,
      nextCol ? { [nextCol]: nextDir === 'asc' ? 1 : -1 } : undefined,
    )
  }

  const hasActiveFilters =
    (filterText.trim() !== '' && filterText.trim() !== '{}') ||
    sortColumn !== null

  const handleClearAllFilters = () => {
    setFilterText('{}')
    setSortColumn(null)
    setSortDirection('asc')
    void fetchDocs({}, undefined)
  }

  const handleOpenInsert = () => {
    setSelectedDoc(null)
    setDrawerJson('{\n  \n}')
    setDrawerMode('new')
  }

  const handleOpenEdit = (doc: Record<string, unknown>) => {
    setSelectedDoc(doc)
    setDrawerJson(JSON.stringify(doc, null, 2))
    setDrawerMode('edit')
  }

  const handleSaveDrawer = async () => {
    if (!payload) return
    try {
      const parsed = JSON.parse(drawerJson)
      if (drawerMode === 'new') {
        await mongoInsertDocument({
          connection: payload,
          database,
          collection,
          document: parsed,
        })
      } else if (drawerMode === 'edit' && selectedDoc) {
        await mongoUpdateDocument({
          connection: payload,
          database,
          collection,
          filter: { _id: selectedDoc._id },
          replacement: parsed,
        })
      }
      setSelectedDoc(null)
      executeFind()
    } catch (e) {
      setError(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDelete = async (doc: Record<string, unknown>) => {
    if (!payload || !doc._id) return
    if (!confirm('Are you sure you want to delete this document?')) return
    try {
      await mongoDeleteDocument({
        connection: payload,
        database,
        collection,
        filter: { _id: doc._id },
        limitOne: true,
      })
      if (selectedDocId === docKey(doc)) {
        setSelectedDocId(null)
        setActiveRowIndex(null)
      }
      executeFind()
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDeleteSelected = () => {
    const doc = documents.find(
      (d) => selectedDocId !== null && docKey(d) === selectedDocId,
    )
    if (doc) void handleDelete(doc)
  }

  const { documents, allColumns, autoColumnWidths } = useMemo(() => {
    const docs = results?.documents ?? []
    // Column union across rows, `_id` pinned first (mirrors the Elastic explorer).
    const seen = new Set<string>()
    const cols: string[] = []
    for (const doc of docs) {
      for (const key of Object.keys(doc)) {
        if (!seen.has(key)) {
          seen.add(key)
          cols.push(key)
        }
      }
    }
    const columns = ['_id', ...cols.filter((c) => c !== '_id')]
    const widths = calculateAutoColumnWidths({
      columns,
      previewRows: docs,
      columnsMetadata: columns.map((col) => ({
        columnName: col,
        dataType: col === '_id' ? 'keyword' : 'text',
      })),
    })
    return { documents: docs, allColumns: columns, autoColumnWidths: widths }
  }, [results])

  const {
    widths,
    onMouseDown: onResizeMouseDown,
    handleDoubleClick,
  } = useColumnResizer({
    initialWidths: autoColumnWidths,
  })

  const boundedWidths = useMemo(
    () =>
      widths.map((w) => Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, w))),
    [widths],
  )

  const tableWidth = useMemo(
    () => ROW_GUTTER_WIDTH + boundedWidths.reduce((sum, w) => sum + w, 0),
    [boundedWidths],
  )

  // Refetch when the target namespace changes (mirrors Elastic explorer).
  const prevNsRef = useRef<{ ns: string; fetchDocs: typeof fetchDocs } | null>(
    null,
  )
  useEffect(() => {
    const ns = `${database}/${collection}`
    const prev = prevNsRef.current
    if (!prev || prev.ns !== ns || prev.fetchDocs !== fetchDocs) {
      prevNsRef.current = { ns, fetchDocs }
      void fetchDocs({}, undefined)
    }
  }, [database, collection, fetchDocs])

  // ── Row interaction ─────────────────────────────────────────────────────
  /**
   * Stable per-document key. Relaxed Extended JSON renders an ObjectId as
   * `{ "$oid": "…" }`, so a plain String(doc._id) collapses every row to the
   * same `"[object Object]"` — extract `$oid` (or stringify other shapes).
   */
  const docKey = (doc: Record<string, unknown>): string => {
    const id = doc._id
    if (id == null) return ''
    if (typeof id === 'string') return id
    if (typeof id === 'object' && id !== null && '$oid' in id) {
      return String((id as Record<string, unknown>).$oid)
    }
    return JSON.stringify(id)
  }

  const handleRowClick = (doc: Record<string, unknown>, rowIndex: number) => {
    const id = docKey(doc)
    setSelectedDocId((prev) => (prev === id ? null : id))
    setActiveRowIndex((prev) => (prev === rowIndex ? null : rowIndex))
  }

  /** Double click opens the edit drawer for the row's document. */
  const handleRowDoubleClick = (
    doc: Record<string, unknown>,
    rowIndex: number,
  ) => {
    setSelectedDocId(docKey(doc))
    setActiveRowIndex(rowIndex)
    handleOpenEdit(doc)
  }

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1">
        <ActionButton
          icon={<Search size={14} />}
          aria-label="Toggle Filter"
          variant={filterBarVisible ? 'accent' : 'default'}
          onClick={() => setFilterBarVisible(!filterBarVisible)}
        />

        <span className="mx-0.5 h-5 w-px shrink-0 bg-border-default" />

        <ActionButton
          icon={<Play size={14} />}
          aria-label="Find"
          variant="accent"
          disabled={loading}
          onClick={executeFind}
        />
        <ActionButton
          icon={
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          }
          aria-label="Refresh"
          disabled={loading}
          onClick={executeFind}
        />

        <span className="mx-0.5 h-5 w-px shrink-0 bg-border-default" />

        <ActionButton
          icon={<CirclePlus size={14} />}
          aria-label="Insert Document"
          variant="accent"
          onClick={handleOpenInsert}
        />
        <ActionButton
          icon={<CircleMinus size={14} />}
          aria-label="Delete Document"
          variant="danger"
          disabled={!selectedDocId}
          onClick={handleDeleteSelected}
        />

        <span className="ml-auto" />

        {/* View mode toggle */}
        <div className="flex items-center overflow-hidden rounded-lg border border-border-default">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`p-1.5 transition-colors ${
              viewMode === 'table'
                ? 'bg-bg-muted text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Table view"
          >
            <Table size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('json')}
            className={`p-1.5 transition-colors ${
              viewMode === 'json'
                ? 'bg-bg-muted text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="JSON view"
          >
            <FileJson size={13} />
          </button>
        </div>
      </div>

      {/* ── Filter bar (collapsible) ─────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          filterBarVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border-default px-2 py-1">
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') executeFind()
              }}
              placeholder='{ "key": "value" }'
              className="h-6 flex-1 bg-transparent font-mono text-[11px] text-text-primary outline-none placeholder:text-text-muted"
            />
            <button
              type="button"
              className="flex h-6 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              onClick={executeFind}
            >
              Find
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-border-danger bg-danger-subtle px-3 py-1.5 text-xs text-danger">
          <span className="truncate">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-micro font-medium text-danger hover:bg-danger/10"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Loading ──────────────────────────────────────────────────── */}
      {loading && (
        <CenteredLoadingState loading={loading} label="Loading documents..." />
      )}

      {/* ── Content: Table view ──────────────────────────────────────── */}
      {!loading && viewMode === 'table' && (
        <div
          tabIndex={0}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default outline-none focus:ring-1 focus:ring-primary [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
        >
          <table
            role="grid"
            aria-label={`Documents in ${collection}`}
            className="min-w-full border-collapse text-xs"
            style={{ tableLayout: 'fixed', width: tableWidth }}
          >
            <colgroup>
              <col style={{ width: ROW_GUTTER_WIDTH }} />
              {boundedWidths.map((w, i) => (
                <col key={`col-${allColumns[i] ?? i}`} style={{ width: w }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-20 bg-bg-muted text-text-muted shadow-[0_1px_0_0_var(--color-border-default)]">
              <tr role="row">
                <th
                  role="columnheader"
                  className="sticky left-0 z-30 border-b border-r border-border-default bg-bg-muted px-0 py-0.5"
                />
                {allColumns.map((col, columnIndex) => {
                  const isSorted = sortColumn === col

                  return (
                    <th
                      key={col}
                      role="columnheader"
                      className="group relative border-b border-r border-border-default bg-bg-muted px-0 py-0 text-left whitespace-nowrap"
                    >
                      <div className="group/hdr relative flex min-w-0 items-center overflow-hidden">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-2 text-left"
                          onClick={() => handleSortColumn(col)}
                        >
                          <div className="flex min-w-0 items-center gap-1">
                            <span
                              className={`truncate text-xs leading-tight ${
                                isSorted
                                  ? 'font-semibold text-text-primary'
                                  : 'font-medium text-text-secondary'
                              }`}
                            >
                              {col}
                            </span>
                            {isSorted &&
                              (sortDirection === 'asc' ? (
                                <ChevronUp
                                  size={12}
                                  className="shrink-0 text-primary"
                                />
                              ) : (
                                <ChevronDown
                                  size={12}
                                  className="shrink-0 text-primary"
                                />
                              ))}
                          </div>
                        </button>
                        {/* Hover sort hint */}
                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1.5 pl-4 opacity-0 transition-opacity group-hover/hdr:opacity-100">
                          <ArrowUpDown size={13} className="text-text-muted" />
                        </span>
                        {/* Resize handle */}
                        <span
                          role="separator"
                          aria-label={`Resize ${col}`}
                          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/60"
                          onMouseDown={(e) => onResizeMouseDown(columnIndex, e)}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDoubleClick(
                              columnIndex,
                              documents,
                              col,
                              undefined,
                            )
                          }}
                        />
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr role="row">
                  <td
                    role="gridcell"
                    colSpan={allColumns.length + 1}
                    className="px-2 py-0"
                  >
                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
                        <Inbox
                          className="h-8 w-8 text-text-secondary"
                          strokeWidth={1.5}
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-text-primary">
                          No data
                        </h3>
                        <p className="text-xs text-text-muted">
                          {hasActiveFilters
                            ? 'No documents match the current filter.'
                            : 'This collection is empty.'}
                        </p>
                      </div>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-base px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover active:bg-bg-muted"
                          onClick={handleClearAllFilters}
                        >
                          Clear Filters
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 active:bg-primary/80"
                          onClick={handleOpenInsert}
                        >
                          <CirclePlus size={13} aria-hidden="true" />
                          Insert Document
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {documents.map((doc, rowIndex) => {
                const isSelected = selectedDocId === docKey(doc)
                const isActiveRow = activeRowIndex === rowIndex

                return (
                  <tr
                    key={docKey(doc) || rowIndex}
                    role="row"
                    className={[
                      'text-text-primary transition-colors cursor-pointer select-none',
                      isActiveRow ? 'bg-primary-subtle' : '',
                      isSelected && !isActiveRow ? 'bg-selection-bg' : '',
                      !isActiveRow && !isSelected ? 'hover:bg-bg-muted/70' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleRowClick(doc, rowIndex)}
                    onDoubleClick={() => handleRowDoubleClick(doc, rowIndex)}
                  >
                    {/* Row gutter */}
                    <td
                      role="gridcell"
                      className={[
                        'sticky left-0 z-10 border-b border-r border-border-default p-0 text-center text-micro select-none',
                        isActiveRow || isSelected
                          ? 'bg-primary-subtle text-primary'
                          : 'bg-bg-base text-text-muted',
                      ].join(' ')}
                    >
                      <span>{rowIndex + 1}</span>
                    </td>
                    {/* Data cells */}
                    {allColumns.map((col) => {
                      const val = doc[col]
                      const display =
                        val == null
                          ? ''
                          : typeof val === 'object'
                            ? JSON.stringify(val)
                            : String(val)

                      return (
                        <td
                          key={col}
                          role="gridcell"
                          className={[
                            'overflow-hidden border-b border-r border-border-default px-2 py-1.5 text-xs whitespace-nowrap text-ellipsis select-none',
                            col === '_id'
                              ? 'font-mono text-text-muted'
                              : 'text-text-primary',
                            isActiveRow ? 'text-primary' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          title={display}
                        >
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Content: JSON view ───────────────────────────────────────── */}
      {!loading && viewMode === 'json' && (
        <div className="flex-1 overflow-auto p-4">
          {documents.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-xs text-text-muted">
              No documents found matching filter
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {documents.map((doc, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-bg-subtle border border-border-default rounded-lg relative group"
                >
                  <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenEdit(doc)}
                      className="px-2 py-1 bg-bg-muted hover:bg-bg-hover text-success rounded text-[10px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete(doc)}
                      className="px-2 py-1 bg-bg-muted hover:bg-bg-hover text-danger rounded text-[10px]"
                    >
                      Delete
                    </button>
                  </div>
                  <pre className="text-success-text overflow-x-auto">
                    {JSON.stringify(doc, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MongoDocumentDrawer
        key={drawerMode}
        open={drawerMode !== 'view'}
        mode={drawerMode}
        documentJson={drawerJson}
        onDocumentJsonChange={setDrawerJson}
        onSave={() => void handleSaveDrawer()}
        onClose={() => setDrawerMode('view')}
      />
    </div>
  )
}

// ── Document drawer (SQL RowDetailDrawer pattern) ──────────────────────────────

type DrawerAnimState = 'entering' | 'open' | 'exiting' | 'closed'

const DRAWER_MIN_WIDTH = 280
const DRAWER_MAX_WIDTH = 600

interface MongoDocumentDrawerProps {
  open: boolean
  mode: 'view' | 'edit' | 'new'
  documentJson: string
  onDocumentJsonChange: (json: string) => void
  onSave: () => void
  onClose: () => void
}

/**
 * MongoDocumentDrawer — slide-over editor for a single MongoDB document.
 *
 * Mirrors the SQL `RowDetailDrawer` UX:
 * - enter/exit animation with translate-x
 * - draggable width on the left edge
 * - Escape / outside-click to close
 *
 * The body is a single Monaco editor over the whole document JSON.
 */
function MongoDocumentDrawer({
  open,
  mode,
  documentJson,
  onDocumentJsonChange,
  onSave,
  onClose,
}: MongoDocumentDrawerProps) {
  const { theme } = useTheme()
  const isInsert = mode === 'new'

  // ── Animation state ────────────────────────────────────────────────
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

  // Side effects derived from prop changes; the inner state update drives
  // the animation timeline (same tradeoff as RowDetailDrawer).
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
    return () => {
      if (animTimerRef.current !== null) {
        clearTimeout(animTimerRef.current)
        animTimerRef.current = null
      }
    }
  }, [])

  // ── Resize state refs (drawer width, local) ─────────────────────────
  const [drawerWidth, setDrawerWidth] = useState(420)
  const panelRef = useRef<HTMLDivElement>(null)
  const drawerDraggingRef = useRef(false)
  const drawerStartXRef = useRef(0)
  const drawerStartWidthRef = useRef(0)

  useEffect(() => {
    const handleMove = (e: MouseEvent): void => {
      if (!drawerDraggingRef.current) return
      e.preventDefault()
      const d = e.clientX - drawerStartXRef.current
      const next = Math.max(
        DRAWER_MIN_WIDTH,
        Math.min(DRAWER_MAX_WIDTH, drawerStartWidthRef.current - d),
      )
      setDrawerWidth(next)
    }
    const handleUp = (): void => {
      if (!drawerDraggingRef.current) return
      drawerDraggingRef.current = false
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

  const handleDrawerResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      drawerDraggingRef.current = true
      drawerStartXRef.current = e.clientX
      drawerStartWidthRef.current = drawerWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [drawerWidth],
  )

  // ── Document JSON validity ──────────────────────────────────────────
  const isJsonValid = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(documentJson)
      return (
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      )
    } catch {
      return false
    }
  }, [documentJson])

  // ── Monaco Editor ───────────────────────────────────────────────────
  const handleEditorMount = useCallback((instance: unknown) => {
    interface MonacoEditorLike {
      focus: () => void
    }
    ;(instance as MonacoEditorLike).focus()
  }, [])

  // ── Escape closes the drawer (unless an input handled it first) ─────
  useEffect(() => {
    if (!open || animState === 'closed' || animState === 'exiting') return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')
      ) {
        return
      }
      e.stopPropagation()
      handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, animState, handleClose])

  // ── Outside click closes (ignore panel + resize handle) ────────────
  useEffect(() => {
    if (!open || animState === 'closed' || animState === 'exiting') return
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (panelRef.current?.contains(target)) return
      if (target.closest('[role="separator"]')) return
      handleClose()
    }
    document.addEventListener('click', handleDocumentClick, true)
    return () =>
      document.removeEventListener('click', handleDocumentClick, true)
  }, [open, animState, handleClose])

  if (animState === 'closed') return null

  return (
    <div className="absolute inset-0 z-30 flex justify-end pointer-events-none">
      {/* ── Resize handle — left edge of drawer panel ───────────────── */}
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
        aria-label={isInsert ? 'Insert document' : 'Edit document'}
        tabIndex={-1}
        className={[
          'pointer-events-auto flex min-w-0 flex-col overflow-hidden border-l border-border-default bg-bg-base shadow-xl outline-none',
          'transition-[transform,opacity] duration-150 ease-out',
          animState === 'exiting'
            ? 'translate-x-full opacity-0'
            : 'translate-x-0 opacity-100',
        ].join(' ')}
        style={{ width: drawerWidth }}
      >
        {/* ── Header: title + close ──────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-bg-subtle/50 pl-3 pr-2">
          <span className="text-xs font-semibold text-text-primary">
            {isInsert ? 'Insert Document' : 'Edit Document'}
          </span>
          <ActionButton
            icon={<X size={15} />}
            aria-label="Close detail drawer"
            variant="default"
            onClick={handleClose}
            className="rounded-md p-1"
          />
        </div>

        {/* ── Invalid JSON notice ────────────────────────────────────── */}
        {!isJsonValid && (
          <div className="shrink-0 border-b border-border-danger bg-danger-subtle px-3 py-1.5 text-xs text-danger">
            Document JSON is invalid — fix it before saving.
          </div>
        )}

        {/* ── Full-document Monaco editor ────────────────────────────── */}
        <div className="relative min-h-0 flex-1">
          <Editor
            height="100%"
            language="json"
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            value={documentJson}
            onChange={(val) => onDocumentJsonChange(val ?? '')}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              formatOnPaste: true,
            }}
          />
        </div>

        {/* ── Footer actions ──────────────────────────────────────────── */}
        <div className="flex shrink-0 justify-end gap-2 border-t border-border-default px-3 py-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded bg-bg-muted px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!isJsonValid}
            className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </aside>
    </div>
  )
}
