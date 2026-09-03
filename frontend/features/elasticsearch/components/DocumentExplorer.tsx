import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticDocumentHit } from '../types/elasticsearch'
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
  RefreshCw,
  Save,
  Search,
  Table,
  Trash2,
  X,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { useTheme } from '../../../app/theme'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { Dropdown } from '../../_shared/components/ui/Dropdown'
import { ConfirmDialog } from '../../sql/components/table-cells/ConfirmDialog'
import {
  useColumnResizer,
  calculateAutoColumnWidths,
} from '../../sql/hooks/useColumnResizer'

// ── Constants ────────────────────────────────────────────────────────────────

const ROW_GUTTER_WIDTH = 36
const MIN_COLUMN_WIDTH = 80
const MAX_COLUMN_WIDTH = 360
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ── Document drawer ──────────────────────────────────────────────────────────

type DrawerAnimState = 'entering' | 'open' | 'exiting' | 'closed'

const EMPTY_DOC_JSON = '{\n  \n}'
const DRAWER_DEFAULT_WIDTH = 420
const DRAWER_MIN_WIDTH = 280
const DRAWER_MAX_WIDTH = 600
/** Must match the drawer's `duration-150` exit transition. */
const DRAWER_EXIT_MS = 160

/** The subset of the Monaco instance the drawer touches. */
interface MonacoEditorHandle {
  focus: () => void
}

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

function buildEsQueryFromFilters(
  filters: FilterCondition[],
): unknown | undefined {
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
        must.push({
          wildcard: {
            [f.field]: { value: `*${f.value}*`, case_insensitive: true },
          },
        })
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

function buildEsSort(
  column: string | null,
  direction: 'asc' | 'desc',
): unknown | undefined {
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
  onStateChange?: (state: DocumentExplorerState) => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function DocumentExplorer({
  connection,
  indexName,
  onStateChange,
}: Props) {
  const currentIndex = indexName
  const { theme } = useTheme()

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

  // ── Document drawer state (create / edit) ──────────────────────────────
  // One slide-over drawer on the right edge serves both flows, mirroring the
  // SQL `RowDetailDrawer` shell with a full-height Monaco editor body.
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null)
  const [drawerDoc, setDrawerDoc] = useState<ElasticDocumentHit | null>(null)
  const [drawerJson, setDrawerJson] = useState(EMPTY_DOC_JSON)
  const [drawerError, setDrawerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT_WIDTH)
  const [drawerAnimState, setDrawerAnimState] =
    useState<DrawerAnimState>('closed')
  const drawerPanelRef = useRef<HTMLDivElement | null>(null)
  const drawerExitTimerRef = useRef<number | null>(null)
  const drawerDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  )

  // ── Confirm dialog state ───────────────────────────────────────────────
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(
    null,
  )

  // ── Toast ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    kind: 'success' | 'error'
    message: string
  } | null>(null)

  // ── Export dropdown ────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false)

  // ── Context menu ───────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    docId: string
  } | null>(null)

  // ── Refs ────────────────────────────────────────────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ── Extract source columns from documents ──────────────────────────────
  const sourceColumns = useMemo(
    () =>
      Array.from(
        new Set(
          documents.flatMap((doc) =>
            doc._source ? Object.keys(doc._source) : [],
          ),
        ),
      ),
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

  const {
    widths,
    onMouseDown: onResizeMouseDown,
    syncWidths,
    handleDoubleClick,
  } = useColumnResizer({
    initialWidths: autoColumnWidths,
  })

  const boundedWidths = useMemo(
    () =>
      widths.map((w) =>
        Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, w)),
      ),
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
  const buildSearchQuery = useCallback((q?: string, customQuery?: unknown) => {
    if (customQuery !== undefined && q && q.trim() !== '') {
      // Both query and search string provided — combine them
      return {
        bool: {
          must: [customQuery, { simple_query_string: { query: q } }],
        },
      }
    }
    if (customQuery !== undefined) return customQuery
    if (q && q.trim() !== '') {
      // Use simple_query_string for plain search
      return {
        simple_query_string: {
          query: q,
        },
      }
    }
    return undefined
  }, [])

  const fetchDocs = useCallback(
    async (
      idx: string,
      q?: string,
      fromOffset?: number,
      size?: number,
      query?: unknown,
      sort?: unknown,
    ) => {
      setLoading(true)
      setError(null)
      try {
        const searchQuery = buildSearchQuery(q, query)
        const result = await elasticSearchDocuments({
          connection,
          indexName: idx,
          query: searchQuery,
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
    [connection, buildSearchQuery],
  )

  const refetchCurrentPage = useCallback(() => {
    if (!currentIndex) return
    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    const offset = (page - 1) * pageSize
    fetchDocs(
      currentIndex,
      searchQuery || undefined,
      offset,
      pageSize,
      esQuery,
      esSort,
    )
  }, [
    currentIndex,
    filters,
    sortColumn,
    sortDirection,
    page,
    pageSize,
    searchQuery,
    fetchDocs,
  ])

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
      setDrawerMode(null)
      fetchDocs(indexName, '', 0, pageSize)
    }
  }, [indexName, fetchDocs, pageSize])

  // Refetch when page/pageSize/filters/sort changes
  const prevParamsRef = useRef({
    page,
    pageSize,
    filters,
    sortColumn,
    sortDirection,
    searchQuery,
  })
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
    prevParamsRef.current = {
      page,
      pageSize,
      filters,
      sortColumn,
      sortDirection,
      searchQuery,
    }

    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    const offset = (page - 1) * pageSize
    fetchDocs(
      currentIndex,
      searchQuery || undefined,
      offset,
      pageSize,
      esQuery,
      esSort,
    )
  }, [
    currentIndex,
    page,
    pageSize,
    filters,
    sortColumn,
    sortDirection,
    searchQuery,
    fetchDocs,
  ])

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

  // ── Search handler ─────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    if (!currentIndex) return
    setPage(1)
    const esQuery = buildEsQueryFromFilters(filters)
    const esSort = buildEsSort(sortColumn, sortDirection)
    fetchDocs(
      currentIndex,
      searchQuery || undefined,
      0,
      pageSize,
      esQuery,
      esSort,
    )
  }, [
    currentIndex,
    searchQuery,
    filters,
    sortColumn,
    sortDirection,
    pageSize,
    fetchDocs,
  ])

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

  // ── Document drawer: open / close / save ───────────────────────────────
  const openDrawer = useCallback(
    (mode: 'create' | 'edit', doc: ElasticDocumentHit | null) => {
      setDrawerMode(mode)
      setDrawerDoc(doc)
      setDrawerJson(
        doc ? JSON.stringify(doc._source ?? {}, null, 2) : EMPTY_DOC_JSON,
      )
      setDrawerError(null)
    },
    [],
  )

  const handleRowDoubleClick = useCallback(
    (doc: ElasticDocumentHit) => {
      setSelectedDocId(doc._id)
      openDrawer('edit', doc)
    },
    [openDrawer],
  )

  const handleEditSelected = useCallback(() => {
    const doc = documents.find((d) => d._id === selectedDocId)
    if (doc) openDrawer('edit', doc)
  }, [documents, selectedDocId, openDrawer])

  const closeDrawer = useCallback(() => {
    setDrawerAnimState('exiting')
    drawerExitTimerRef.current = window.setTimeout(() => {
      drawerExitTimerRef.current = null
      setDrawerAnimState('closed')
      setDrawerMode(null)
      setDrawerDoc(null)
      setDrawerJson(EMPTY_DOC_JSON)
      setDrawerError(null)
    }, DRAWER_EXIT_MS)
  }, [])

  const handleSaveDrawer = useCallback(async () => {
    if (!currentIndex || !drawerMode) return
    const mode = drawerMode
    const docId = mode === 'edit' ? drawerDoc?._id : undefined
    try {
      setSaving(true)
      setDrawerError(null)
      await elasticIndexDocument({
        connection,
        indexName: currentIndex,
        docId,
        document: JSON.parse(drawerJson),
      })
      closeDrawer()
      setToast({
        kind: 'success',
        message:
          mode === 'create'
            ? 'Document added successfully'
            : 'Document saved successfully',
      })
      refetchCurrentPage()
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    currentIndex,
    drawerMode,
    drawerDoc,
    drawerJson,
    connection,
    closeDrawer,
    refetchCurrentPage,
  ])

  // ── Drawer animation timeline ──────────────────────────────────────────
  // The exit timer must be cleared on unmount so a late callback never sets
  // state on a dead component.
  useEffect(() => {
    return () => {
      if (drawerExitTimerRef.current !== null) {
        window.clearTimeout(drawerExitTimerRef.current)
      }
    }
  }, [])

  // Focus the editor as soon as it mounts so typing works immediately.
  const handleDrawerEditorMount = useCallback((editor: MonacoEditorHandle) => {
    editor.focus()
  }, [])

  // Side effects derived from prop/state changes: the inner state updates are
  // the only way to drive the enter animation (same tradeoff as RowDetailDrawer).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (drawerMode === null) return
    if (drawerAnimState !== 'closed') return
    setDrawerAnimState('entering')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerAnimState('open'))
    })
  }, [drawerMode, drawerAnimState])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Drawer width drag (left edge handle) ───────────────────────────────
  useEffect(() => {
    const handleMove = (e: MouseEvent): void => {
      const drag = drawerDragRef.current
      if (!drag) return
      e.preventDefault()
      const next = drag.startWidth - (e.clientX - drag.startX)
      setDrawerWidth(
        Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, next)),
      )
    }
    const handleUp = (): void => {
      if (!drawerDragRef.current) return
      drawerDragRef.current = null
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

  const handleDrawerResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    drawerDragRef.current = { startX: e.clientX, startWidth: drawerWidth }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [drawerWidth])

  // ── Drawer dismissal: Escape + outside click ───────────────────────────
  useEffect(() => {
    if (drawerMode === null) return
    if (drawerAnimState === 'closed' || drawerAnimState === 'exiting') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      closeDrawer()
    }
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (drawerPanelRef.current?.contains(target)) return
      // Column separators and grid cells belong to the explorer, not the
      // backdrop — clicking them must not dismiss an in-progress edit.
      if (target.closest('[role="separator"]')) return
      if (target.closest('[role="grid"], [role="row"]')) return
      closeDrawer()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('click', handleClick, true)
    }
  }, [drawerMode, drawerAnimState, closeDrawer])

  const drawerJsonValid = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(drawerJson)
      return (
        parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      )
    } catch {
      return false
    }
  }, [drawerJson])

  // ── Delete document ────────────────────────────────────────────────────
  const handleDeleteDocument = useCallback((docId: string) => {
    setConfirmDeleteDocId(docId)
  }, [])

  const confirmDeleteDocument = useCallback(async () => {
    if (!currentIndex || !confirmDeleteDocId) return
    try {
      await elasticDeleteDocument({
        connection,
        indexName: currentIndex,
        docId: confirmDeleteDocId,
      })
      if (selectedDocId === confirmDeleteDocId) {
        setSelectedDocId(null)
        setActiveRowIndex(null)
      }
      setConfirmDeleteDocId(null)
      setToast({ kind: 'success', message: 'Document deleted successfully' })
      refetchCurrentPage()
    } catch (err) {
      setToast({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }, [
    currentIndex,
    confirmDeleteDocId,
    connection,
    selectedDocId,
    refetchCurrentPage,
  ])

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
      const row = { _id: doc._id, ...(doc._source ?? {}) } as Record<
        string,
        unknown
      >
      return cols
        .map((col) => {
          const val = row[col]
          if (val == null) return ''
          const str =
            typeof val === 'object' ? JSON.stringify(val) : String(val)
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
    await navigator.clipboard.writeText(
      JSON.stringify({ _id: doc._id, ...doc._source }, null, 2),
    )
    setToast({ kind: 'success', message: 'Copied JSON to clipboard' })
    setContextMenu(null)
  }, [contextMenu, documents])

  const handleContextEdit = useCallback(() => {
    if (!contextMenu) return
    const doc = documents.find((d) => d._id === contextMenu.docId)
    setContextMenu(null)
    if (doc) openDrawer('edit', doc)
  }, [contextMenu, documents, openDrawer])

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return
    handleDeleteDocument(contextMenu.docId)
    setContextMenu(null)
  }, [contextMenu, handleDeleteDocument])


  // ── No index selected ──────────────────────────────────────────────────
  if (!currentIndex) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-muted/50">
            <Inbox className="h-8 w-8 text-text-secondary" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <h3 className="text-sm font-semibold text-text-primary">
              No index selected
            </h3>
            <p className="text-xs text-text-muted">
              Navigate to the <strong>Indices</strong> tab and select an index
              to browse its documents.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalHits / pageSize)

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1">
        <ActionButton
          icon={<Filter size={14} />}
          aria-label="Toggle Filter"
          variant={
            filters.length > 0
              ? 'active'
              : filterPanelOpen
                ? 'accent'
                : 'default'
          }
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

        <ActionButton
          icon={<CirclePlus size={14} />}
          aria-label="Add Document"
          variant="accent"
          onClick={() => openDrawer('create', null)}
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
                icon: (
                  <span className="font-mono text-micro text-text-muted">
                    CSV
                  </span>
                ),
                action: handleExportCSV,
              },
              {
                label: 'Export as JSON',
                icon: (
                  <span className="font-mono text-micro text-text-muted">
                    JSON
                  </span>
                ),
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
          filterPanelOpen || filters.length > 0 || sortColumn
            ? 'grid-rows-[1fr]'
            : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-b border-border-default">
            {/* Add filter row */}
            <div className="flex items-center gap-1 px-2 py-1">
              <select
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary disabled:opacity-40"
                value={newFilter.field || ''}
                onChange={(e) =>
                  setNewFilter({ ...newFilter, field: e.target.value })
                }
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
                onChange={(e) =>
                  setNewFilter({
                    ...newFilter,
                    operator: e.target.value as FilterOperator,
                  })
                }
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
              {!['is_null', 'is_not_null'].includes(
                newFilter.operator || '=',
              ) && (
                <input
                  ref={valueInputRef}
                  type="text"
                  className="h-6 w-28 min-w-0 rounded border border-border-default bg-bg-base px-1.5 text-[11px] outline-none focus:border-primary disabled:opacity-40"
                  placeholder="Value..."
                  value={newFilter.value || ''}
                  onChange={(e) =>
                    setNewFilter({ ...newFilter, value: e.target.value })
                  }
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
                  (!newFilter.value &&
                    !['is_null', 'is_not_null'].includes(
                      newFilter.operator || '',
                    ))
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
                    <Filter
                      size={9}
                      className="mx-0.5 shrink-0 text-primary/50"
                    />
                    <select
                      className="h-5 rounded border-none bg-transparent px-0 text-[11px] font-mono text-text-primary outline-none focus:ring-0"
                      value={filter.field}
                      onChange={(e) =>
                        handleUpdateFilter(index, { field: e.target.value })
                      }
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
                        handleUpdateFilter(index, {
                          operator: op,
                          ...(isNullOp ? { value: '' } : {}),
                        })
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
                        onChange={(e) =>
                          handleUpdateFilter(index, { value: e.target.value })
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            (e.target as HTMLInputElement).blur()
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
                      <ChevronUp
                        size={10}
                        className="mx-0.5 shrink-0 text-text-muted"
                      />
                    ) : (
                      <ChevronDown
                        size={10}
                        className="mx-0.5 shrink-0 text-text-muted"
                      />
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
      {loading && (
        <CenteredLoadingState loading={loading} label="Loading documents..." />
      )}

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
                                  <ChevronUp
                                    size={13}
                                    className="text-primary"
                                  />
                                ) : (
                                  <ChevronDown
                                    size={13}
                                    className="text-primary"
                                  />
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
                                hasActiveFilter
                                  ? `Filter active on ${col}`
                                  : `Filter ${col}`
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
                            handleDoubleClick(
                              columnIndex,
                              displayRows,
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
                          {filters.length > 0 || searchQuery
                            ? 'No documents match the current filter.'
                            : 'This index is empty.'}
                        </p>
                      </div>
                      {filters.length === 0 && !searchQuery ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 active:bg-primary/80"
                          onClick={() => openDrawer('create', null)}
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
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        docId: doc._id,
                      })
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

      {/* ── Content: JSON view ────────────────────────────────────────────── */}
      {!loading && viewMode === 'json' && (
        <div
          ref={scrollContainerRef}
          className="scrollbar-thin min-h-0 flex-1 overflow-auto border border-border-default p-3 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-text-muted [&::-webkit-scrollbar-track]:bg-bg-muted"
        >
          {documents.length === 0 && (
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
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    docId: doc._id,
                  })
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
                        openDrawer('edit', doc)
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

      {/* ── Document drawer (create / edit) — right slide-over ───────────── */}
      {drawerAnimState !== 'closed' && drawerMode !== null && (
        <div className="pointer-events-none absolute inset-0 z-30 flex justify-end">
          {/* Resize handle — left edge of the drawer panel */}
          <div
            onMouseDown={handleDrawerResizeStart}
            role="separator"
            aria-label="Resize document drawer"
            className={[
              'group/handle pointer-events-auto -ml-1.5 flex shrink-0 cursor-col-resize items-center justify-center transition-opacity duration-150 ease-out',
              drawerAnimState === 'exiting' ? 'opacity-0' : 'opacity-100',
            ].join(' ')}
            style={{ width: 12 }}
          >
            <span
              aria-hidden
              className="h-10 w-0.5 rounded-full bg-border-default/40 transition-all duration-150 group-hover/handle:bg-primary/60 group-hover/handle:w-1"
            />
          </div>

          <aside
            ref={drawerPanelRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              drawerMode === 'create' ? 'New document' : 'Edit document'
            }
            tabIndex={-1}
            className={[
              'pointer-events-auto flex min-w-0 flex-col overflow-hidden border-l border-border-default bg-bg-base shadow-xl outline-none',
              'transition-[transform,opacity] duration-150 ease-out',
              drawerAnimState === 'exiting'
                ? 'translate-x-full opacity-0'
                : 'translate-x-0 opacity-100',
            ].join(' ')}
            style={{ width: drawerWidth }}
          >
            {/* Header: mode title + document identity */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-default bg-bg-subtle/50 pl-3 pr-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileJson size={13} className="shrink-0 text-primary" />
                <span className="shrink-0 text-xs font-medium text-text-primary">
                  {drawerMode === 'create' ? 'New Document' : 'Document Detail'}
                </span>
                {drawerMode === 'edit' && drawerDoc && (
                  <span className="truncate rounded bg-bg-muted px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                    _id: {drawerDoc._id}
                  </span>
                )}
              </div>
              <ActionButton
                icon={<X size={15} />}
                aria-label="Close document drawer"
                variant="default"
                onClick={closeDrawer}
                className="rounded-md p-1"
              />
            </div>

            {/* Validation / server error */}
            {drawerError && (
              <div className="shrink-0 border-b border-border-danger bg-danger-subtle px-3 py-1.5 text-xs text-danger">
                {drawerError}
              </div>
            )}

            {/* Body: Monaco editor over the whole document */}
            <div className="relative min-h-0 flex-1">
              <Editor
                height="100%"
                language="json"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                value={drawerJson}
                onChange={(val) => setDrawerJson(val ?? '')}
                onMount={handleDrawerEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 8 },
                  tabSize: 2,
                  formatOnPaste: true,
                }}
              />
            </div>

            {/* Footer: cancel + insert/save */}
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-default px-3 py-2">
              <span className="truncate text-micro text-text-muted">
                {currentIndex}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={closeDrawer}
                  className="rounded-lg border border-border-default px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDrawer}
                  disabled={saving || !drawerJsonValid}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-text-inverse transition-colors hover:bg-primary/90 active:bg-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={11} />
                  {saving
                    ? 'Saving...'
                    : drawerMode === 'create'
                      ? 'Insert'
                      : 'Save'}
                </button>
              </div>
            </div>
          </aside>
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
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
          />
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
