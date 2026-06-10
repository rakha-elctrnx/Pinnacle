import { useState, useCallback, useEffect, useRef } from 'react'
import type { ConnectionPayload } from '../../../../../services/tauriClient'
import type { ElasticIndex, ElasticDocumentHit } from '../../../../../types/domain'
import {
  elasticSearchDocuments,
  elasticIndexDocument,
  elasticDeleteDocument,
} from '../../../../../services/tauriClient'
import { Search, Plus, Trash2, RefreshCw, FileJson, Table, X, Save } from 'lucide-react'
import Editor from '@monaco-editor/react'

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
  /** Callback to sync pagination state to parent for WorkspaceStatusBar */
  onStateChange?: (state: DocumentExplorerState) => void
}

export function DocumentExplorer({ connection, indexName, indices, onStateChange }: Props) {
  const [internalIndex, setInternalIndex] = useState<string | null>(null)
  const currentIndex = indexName ?? internalIndex
  const [documents, setDocuments] = useState<ElasticDocumentHit[]>([])
  const [totalHits, setTotalHits] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [page, setPage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showAddDoc, setShowAddDoc] = useState(false)
  const [newDocJson, setNewDocJson] = useState('{\n  \n}')
  const [editingDoc, setEditingDoc] = useState<ElasticDocumentHit | null>(null)
  const [editJson, setEditJson] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [panelHeight, setPanelHeight] = useState(250)
  const resizeRef = useRef<HTMLDivElement | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null)
  const pageSize = 30

  const fetchDocs = useCallback(async (idx: string, q?: string, from?: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await elasticSearchDocuments({
        connection,
        indexName: idx,
        query: q || undefined,
        fromOffset: from ?? 0,
        size: pageSize,
      })
      setDocuments(result.hits)
      setTotalHits(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [connection])

  // Auto-fetch documents when the indexName prop changes (including first mount)
  const prevIndexRef = useRef<string | null>(null)
  useEffect(() => {
    if (indexName && indexName !== prevIndexRef.current) {
      prevIndexRef.current = indexName
      setPage(0)
      setSearchQuery('')
      fetchDocs(indexName, '', 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexName])

  const handleSelectIndex = useCallback((name: string) => {
    setInternalIndex(name)
    setPage(0)
    setSearchQuery('')
    fetchDocs(name, '', 0)
  }, [fetchDocs])

  const handleSearch = useCallback(() => {
    if (!currentIndex) return
    setPage(0)
    fetchDocs(currentIndex, searchQuery, 0)
  }, [currentIndex, searchQuery, fetchDocs])

  const handlePageChange = useCallback((newPage: number) => {
    if (!currentIndex) return
    setPage(newPage)
    fetchDocs(currentIndex, searchQuery, newPage * pageSize)
  }, [currentIndex, searchQuery, fetchDocs])

  // Sync pagination state to parent for WorkspaceStatusBar
  useEffect(() => {
    onStateChange?.({
      totalHits,
      page,
      pageSize,
      loading,
      error,
      onPrevPage: () => handlePageChange(page - 1),
      onNextPage: () => handlePageChange(page + 1),
    })
  }, [totalHits, page, pageSize, loading, error, onStateChange, handlePageChange])

  const handleAddDocument = useCallback(async () => {
    if (!currentIndex) return
    setActionError(null)
    try {
      const body = JSON.parse(newDocJson)
      await elasticIndexDocument({ connection, indexName: currentIndex, document: body })
      setShowAddDoc(false)
      setNewDocJson('{\n  \n}')
      fetchDocs(currentIndex, searchQuery, page * pageSize)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [currentIndex, newDocJson, connection, fetchDocs, searchQuery, page])

  const selectedDoc = documents.find((doc) => doc._id === selectedDocId) ?? null

  const handleRowClick = useCallback((doc: ElasticDocumentHit) => {
    setSelectedDocId((prev) => (prev === doc._id ? null : doc._id))
  }, [])

  const handleRowDoubleClick = useCallback((doc: ElasticDocumentHit) => {
    setSelectedDocId(doc._id)
    setEditingDoc(doc)
    setEditJson(JSON.stringify(doc._source ?? {}, null, 2))
    setEditError(null)
  }, [])

  const handleEditSelected = useCallback(() => {
    if (!selectedDoc) return
    setEditingDoc(selectedDoc)
    setEditJson(JSON.stringify(selectedDoc._source ?? {}, null, 2))
    setEditError(null)
  }, [selectedDoc])

  const handleSaveEdit = useCallback(async () => {
    if (!currentIndex || !editingDoc) return
    try {
      const body = JSON.parse(editJson)
      setSaving(true)
      setEditError(null)
      await elasticIndexDocument({ connection, indexName: currentIndex, docId: editingDoc._id, document: body })
      setEditingDoc(null)
      setEditJson('')
      fetchDocs(currentIndex, searchQuery, page * pageSize)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [currentIndex, editingDoc, editJson, connection, fetchDocs, searchQuery, page])

  const handleCloseEdit = useCallback(() => {
    setEditingDoc(null)
    setEditJson('')
    setEditError(null)
  }, [])

  // Resize handler for the detail panel
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = panelHeight

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta))
      setPanelHeight(newHeight)
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
  }, [panelHeight])

  const handleDeleteDocument = useCallback((docId: string) => {
    if (!currentIndex) return
    setConfirmDeleteDoc(docId)
  }, [currentIndex])

  const confirmDeleteDocument = useCallback(async () => {
    if (!currentIndex || !confirmDeleteDoc) return
    setActionError(null)
    try {
      await elasticDeleteDocument({ connection, indexName: currentIndex, docId: confirmDeleteDoc })
      if (selectedDocId === confirmDeleteDoc) setSelectedDocId(null)
      setConfirmDeleteDoc(null)
      fetchDocs(currentIndex, searchQuery, page * pageSize)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }, [currentIndex, confirmDeleteDoc, connection, fetchDocs, searchQuery, page, selectedDocId])

  // Extract level-1 field names from all documents as columns
  const sourceColumns = Array.from(
    new Set(documents.flatMap((doc) => (doc._source ? Object.keys(doc._source) : []))),
  )

  if (!currentIndex) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5 bg-white">
          <h3 className="text-xs font-semibold text-slate-700">Select an index to browse documents</h3>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-0.5">
          {indices.map((idx) => (
            <button
              key={idx.index}
              onClick={() => handleSelectIndex(idx.index)}
              className="flex items-center gap-2 w-full rounded-md border border-transparent px-2.5 py-1.5 text-left transition-colors hover:border-slate-200 hover:bg-slate-50"
            >
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${idx.health === 'green' ? 'bg-emerald-500' : idx.health === 'yellow' ? 'bg-amber-400' : 'bg-red-500'}`} />
              <span className="text-xs text-slate-700 font-mono overflow-hidden text-ellipsis whitespace-nowrap">{idx.index}</span>
              <span className="text-[10px] text-slate-400 ml-auto font-mono">{idx['docs.count'] ?? '0'} docs</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <select
            value={currentIndex}
            onChange={(e) => handleSelectIndex(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-blue-400 focus:outline-none"
          >
            {indices.map((idx) => (
              <option key={idx.index} value={idx.index}>{idx.index}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-56 rounded-md border border-slate-200 bg-white pl-7 pr-2.5 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleSearch}
            title="Search"
            className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)]"
          >
            <Search size={13} />
          </button>
          <div className="flex items-center rounded-md border border-slate-200 overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`p-1 transition-all ${
                viewMode === 'table'
                  ? 'bg-slate-100 text-slate-700'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Table size={13} />
            </button>
            <button
              onClick={() => setViewMode('json')}
              title="JSON view"
              className={`p-1 transition-all ${
                viewMode === 'json'
                  ? 'bg-slate-100 text-slate-700'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <FileJson size={13} />
            </button>
          </div>
          <div className="mx-1.5 h-3.5 w-px bg-slate-200" />
          <button
            onClick={() => setShowAddDoc(!showAddDoc)}
            title="Add document"
            className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 hover:shadow-[inset_0_0_0_1px_theme(colors.slate.200)]"
          >
            <Plus size={13} />
          </button>
          {selectedDoc && (
            <>
              <div className="mx-1.5 h-3.5 w-px bg-slate-200" />
              <button
                onClick={handleEditSelected}
                title="Edit selected document"
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-[inset_0_0_0_1px_theme(colors.emerald.200)]"
              >
                <FileJson size={13} />
              </button>
              <button
                onClick={() => handleDeleteDocument(selectedDoc._id)}
                title="Delete selected document"
                className="rounded-md p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-[inset_0_0_0_1px_theme(colors.red.200)]"
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action error banner */}
      {actionError && (
        <div className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-600">
          <span className="truncate">{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Delete document confirmation */}
      {confirmDeleteDoc && (
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
          <span>Delete document <code className="font-mono">{confirmDeleteDoc}</code>?</span>
          <div className="flex items-center gap-1">
            <button
              onClick={confirmDeleteDocument}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-white bg-red-500 hover:bg-red-600"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmDeleteDoc(null)}
              className="rounded px-2 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create document form */}
      {showAddDoc && (
        <div className="flex flex-col gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50">
          <div className="h-48 rounded-md border border-slate-200 bg-white overflow-hidden">
            <Editor
              language="json"
              value={newDocJson}
              onChange={(val) => setNewDocJson(val ?? '{\n  \n}')}
              theme="light"
              options={{
                fontSize: 12,
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
              onClick={handleAddDocument}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
            >
              Insert
            </button>
            <button
              onClick={() => setShowAddDoc(false)}
              className="rounded-md px-2.5 py-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border-b border-red-200">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-xs">Loading documents...</span>
          </div>
        ) : viewMode === 'table' ? (
          <table
            className="w-full border-collapse text-xs"
            style={{ tableLayout: 'auto' }}
          >
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_0_theme(colors.slate.200)]">
              <tr className="text-left text-slate-600">
                <th className="border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap">
                  _id
                </th>
                {sourceColumns.map((col) => (
                  <th
                    key={col}
                    className="border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                    style={{ maxWidth: 220 }}
                    title={col}
                  >
                    {col}
                  </th>
                ))}
                <th
                  className="border-b border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 50 }}
                >
                  Act
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <tr>
                  <td
                    colSpan={sourceColumns.length + 2}
                    className="px-2 py-8 text-center text-slate-400"
                  >
                    No documents found
                  </td>
                </tr>
              )}
              {documents.map((doc) => {
                const src = doc._source ?? {}
                return (
                  <tr
                    key={doc._id}
                    className={[
                      'text-slate-700 even:bg-slate-50/50 hover:bg-blue-50/40 cursor-pointer select-none',
                      selectedDocId === doc._id ? 'bg-blue-100/80' : '',
                    ].join(' ')}
                    onClick={() => handleRowClick(doc)}
                    onDoubleClick={() => handleRowDoubleClick(doc)}
                  >
                    <td className="border-b border-r border-slate-100 px-2 py-1.5 font-mono text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                      {doc._id}
                    </td>
                    {sourceColumns.map((col) => {
                      const val = src[col]
                      const display =
                        typeof val === 'object' && val !== null
                          ? JSON.stringify(val)
                          : String(val ?? '')
                      return (
                        <td
                          key={col}
                          className="border-b border-r border-slate-100 px-2 py-1.5 text-[11px] text-slate-600 whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ maxWidth: 220 }}
                          title={display}
                        >
                          {display}
                        </td>
                      )
                    })}
                    <td className="border-b border-slate-100 px-2 py-1.5">
                      <button
                        onClick={() => handleDeleteDocument(doc._id)}
                        title="Delete document"
                        className="rounded-md p-1 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-[inset_0_0_0_1px_theme(colors.red.200)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-3 space-y-2">
            {documents.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-xs">
                No documents found
              </div>
            )}
            {documents.map((doc) => (
              <div
                key={doc._id}
                className={[
                  'rounded-md border border-slate-200 bg-white p-2.5 even:bg-slate-50/50 hover:bg-blue-50/40 transition-colors cursor-pointer select-none',
                  selectedDocId === doc._id ? 'border-blue-300 bg-blue-50/80' : '',
                ].join(' ')}
                onClick={() => handleRowClick(doc)}
                onDoubleClick={() => handleRowDoubleClick(doc)}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-slate-500">
                    <span className="text-blue-500 font-semibold">ID:</span> {doc._id}
                  </span>
                  <button
                    onClick={() => handleDeleteDocument(doc._id)}
                    title="Delete document"
                    className="rounded-md p-1 text-slate-400 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-[inset_0_0_0_1px_theme(colors.red.200)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <pre className="text-[11px] text-slate-600 overflow-auto whitespace-pre-wrap break-all max-h-32">
                  {JSON.stringify(doc._source, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalHits > pageSize && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-200 bg-white">
          <span className="text-[10px] text-slate-400">
            {totalHits.toLocaleString()} total documents
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 0}
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            <span className="text-[10px] text-slate-400 px-1">Page {page + 1}</span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={(page + 1) * pageSize >= totalHits}
              className="rounded-md px-2 py-1 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Document Detail / Edit Panel */}
      {editingDoc && (
        <div className="border-t border-slate-200 bg-white flex flex-col" style={{ height: panelHeight }}>
          {/* Resize handle */}
          <div
            ref={resizeRef}
            onMouseDown={handleResizeMouseDown}
            className="flex items-center justify-center h-1.5 cursor-row-resize group shrink-0"
          >
            <div className="w-8 h-0.5 rounded-full bg-slate-300 group-hover:bg-blue-400 transition-colors" />
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200 bg-slate-50 shrink-0">
            <div className="flex items-center gap-2">
              <FileJson size={13} className="text-blue-500" />
              <span className="text-xs font-semibold text-slate-700">Document Detail</span>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                _id: {editingDoc._id}
              </span>
              {editingDoc._index && (
                <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">
                  _index: {editingDoc._index}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
              >
                <Save size={11} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleCloseEdit}
                className="rounded-md p-1 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            </div>
          </div>
          {editError && (
            <div className="px-3 py-1 text-xs text-red-600 bg-red-50 border-b border-red-200">
              {editError}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <Editor
              language="json"
              value={editJson}
              onChange={(val) => setEditJson(val ?? '')}
              theme="light"
              options={{
                fontSize: 12,
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
    </div>
  )
}
