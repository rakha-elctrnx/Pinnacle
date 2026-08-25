import { useState, useEffect } from 'react'
import { Search, RefreshCw, Plus, Play, Table, Code, Trash2, Edit3, X } from 'lucide-react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { MongoFindResult } from '../types/mongodb'
import { mongoFindDocuments, mongoInsertDocument, mongoUpdateDocument, mongoDeleteDocument } from '../clients/mongodb'

interface Props {
  payload: ConnectionPayload | null
  database: string
  collection: string
}

export function MongoDocumentsTab({ payload, database, collection }: Props) {
  const [filterText, setFilterText] = useState('{}')
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [results, setResults] = useState<MongoFindResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedDoc, setSelectedDoc] = useState<Record<string, unknown> | null>(null)
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | 'new'>('view')
  const [drawerJson, setDrawerJson] = useState('')

  const executeFind = () => {
    if (!payload) return
    let filter: Record<string, unknown> = {}
    try {
      if (filterText.trim()) {
        filter = JSON.parse(filterText)
      }
    } catch (e) {
      setError(`Invalid JSON filter: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    setError(null)
    setLoading(true)
    mongoFindDocuments({
      connection: payload,
      database,
      collection,
      filter,
      offset: 0,
      pageSize: 50,
    })
      .then((res) => {
        setResults(res)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    if (!payload) return
    let isMounted = true
    mongoFindDocuments({
      connection: payload,
      database,
      collection,
      filter: {},
      offset: 0,
      pageSize: 50,
    })
      .then((res) => {
        if (isMounted) setResults(res)
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : String(err))
      })

    return () => {
      isMounted = false
    }
  }, [payload, database, collection])
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
      executeFind()
    } catch (e) {
      setError(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const documents = results?.documents || []
  const columns = documents.length > 0 ? Object.keys(documents[0]) : ['_id']

  return (
    <div className="flex flex-col h-full bg-bg-base text-text-primary">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-border-default bg-bg-subtle">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter { key: 'value' }"
            className="w-full bg-bg-base text-xs font-mono text-text-primary pl-9 pr-3 py-2 rounded-md border border-border-default focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={executeFind}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary-hover text-text-inverse rounded-md text-xs font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> Find
        </button>
        <button
          onClick={executeFind}
          className="p-2 text-text-muted hover:text-text-primary bg-bg-base rounded-md border border-border-default"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <div className="h-4 w-px bg-bg-muted mx-1" />
        <button
          onClick={handleOpenInsert}
          className="flex items-center gap-1.5 px-3 py-2 bg-bg-muted hover:bg-bg-hover text-text-primary rounded-md text-xs font-medium border border-border-strong transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Insert Document
        </button>
        <div className="flex items-center bg-bg-base p-1 rounded-md border border-border-default">
          <button
            onClick={() => setViewMode('table')}
            className={`p-1 rounded ${viewMode === 'table' ? 'bg-bg-hover text-text-primary' : 'text-text-muted'}`}
          >
            <Table className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`p-1 rounded ${viewMode === 'json' ? 'bg-bg-hover text-text-primary' : 'text-text-muted'}`}
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-subtle border-b border-border-danger text-danger text-xs">
          {error}
        </div>
      )}

      {/* Main Document Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs text-text-muted">
            Loading documents...
          </div>
        ) : documents.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-xs text-text-muted">
            No documents found matching filter
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto border border-border-default rounded-lg">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-bg-subtle text-text-muted border-b border-border-default">
                <tr>
                  <th className="px-3 py-2 w-16">Actions</th>
                  {columns.map((col) => (
                    <th key={col} className="px-3 py-2 font-medium border-r border-border-default">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default/50 bg-bg-base">
                {documents.map((doc, idx) => (
                  <tr key={idx} className="hover:bg-bg-muted/40">
                    <td className="px-3 py-2 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEdit(doc)}
                        className="text-text-muted hover:text-success"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(doc)}
                        className="text-text-muted hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-2 border-r border-border-default/50 text-text-secondary max-w-xs truncate">
                        {typeof doc[col] === 'object' ? JSON.stringify(doc[col]) : String(doc[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3 font-mono text-xs">
            {documents.map((doc, idx) => (
              <div key={idx} className="p-3 bg-bg-subtle border border-border-default rounded-lg relative group">
                <div className="absolute top-3 right-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleOpenEdit(doc)}
                    className="px-2 py-1 bg-bg-muted hover:bg-bg-hover text-success rounded text-[10px]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(doc)}
                    className="px-2 py-1 bg-bg-muted hover:bg-bg-hover text-danger rounded text-[10px]"
                  >
                    Delete
                  </button>
                </div>
                <pre className="text-success-text overflow-x-auto">{JSON.stringify(doc, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail/Edit Drawer */}
      {drawerMode !== 'view' && (
        <div className="fixed inset-y-0 right-0 w-96 bg-bg-subtle border-l border-border-default shadow-2xl flex flex-col z-50">
          <div className="flex items-center justify-between p-3 border-b border-border-default">
            <h3 className="text-xs font-semibold text-text-primary">
              {drawerMode === 'new' ? 'Insert Document' : 'Edit Document'}
            </h3>
            <button onClick={() => setDrawerMode('view')} className="text-text-muted hover:text-text-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 p-3">
            <textarea
              value={drawerJson}
              onChange={(e) => setDrawerJson(e.target.value)}
              className="w-full h-full bg-bg-base font-mono text-xs text-text-primary p-3 rounded border border-border-default focus:outline-none focus:border-primary resize-none"
            />
          </div>
          <div className="p-3 border-t border-border-default flex justify-end gap-2">
            <button
              onClick={() => setDrawerMode('view')}
              className="px-3 py-1.5 bg-bg-muted hover:bg-bg-hover text-text-secondary rounded text-xs"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDrawer}
              className="px-3 py-1.5 bg-primary hover:bg-primary-hover text-text-inverse rounded text-xs font-medium"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
