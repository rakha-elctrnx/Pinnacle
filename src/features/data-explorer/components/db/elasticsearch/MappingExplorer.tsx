import { useState, useCallback, useMemo } from 'react'
import type { ConnectionPayload } from '../../../../../services/tauriClient'
import type { ElasticIndex, ElasticFieldMapping } from '../../../../../types/domain'
import { elasticGetMapping } from '../../../../../services/tauriClient'
import { Search, Copy, ChevronRight, ChevronDown } from 'lucide-react'
import { CenteredLoadingState } from '../../shared/CenteredLoadingState'

interface Props {
  connection: ConnectionPayload
  indexName: string | null
  indices: ElasticIndex[]
}

interface FlatField {
  path: string
  type?: string
  analyzer?: string
  index?: boolean | string
}

function flattenMappings(
  properties: Record<string, ElasticFieldMapping>,
  prefix = '',
): FlatField[] {
  const fields: FlatField[] = []
  for (const [name, mapping] of Object.entries(properties)) {
    const fullPath = prefix ? `${prefix}.${name}` : name
    fields.push({
      path: fullPath,
      type: mapping.type,
      analyzer: mapping.analyzer,
      index: mapping.index,
    })
    if (mapping.properties) {
      fields.push(...flattenMappings(mapping.properties, fullPath))
    }
  }
  return fields
}

function TreeNode({
  name,
  mapping,
  depth,
  search,
}: {
  name: string
  mapping: ElasticFieldMapping
  depth: number
  search: string
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = mapping.properties && Object.keys(mapping.properties).length > 0
  const matchesSearch = name.toLowerCase().includes(search.toLowerCase())

  if (search && !matchesSearch) {
    // Check children
    const hasMatchingChild = mapping.properties
      ? Object.keys(mapping.properties).some((k) =>
          k.toLowerCase().includes(search.toLowerCase())
        )
      : false
    if (!hasMatchingChild) return null
  }

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-slate-50 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-slate-400 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-sm text-slate-700 font-mono">{name}</span>
        {mapping.type && (
          <span className="ml-2 text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
            {mapping.type}
          </span>
        )}
        {mapping.analyzer && (
          <span className="ml-1 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
            {mapping.analyzer}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {Object.entries(mapping.properties!).map(([childName, childMapping]) => (
            <TreeNode
              key={childName}
              name={childName}
              mapping={childMapping}
              depth={depth + 1}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function MappingExplorer({ connection, indexName, indices }: Props) {
  const [currentIndex, setCurrentIndex] = useState(indexName)
  const [mappingData, setMappingData] = useState<Record<string, { mappings: { properties: Record<string, ElasticFieldMapping> } }> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree')
  const fetchMapping = useCallback(async (idx: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await elasticGetMapping({ connection, indexName: idx })
      setMappingData(result as Record<string, { mappings: { properties: Record<string, ElasticFieldMapping> } }>)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [connection])

  // Fetch on mount if indexName provided
  const [initialized, setInitialized] = useState(false)
  if (!initialized && currentIndex) {
    setInitialized(true)
    fetchMapping(currentIndex)
  }

  const flatFields = useMemo(() => {
    if (mappingData && currentIndex) {
      const indexMapping = mappingData[currentIndex]
      if (indexMapping?.mappings?.properties) {
        return flattenMappings(indexMapping.mappings.properties)
      }
    }
    return []
  }, [mappingData, currentIndex])

  const handleSelectIndex = useCallback((name: string) => {
    setCurrentIndex(name)
    setSearch('')
    fetchMapping(name)
  }, [fetchMapping])

  const copyFieldPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path)
  }, [])

  const exportMapping = useCallback(() => {
    if (!mappingData) return
    const blob = new Blob([JSON.stringify(mappingData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentIndex}_mapping.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [mappingData, currentIndex])

  const properties = currentIndex && mappingData?.[currentIndex]?.mappings?.properties

  if (!currentIndex) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-slate-200 bg-white">
          <h3 className="text-sm font-semibold text-slate-700">Select an index to view mappings</h3>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {indices.map((idx) => (
            <button
              key={idx.index}
              onClick={() => handleSelectIndex(idx.index)}
              className="flex items-center gap-3 w-full px-3 py-2 rounded hover:bg-slate-50 text-left"
            >
              <span className={`inline-block h-2 w-2 rounded-full ${idx.health === 'green' ? 'bg-emerald-500' : idx.health === 'yellow' ? 'bg-amber-400' : 'bg-red-500'}`} />
              <span className="text-sm text-slate-700 font-mono">{idx.index}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-white">
        <select
          value={currentIndex}
          onChange={(e) => handleSelectIndex(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
        >
          {indices.map((idx) => (
            <option key={idx.index} value={idx.index}>{idx.index}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center border border-slate-300 rounded overflow-hidden">
          <button
            onClick={() => setViewMode('tree')}
            className={`px-2 py-1.5 text-xs ${viewMode === 'tree' ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
          >Tree</button>
          <button
            onClick={() => setViewMode('flat')}
            className={`px-2 py-1.5 text-xs ${viewMode === 'flat' ? 'bg-slate-200 text-slate-700' : 'text-slate-400 hover:text-slate-600'}`}
          >Flat</button>
        </div>
        <button
          onClick={exportMapping}
          className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5"
        >Export</button>
      </div>

      {error && <div className="px-4 py-2 text-sm text-red-600 bg-red-50 border-b border-red-200">{error}</div>}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <CenteredLoadingState loading={loading} label="Loading mapping..." />
        ) : !properties ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            No mapping data available
          </div>
        ) : viewMode === 'tree' ? (
          <div className="p-2">
            {Object.entries(properties).map(([name, mapping]) => (
              <TreeNode
                key={name}
                name={name}
                mapping={mapping}
                depth={0}
                search={search}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Field Path</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Analyzer</th>
                <th className="px-4 py-2">Index</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {flatFields
                .filter((f) => !search || f.path.toLowerCase().includes(search.toLowerCase()))
                .map((field) => (
                  <tr key={field.path} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-700">{field.path}</td>
                    <td className="px-4 py-2">
                      {field.type && (
                        <span className="text-xs text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">{field.type}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{field.analyzer ?? '-'}</td>
                    <td className="px-4 py-2 text-slate-500">{field.index !== undefined ? String(field.index) : '-'}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => copyFieldPath(field.path)}
                        title="Copy field path"
                        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}