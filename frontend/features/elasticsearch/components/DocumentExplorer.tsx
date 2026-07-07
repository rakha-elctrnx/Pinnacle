import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticIndex, ElasticDocumentHit } from '../types/elasticsearch'
import {
  elasticSearchDocuments,
  elasticIndexDocument,
  elasticDeleteDocument,
} from '../clients/elasticsearch'
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  CirclePlus,
  Download,
  FileJson,
  Filter,
  Inbox,
  Plus,
  RefreshCw,
  Save,
  Search,
  Table,
  Trash2,
  X,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { Dropdown } from '../../_shared/components/ui/Dropdown'
import { ConfirmDialog } from '../../sql/components/table-cells/ConfirmDialog'
import { useColumnResizer, calculateAutoColumnWidths } from '../../sql/hooks/useColumnResizer'

// ── Constants ────────────────────────────────────────────────────────────────

const ROW_GUTTER_WIDTH = 36
const MIN_COLUMN_WIDTH = 80
const MAX_COLUMN_WIDTH = 360
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ── Filter Types ─────────────────────────────────────────────────────────────

type FilterOperator =
  | '='
  | '!='
  | 'contains'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'is_null'
  | 'is_not_null'
  | 'in'

type FilterCondition = {
  field: string
  operator: FilterOperator
  value: string
}

// ── ES Query Builder ─────────────────────────────────────────────────────────

function buildEsQueryFromFilters(filters: FilterCondition[]): unknown | undefined {
  if (filters.length === 0) return undefined

  const must: unknown[] = []
  const mustNot: unknown[] = []

  for (const f of filters) {
    switch (f.operator) {
      case '=':
        must.push({ term: { [f.field]: f.value } })
        break
      case '!=':
        mustNot.push({ term: { [f.field]: f.value } })
        break
      case 'contains':
        must.push({ wildcard: { [f.field]: { value: `*${f.value}*`, case_insensitive: true } } })
        break
      case '>':
        must.push({ range: { [f.field]: { gt: f.value } } })
        break
      case '>=':
        must.push({ range: { [f.field]: { gte: f.value } } })
        break
      case '<':
        must.push({ range: { [f.field]: { lt: f.value } } })
        break
      case '<=':
        must.push({ range: { [f.field]: { lte: f.value } } })
        break
      case 'is_null':
        mustNot.push({ exists: { field: f.field } })
        break
      case 'is_not_null':
        must.push({ exists: { field: f.field } })
        break
      case 'in': {
        const values = f.value.split(',').map((v) => v.trim())
        must.push({ terms: { [f.field]: values } })
        break
      }
    }
  }

  return {
    bool: {
      ...(must.length > 0 ? { must } : {}),
      ...(mustNot.length > 0 ? { must_not: mustNot } : {}),
    },
  }
}

function buildEsSort(column: string | null, direction: 'asc' | 'desc'): unknown | undefined {
  if (!column) return undefined
  return [{ [column]: { order: direction } }]
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface DocumentExplorerState {
  totalHits: number
  page: number
  pageSize: number
  loading: boolean
  error: string | null
  onPrevPage: () => void
  onNextPage: () => void
}

interface Props {
  connection: ConnectionPayload
  indexName: string | null
  indices: ElasticIndex[]
  onStateChange?: (state: DocumentExplorerState) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function DocumentExplorer({ connection, indexName, indices, onStateChange }: Props) {
  const [internalIndex, setInternalIndex] = useState<string | null>(null)
  const currentIndex = indexName ?? internalIndex

  // ── Document state ─────────────────────────────────────────────────────
  const [documents, setDocuments] = useState<ElasticDocumentHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchBarVisible, setSearchBarVisible] = useState(false)

  // ── View mode ──────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')

  // ── Pagination ─────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ── Filter state ───────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterCondition[]>([])
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [newFilter, setNewFilter] = useState<Partial<FilterCondition>>({
    field: '',
    operator: '=',
    value: '',
  })
  const valueInputRef = useRef<HTMLInputElement>(null)

  // ── Sort state ─────────────────────────────────────────────────────────
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // ── Selection state ────────────────────────────────────────────────────
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null)

  // ── Edit / Add state ───────────────────────────────────────────────────
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [newDocJson, setNewDocJson] = useState('{\n  \n}')
  const [editingDoc, setEditingDoc] = useState<ElasticDocumentHit | null>(null)
  const [editJson, setEditJson] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [panelHeight, setPanelHeight] = useState(250)
  const resizeRef = useRef<HTMLDivElement | null>(null)

  // ── Confirm dialog state ───────────────────────────────────────────────
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null)

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  // ── Export dropdown ────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false)

  // ── Context menu ───────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null)

  // ── Refs ────────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ── Extract source columns from documents ──────────────────────────────
  const sourceColumns = useMemo(
    () => Array.from(new Set(documents.flatMap((doc) => (doc._source ? Object.keys(doc._source) : [])))),
    [documents],
  )

  // All columns: _id + source fields
  const allColumns = useMemo(() => ['_id', ...sourceColumns], [sourceColumns])

  // ── Column widths ──────────────────────────────────────────────────────
  const displayRows = useMemo<Record<string, unknown>[]>(
    () =>
      documents.map((doc) => ({
        _id: doc._id,
        ...(doc._source ?? {}),
      })),
    [documents],
  )

  const autoColumnWidths = useMemo(
    () =>
      calculateAutoColumnWidths({
        columns: allColumns,
        previewRows: displayRows,
        columnsMetadata: allColumns.map((col) => ({
          columnName: col,
          dataType: col === '_id' ? 'keyword' : 'text',
        })),
      }),
    [allColumns, displayRows],
  )

  const { widths, onMouseDown: onResizeMouseDown, syncWidths, handleDoubleClick } = useColumnResizer({
    initialWidths: autoColumnWidths,
  })

  const boundedWidths = useMemo(
    () => widths.map((w) => Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, w))),
    [widths],
  )

  const tableWidth = useMemo(
    () => ROW_GUTTER_WIDTH + boundedWidths.reduce((sum, w) => sum + w, 0),
    [boundedWidths],
  )

  useEffect(() => {
    syncWidths(autoColumnWidths)
  }, [currentIndex, autoColumnWidths, syncWidths])

  // ── Fetch documents ────────────────────────────────────────────────────
  const fetchDocs = useCallback(
    async (idx: string, q?: string, fromOffset?: number, size?: number, query?: unknown, sort?: unknown) => {
      setLoading(true)
      setError(null)
      try {
        const result = await elasticSearchDocuments({
          connection,
          indexName: idx,
          query: query || q || undefined,
          fromOffset: fromOffset ?? 0,
          size: size ?? DEFAULT_PAGE_SIZE,
          sort: sort || undefined,
        })
        setDocuments(result.hits)
        setTotalHits(result.total)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [connection],
  )

  const refetchCurrentPage = useCallback(() => {
    if (!currentIndex) return
    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    const offset = (page - 1) * pageSize
    fetchDocs(currentIndex, searchQuery || undefined, offset, pageSize, esQuery, esSort)
  }, [currentIndex, filters, sortColumn, sortDirection, page, pageSize, searchQuery, fetchDocs])

  // Auto-fetch on index change
  const prevIndexRef = useRef<string | null>(null)
  useEffect(() => {
    if (indexName && indexName !== prevIndexRef.current) {
      prevIndexRef.current = indexName
      setPage(1)
      setSearchQuery('')
      setFilters([])
      setSortColumn(null)
      setSortDirection('asc')
      setFilterPanelOpen(false)
      setSelectedDocId(null)
      setActiveRowIndex(null)
      setEditingDoc(null)
      fetchDocs(indexName, '', 0, pageSize)
    }
  }, [indexName, fetchDocs, pageSize])

  // Refetch when page/pageSize/filters/sort changes
  const prevParamsRef = useRef({ page, pageSize, filters, sortColumn, sortDirection, searchQuery })
  useEffect(() => {
    if (!currentIndex) return
    const prev = prevParamsRef.current
    const changed =
      prev.page !== page ||
      prev.pageSize !== pageSize ||
      prev.filters !== filters ||
      prev.sortColumn !== sortColumn ||
      prev.sortDirection !== sortDirection ||
      prev.searchQuery !== searchQuery
    if (!changed) return
    prevParamsRef.current = { page, pageSize, filters, sortColumn, sortDirection, searchQuery }

    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    const offset = (page - 1) * pageSize
    fetchDocs(currentIndex, searchQuery || undefined, offset, pageSize, esQuery, esSort)
  }, [currentIndex, page, pageSize, filters, sortColumn, sortDirection, searchQuery, fetchDocs])

  // Sync state to parent
  useEffect(() => {
    onStateChange?.({
      totalHits,
      page,
      pageSize,
      loading,
      error,
      onPrevPage: () => setPage((p) => Math.max(1, p - 1)),
      onNextPage: () => setPage((p) => p + 1),
    })
  }, [totalHits, page, pageSize, loading, error, onStateChange])

  // Auto-dismiss success toasts after 4s
  useEffect(() => {
    if (!toast || toast.kind !== 'success') return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Index selection (when no indexName prop) ───────────────────────────
  const handleSelectIndex = useCallback(
    (name: string) => {
      setInternalIndex(name)
      setPage(1)
      setSearchQuery('')
      setFilters([])
      setSortColumn(null)
      setSortDirection('asc')
      fetchDocs(name, '', 0, pageSize)
    },
    [fetchDocs, pageSize],
  )

  // ── Search handler ─────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    if (!currentIndex) return
    setPage(1)
    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    fetchDocs(currentIndex, searchQuery || undefined, 0, pageSize, esQuery, esSort)
  }, [currentIndex, searchQuery, filters, sortColumn, sortDirection, pageSize, fetchDocs])

  // ── Filter handlers ────────────────────────────────────────────────────
  const handleAddFilter = useCallback(() => {
    if (!newFilter.field || !newFilter.operator) return
    const isNullOp = ['is_null', 'is_not_null'].includes(newFilter.operator)
    if (!isNullOp && !newFilter.value) return

    const next = [
      ...filters,
      {
        field: newFilter.field,
        operator: newFilter.operator as FilterOperator,
        value: (isNullOp ? '' : newFilter.value) ?? '',
      },
    ]
    setFilters(next)
    setNewFilter({ field: '', operator: '=', value: '' })
    setPage(1)
  }, [filters, newFilter])

  const handleUpdateFilter = useCallback(
    (index: number, patch: Partial<FilterCondition>) => {
      const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f))
      setFilters(next)
      setPage(1)
    },
    [filters],
  )

  const handleRemoveFilter = useCallback(
    (index: number) => {
      setFilters(filters.filter((_, i) => i !== index))
      setPage(1)
    },
    [filters],
  )

  const handleClearAllFilters = useCallback(() => {
    setFilters([])
    setNewFilter({ field: '', operator: '=', value: '' })
    setSortColumn(null)
    setSortDirection('asc')
    setSearchQuery('')
    setPage(1)
  }, [])

  // ── Sort handler ───────────────────────────────────────────────────────
  const handleSortColumn = useCallback(
    (column: string) => {
      if (sortColumn === column) {
        if (sortDirection === 'asc') {
          setSortDirection('desc')
        } else {
          setSortColumn(null)
          setSortDirection('asc')
        }
      } else {
        setSortColumn(column)
        setSortDirection('asc')
      }
      setPage(1)
    },
    [sortColumn, sortDirection],
  )

  const handleColumnFilterClick = useCallback((column: string) => {
    setFilterPanelOpen(true)
    setNewFilter((nf) => ({ ...nf, field: column }))
    setTimeout(() => valueInputRef.current?.focus(), 50)
  }, [])

  // ── Row interaction ────────────────────────────────────────────────────
  const handleRowClick = useCallback(
    (doc: ElasticDocumentHit, rowIndex: number) => {
      setSelectedDocId((prev) => (prev === doc._id ? null : doc._id))
      setActiveRowIndex((prev) => (prev === rowIndex ? null : rowIndex))
    },
    [],
  )

  const handleRowDoubleClick = useCallback((doc: ElasticDocumentHit) => {
    setSelectedDocId(doc._id)
    setEditingDoc(doc)
    setEditJson(JSON.stringify(doc._source ?? {}, null, 2))
    setEditError(null)
  }, [])

  // ── Add document ───────────────────────────────────────────────────────
  const handleAddDocument = useCallback(async () => {
    if (!currentIndex) return
    try {
      const body = JSON.parse(newDocJson)
      await elasticIndexDocument({ connection, indexName: currentIndex, document: body })
      setShowAddDoc(false)
      setNewDocJson('{\n  \n}')
      setToast({ kind: 'success', message: 'Document added successfully' })
      refetchCurrentPage()
    } catch (err) {
      setToast({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [currentIndex, newDocJson, connection, refetchCurrentPage])

  // ── Edit / Save document ───────────────────────────────────────────────
  const handleEditSelected = useCallback(() => {
    const doc = documents.find((d) => d._id === selectedDocId)
    if (!doc) return
    setEditingDoc(doc)
    setEditJson(JSON.stringify(doc._source ?? {}, null, 2))
    setEditError(null)
  }, [documents, selectedDocId])

  const handleSaveEdit = useCallback(async () => {
    if (!currentIndex || !editingDoc) return
    try {
      const body = JSON.parse(editJson)
      setSaving(true)
      setEditError(null)
      await elasticIndexDocument({ connection, indexName: currentIndex, docId: editingDoc._id, document: body })
      setEditingDoc(null)
      setEditJson('')
      setToast({ kind: 'success', message: 'Document saved successfully' })
      refetchCurrentPage()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [currentIndex, editingDoc, editJson, connection, refetchCurrentPage])

  const handleCloseEdit = useCallback(() => {
    setEditingDoc(null)
    setEditJson('')
    setEditError(null)
  }, [])

  // ── Delete document ────────────────────────────────────────────────────
  const handleDeleteDocument = useCallback((docId: string) => {
    setConfirmDeleteDocId(docId)
  }, [])

  const confirmDeleteDocument = useCallback(async () => {
    if (!currentIndex || !confirmDeleteDocId) return
    try {
      await elasticDeleteDocument({ connection, indexName: currentIndex, docId: confirmDeleteDocId })
      if (selectedDocId === confirmDeleteDocId) {
        setSelectedDocId(null)
        setActiveRowIndex(null)
      }
      setConfirmDeleteDocId(null)
      setToast({ kind: 'success', message: 'Document deleted successfully' })
      refetchCurrentPage()
    } catch (err) {
      setToast({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [currentIndex, confirmDeleteDocId, connection, selectedDocId, refetchCurrentPage])

  // ── Refresh ────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    refetchCurrentPage()
  }, [refetchCurrentPage])

  // ── Export handlers ────────────────────────────────────────────────────
  const handleExportJSON = useCallback(async () => {
    if (documents.length === 0) {
      setToast({ kind: 'error', message: 'No data to export' })
      return
    }
    const json = JSON.stringify(
      documents.map((d) => ({ _id: d._id, ...d._source })),
      null,
      2,
    )
    await navigator.clipboard.writeText(json)
    setToast({ kind: 'success', message: 'Copied JSON to clipboard' })
    setExportOpen(false)
  }, [documents])

  const handleExportCSV = useCallback(async () => {
    if (documents.length === 0) {
      setToast({ kind: 'error', message: 'No data to export' })
      return
    }
    const cols = allColumns
    const header = cols.join(',')
    const rows = documents.map((doc) => {
      const row = { _id: doc._id, ...(doc._source ?? {}) } as Record<string, unknown>
      return cols
        .map((col) => {
          const val = row[col]
          if (val == null) return ''
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val)
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(',')
    })
    await navigator.clipboard.writeText([header, ...rows].join('\n'))
    setToast({ kind: 'success', message: 'Copied CSV to clipboard' })
    setExportOpen(false)
  }, [documents, allColumns])

  // ── Context menu handlers ──────────────────────────────────────────────
  const handleContextCopyJSON = useCallback(async () => {
    if (!contextMenu) return
    const doc = documents.find((d) => d._id === contextMenu.docId)
    if (!doc) return
    await navigator.clipboard.writeText(JSON.stringify({ _id: doc._id, ...doc._source }, null, 2))
    setToast({ kind: 'success', message: 'Copied JSON to clipboard' })
    setContextMenu(null)
  }, [contextMenu, documents])

  const handleContextEdit = useCallback(() => {
    if (!contextMenu) return
    const doc = documents.find((d) => d._id === contextMenu.docId)
    if (!doc) return
    setEditingDoc(doc)
    setEditJson(JSON.stringify(doc._source ?? {}, null, 2))
    setEditError(null)
    setContextMenu(null)
  }, [contextMenu, documents])

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return
    handleDeleteDocument(contextMenu.docId)
    setContextMenu(null)
  }, [contextMenu, handleDeleteDocument])

  // ── Resize handler for edit panel ──────────────────────────────────────
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startHeight = panelHeight
      const onMouseMove = (ev: MouseEvent) => {
        const delta = startY - ev.clientY
        setPanelHeight(Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta)))
      }
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [panelHeight],
  )

  // ── No index selected ──────────────────────────────────────────────────
  if (!currentIndex) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
            <Inbox className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h3 className="text-sm font-semibold text-text-primary">No index selected</h3>
            <p className="text-xs text-text-muted">
              Navigate to the <strong>Indices</strong> tab and select an index to browse its documents.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalHits / pageSize)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
        {/* Index selector */}
        <select
          value={currentIndex}
          onChange={(e) => handleSelectIndex(e.target.value)}
          className="h-7 rounded border border-border-default bg-bg-base px-1.5 text-[11px] font-mono outline-none focus:border-primary"
        >
          {indices.map((idx) => (
            <option key={idx.index} value={idx.index}>
              {idx.index}
            </option>
          ))}
        </select>

        <span className="mx-0.5 h-5 w-px bg-border-default" />

        <ActionButton
          icon={<Filter size={14} />}
          aria-label="Toggle Filter"
          variant={filters.length > 0 ? 'active' : filterPanelOpen ? 'accent' : 'default'}
          onClick={() => setFilterPanelOpen(!filterPanelOpen)}
        />
        {filters.length > 0 && !filterPanelOpen && (
          <span className="rounded bg-primary/15 px-1 text-[10px] font-semibold text-primary leading-none">
            {filters.length}
          </span>
        )}

        <ActionButton
          icon={<Search size={14} />}
          aria-label="Toggle Search"
          variant={searchBarVisible ? 'accent' : 'default'}
          onClick={() => setSearchBarVisible(!searchBarVisible)}
        />

        <span className="mx-0.5 h-5 w-px bg-border-default" />

        <ActionButton
          icon={<CirclePlus size={14} />}
          aria-label="Add Document"
          variant="accent"
          onClick={() => setShowAddDoc(!showAddDoc)}
        />
        <ActionButton
          icon={<CircleMinus size={14} />}
          aria-label="Delete Document"
          variant="danger"
          disabled={!selectedDocId}
          onClick={() => selectedDocId && handleDeleteDocument(selectedDocId)}
        />
        <ActionButton
          icon={<RefreshCw size={14} />}
          aria-label="Refresh"
          onClick={handleRefresh}
        />

        <span className="mx-0.5 h-5 w-px bg-border-default" />

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

        <span className="ml-auto" />

        {/* Edit button when a document is selected */}
        {selectedDocId && (
          <ActionButton
            icon={<FileJson size={14} />}
            aria-label="Edit selected document"
            variant="accent"
            onClick={handleEditSelected}
          />
        )}

        {/* Export dropdown */}
        <div className="relative">
          <ActionButton
            icon={<Download size={14} />}
            aria-label="Export data"
            variant="default"
            onClick={() => setExportOpen(true)}
          />
          <Dropdown
            open={exportOpen}
            onClose={() => setExportOpen(false)}
            align="right"
            items={[
              {
                label: 'Export as CSV',
                icon: <span className="font-mono text-micro text-text-muted">CSV</span>,
                action: handleExportCSV,
              },
              {
                label: 'Export as JSON',
                icon: <span className="font-mono text-micro text-text-muted">JSON</span>,
                action: handleExportJSON,
              },
            ]}
          />
        </div>
      </div>

      {/* ── Search bar (collapsible) ──────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          searchBarVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border-default px-2 py-1">
            <Search size={13} className="shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Search documents (Elasticsearch query string)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="h-6 flex-1 bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted"
            />
            {searchQuery && (
              <button
                type="button"
                className="rounded p-0.5 text-text-muted hover:text-text-primary"
                onClick={() => {
                  setSearchQuery('')
                  setPage(1)
                }}
              >
                <X size={11} />
              </button>
            )}
            <button
              type="button"
              className="flex h-6 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              onClick={handleSearch}
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          filterPanelOpen || filters.length > 0 || sortColumn ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-b border-border-default">
            {/* Add filter row */}
            <div className="flex items-center gap-1 px-2 py-1">
              <select
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary disabled:opacity-40"
                value={newFilter.field || ''}
                onChange={(e) => setNewFilter({ ...newFilter, field: e.target.value })}
                disabled={sourceColumns.length === 0}
              >
                <option value="">Field...</option>
                {sourceColumns.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
              <select
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] outline-none focus:border-primary disabled:opacity-40"
                value={newFilter.operator || '='}
                onChange={(e) => setNewFilter({ ...newFilter, operator: e.target.value as FilterOperator })}
                disabled={!newFilter.field}
              >
                <option value="=">=</option>
                <option value="!=">!=</option>
                <option value="contains">contains</option>
                <option value=">">&gt;</option>
                <option value=">=">&gt;=</option>
                <option value="<">&lt;</option>
                <option value="<=">&lt;=</option>
                <option value="is_null">is null</option>
                <option value="is_not_null">is not null</option>
                <option value="in">in</option>
              </select>
              {!['is_null', 'is_not_null'].includes(newFilter.operator || '=') && (
                <input
                  ref={valueInputRef}
                  type="text"
                  className="h-6 w-28 min-w-0 rounded border border-border-default bg-bg-base px-1.5 text-[11px] outline-none focus:border-primary disabled:opacity-40"
                  placeholder="Value..."
                  value={newFilter.value || ''}
                  onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFilter()
                  }}
                  disabled={!newFilter.field || !newFilter.operator}
                />
              )}
              <button
                type="button"
                className="flex h-6 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:hover:bg-transparent"
                onClick={handleAddFilter}
                disabled={
                  !newFilter.field ||
                  !newFilter.operator ||
                  (!newFilter.value && !['is_null', 'is_not_null'].includes(newFilter.operator || ''))
                }
              >
                <CirclePlus size={11} />
                Add
              </button>
              {(filters.length > 0 || sortColumn) && (
                <>
                  <span className="ml-auto" />
                  <button
                    type="button"
                    className="flex h-6 items-center rounded px-1.5 text-[11px] text-text-muted transition-colors hover:text-danger"
                    onClick={handleClearAllFilters}
                  >
                    Clear all
                  </button>
                </>
              )}
            </div>

            {/* Active filters + sort chips */}
            {(filters.length > 0 || sortColumn) && (
              <div className="flex flex-wrap items-center gap-1 border-t border-border-default bg-bg-subtle px-2 py-1">
                {filters.map((filter, index) => (
                  <span
                    key={index}
                    className="group/chip inline-flex items-center gap-px rounded border border-primary/20 bg-primary/5 py-px pl-0.5 pr-0.5 text-[11px] leading-tight"
                  >
                    <Filter size={9} className="mx-0.5 shrink-0 text-primary/50" />
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] font-mono text-text-primary outline-none focus:ring-0"
                      value={filter.field}
                      onChange={(e) => handleUpdateFilter(index, { field: e.target.value })}
                    >
                      {sourceColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] text-text-muted outline-none focus:ring-0"
                      value={filter.operator}
                      onChange={(e) => {
                        const op = e.target.value as FilterOperator
                        const isNullOp = ['is_null', 'is_not_null'].includes(op)
                        handleUpdateFilter(index, { operator: op, ...(isNullOp ? { value: '' } : {}) })
                      }}
                    >
                      <option value="=">=</option>
                      <option value="!=">!=</option>
                      <option value="contains">contains</option>
                      <option value=">">&gt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<">&lt;</option>
                      <option value="<=">&lt;=</option>
                      <option value="is_null">is null</option>
                      <option value="is_not_null">is not null</option>
                      <option value="in">in</option>
                    </select>
                    {!['is_null', 'is_not_null'].includes(filter.operator) && (
                      <input
                        type="text"
                        className="h-5 w-16 min-w-0 rounded border-none bg-transparent px-0.5 text-[11px] font-medium text-primary outline-none focus:ring-0"
                        value={filter.value}
                        onChange={(e) => handleUpdateFilter(index, { value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                      />
                    )}
                    <button
                      className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/chip:opacity-100"
                      onClick={() => handleRemoveFilter(index)}
                      aria-label={`Remove filter on ${filter.field}`}
                    >
                      <X size={9} />
                    </button>
                  </span>
                ))}
                {/* Sort chip */}
                {sortColumn && (
                  <span className="group/chip inline-flex items-center gap-px rounded border border-border-default bg-bg-muted py-px pl-0.5 pr-0.5 text-[11px] leading-tight">
                    {sortDirection === 'asc' ? (
                      <ChevronUp size={10} className="mx-0.5 shrink-0 text-text-muted" />
                    ) : (
                      <ChevronDown size={10} className="mx-0.5 shrink-0 text-text-muted" />
                    )}
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] font-mono text-text-primary outline-none focus:ring-0"
                      value={sortColumn}
                      onChange={(e) => {
                        if (!e.target.value) {
                          setSortColumn(null)
                          setSortDirection('asc')
                        } else {
                          handleSortColumn(e.target.value)
                        }
                      }}
                    >
                      {sourceColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="h-5 rounded bg-transparent px-0.5 text-[11px] text-text-muted outline-none transition-colors hover:text-text-primary"
                      onClick={() => {
                        const next = sortDirection === 'asc' ? 'desc' : 'asc'
                        setSortDirection(next)
                      }}
                    >
                      {sortDirection}
                    </button>
                    <button
                      className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/chip:opacity-100"
                      onClick={() => {
                        setSortColumn(null)
                        setSortDirection('asc')
                      }}
                      aria-label="Clear sort"
                    >
                      <X size={9} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add Document Panel ─────────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          showAddDoc ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border-default bg-bg-subtle px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-primary">New Document</span>
              <button
                type="button"
                className="rounded p-0.5 text-text-muted hover:text-text-primary"
                onClick={() => setShowAddDoc(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="h-48 overflow-hidden rounded-lg border border-border-default bg-bg-base">
              <Editor
                language="json"
                value={newDocJson}
                onChange={(val) => setNewDocJson(val ?? '{\n  \n}')}
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  lineNumbers: 'on',
                  padding: { top: 8 },
                  tabSize: 2,
                }}
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={handleAddDocument}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 active:bg-primary/80"
              >
                <Plus size={12} />
                Insert
              </button>
              <button
                type="button"
                onClick={() => setShowAddDoc(false)}
                className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
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

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={[
            'pointer-events-auto fixed top-3 right-3 z-50 flex items-start gap-2 rounded-lg px-3 py-2 text-xs shadow-lg',
            toast.kind === 'success'
              ? 'border border-border-success bg-success-subtle text-success-text'
              : 'border border-border-danger bg-danger-subtle text-danger',
          ].join(' ')}
          role="alert"
        >
          <span className="flex-1">{toast.message}</span>
          {toast.kind === 'error' && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-micro font-medium text-danger hover:bg-danger/10"
              onClick={() => setToast(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading && <CenteredLoadingState loading={loading} label="Loading documents..." />}

      {/* ── Content: Table view ───────────────────────────────────────────── */}
      {!loading && viewMode === 'table' && (
        <div
          ref={scrollContainerRef}
          tabIndex={0}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default outline-none focus:ring-1 focus:ring-primary [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
        >
          <table
            role="grid"
            aria-label={`Documents in ${currentIndex}`}
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
                  const hasActiveFilter = filters.some((f) => f.field === col)
                  const isIdColumn = col === '_id'

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
                          onClick={() => !isIdColumn && handleSortColumn(col)}
                          disabled={isIdColumn}
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
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
                                  <ChevronUp size={12} className="shrink-0 text-primary" />
                                ) : (
                                  <ChevronDown size={12} className="shrink-0 text-primary" />
                                ))}
                            </div>
                            {isIdColumn && (
                              <span className="truncate text-[10px] leading-tight text-text-muted">
                                keyword
                              </span>
                            )}
                          </div>
                        </button>
                        {/* Hover actions */}
                        {!isIdColumn && (
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 bg-linear-to-l from-bg-muted from-60% to-transparent pr-1.5 pl-4 opacity-0 transition-opacity group-hover/hdr:pointer-events-auto group-hover/hdr:opacity-100">
                            <button
                              type="button"
                              className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleSortColumn(col)
                              }}
                              aria-label={
                                isSorted
                                  ? `Sort ${sortDirection === 'asc' ? 'descending' : 'clear'}`
                                  : `Sort by ${col}`
                              }
                            >
                              {isSorted ? (
                                sortDirection === 'asc' ? (
                                  <ChevronUp size={13} className="text-primary" />
                                ) : (
                                  <ChevronDown size={13} className="text-primary" />
                                )
                              ) : (
                                <ArrowUpDown size={13} />
                              )}
                            </button>
                            <button
                              type="button"
                              className={`rounded p-1 transition-colors hover:bg-bg-hover ${
                                hasActiveFilter
                                  ? 'text-primary'
                                  : 'text-text-muted hover:text-text-primary'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleColumnFilterClick(col)
                              }}
                              aria-label={
                                hasActiveFilter ? `Filter active on ${col}` : `Filter ${col}`
                              }
                            >
                              <Filter size={13} />
                            </button>
                          </div>
                        )}
                        {/* Filter dot */}
                        {hasActiveFilter && (
                          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary group-hover/hdr:hidden" />
                        )}
                        {/* Resize handle */}
                        <span
                          role="separator"
                          aria-label={`Resize ${col}`}
                          className="absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/60"
                          onMouseDown={(e) => onResizeMouseDown(columnIndex, e)}
                          onDoubleClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDoubleClick(columnIndex, displayRows, col, undefined)
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
                  <td role="gridcell" colSpan={allColumns.length + 1} className="px-2 py-0">
                    <div className="flex flex-col items-center justify-center gap-4 py-16">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
                        <Inbox className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
                      </div>
                      <div className="flex flex-col items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-text-primary">No data</h3>
                        <p className="text-xs text-text-muted">
                          {filters.length > 0 || searchQuery
                            ? 'No documents match the current filter.'
                            : 'This index is empty.'}
                        </p>
                      </div>
                      {filters.length === 0 && !searchQuery ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 active:bg-primary/80"
                          onClick={() => setShowAddDoc(true)}
                        >
                          <CirclePlus size={13} aria-hidden="true" />
                          Add Document
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-bg-base px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover active:bg-bg-muted"
                          onClick={handleClearAllFilters}
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {documents.map((doc, rowIndex) => {
                const isSelected = selectedDocId === doc._id
                const isActiveRow = activeRowIndex === rowIndex
                const src = doc._source ?? {}

                return (
                  <tr
                    key={doc._id}
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
                    onDoubleClick={() => handleRowDoubleClick(doc)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, docId: doc._id })
                    }}
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
                      <span>{(page - 1) * pageSize + rowIndex + 1}</span>
                    </td>
                    {/* Data cells */}
                    {allColumns.map((col) => {
                      const val = col === '_id' ? doc._id : src[col]
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
                            col === '_id' ? 'font-mono text-text-muted' : 'text-text-primary',
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

      {/* ── Content: JSON view ────────────────────────────────────────────── */}
      {!loading && viewMode === 'json' && (
        <div
          ref={scrollContainerRef}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default p-3 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
        >
          {documents.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
                <Inbox className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <h3 className="text-sm font-semibold text-text-primary">No data</h3>
                <p className="text-xs text-text-muted">
                  {filters.length > 0 || searchQuery
                    ? 'No documents match the current filter.'
                    : 'This index is empty.'}
                </p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc._id}
                className={[
                  'cursor-pointer select-none rounded-lg border transition-colors',
                  selectedDocId === doc._id
                    ? 'border-primary/30 bg-primary-subtle'
                    : 'border-border-default bg-bg-base hover:border-border-strong hover:bg-bg-muted/50',
                ].join(' ')}
                onClick={() => handleRowClick(doc, documents.indexOf(doc))}
                onDoubleClick={() => handleRowDoubleClick(doc)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, docId: doc._id })
                }}
              >
                <div className="flex items-center justify-between border-b border-border-default px-3 py-1.5">
                  <span className="text-[11px] font-mono text-text-muted">
                    <span className="text-primary">_id:</span> {doc._id}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditingDoc(doc)
                        setEditJson(JSON.stringify(doc._source ?? {}, null, 2))
                        setEditError(null)
                      }}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                      title="Edit document"
                    >
                      <FileJson size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteDocument(doc._id)
                      }}
                      className="rounded p-1 text-text-muted transition-colors hover:bg-red-500/10 hover:text-danger"
                      title="Delete document"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <pre className="overflow-auto whitespace-pre-wrap break-all px-3 py-2 text-xs text-text-primary max-h-32">
                  {JSON.stringify(doc._source, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pagination footer ─────────────────────────────────────────────── */}
      {totalHits > 0 && (
        <div className="flex items-center justify-between border-t border-border-default px-3 py-2">
          <span className="text-micro text-text-muted">
            {(() => {
              const start = (page - 1) * pageSize + 1
              const end = Math.min(page * pageSize, totalHits)
              return `Showing ${start}–${end} of ${totalHits.toLocaleString()} document${totalHits !== 1 ? 's' : ''}`
            })()}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-micro text-text-muted">
              Rows
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="rounded border border-border-default bg-bg-base px-1 py-0.5 text-micro text-text-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                &lsaquo;
              </button>
              <span className="text-micro text-text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-micro text-text-muted transition-colors hover:bg-bg-muted disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                &rsaquo;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Document Detail / Edit Panel ──────────────────────────────────── */}
      {editingDoc && (
        <div
          className="flex flex-col border-t border-border-default bg-bg-base"
          style={{ height: panelHeight }}
        >
          {/* Resize handle */}
          <div
            ref={resizeRef}
            onMouseDown={handleResizeMouseDown}
            className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center"
          >
            <div className="h-0.5 w-8 rounded-full bg-border-default transition-colors group-hover:bg-primary" />
          </div>
          <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-bg-subtle px-3 py-1.5">
            <div className="flex items-center gap-2">
              <FileJson size={13} className="text-primary" />
              <span className="text-xs font-medium text-text-primary">Document Detail</span>
              <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                _id: {editingDoc._id}
              </span>
              {editingDoc._index && (
                <span className="rounded bg-bg-muted px-1.5 py-0.5 text-[10px] font-mono text-text-muted">
                  _index: {editingDoc._index}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Save size={11} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCloseEdit}
                className="rounded-lg p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          {editError && (
            <div className="border-b border-border-danger bg-danger-subtle px-3 py-1 text-xs text-danger">
              {editError}
            </div>
          )}
          <div className="min-h-0 flex-1">
            <Editor
              language="json"
              value={editJson}
              onChange={(val) => setEditJson(val ?? '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                automaticLayout: true,
                lineNumbers: 'on',
                padding: { top: 8 },
                tabSize: 2,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDeleteDocId !== null}
        title="Delete document?"
        message={`Are you sure you want to delete document "${confirmDeleteDocId}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={confirmDeleteDocument}
        onCancel={() => setConfirmDeleteDocId(null)}
      />

      {/* ── Context Menu ──────────────────────────────────────────────────── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-44 rounded-xl border border-border-default bg-bg-base p-1 shadow-xl backdrop-blur-sm"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text-primary transition-colors hover:bg-primary-subtle"
              onClick={handleContextCopyJSON}
            >
              <FileJson size={14} className="text-text-muted" />
              Copy as JSON
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text-primary transition-colors hover:bg-primary-subtle"
              onClick={handleContextEdit}
            >
              <FileJson size={14} className="text-text-muted" />
              Edit Document
            </button>
            <div className="my-1 border-t border-border-default" />
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-text-primary transition-colors hover:bg-danger-subtle hover:text-danger"
              onClick={handleContextDelete}
            >
              <Trash2 size={14} className="text-text-muted" />
              Delete Document
            </button>
          </div>
        </>
      )}
    </section>
  )
}
