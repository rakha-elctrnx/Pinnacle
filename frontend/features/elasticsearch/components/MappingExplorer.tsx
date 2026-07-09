import { useState, useCallback, useMemo } from 'react'
import type { ConnectionPayload } from '../../_shared/services/tauriClient'
import type { ElasticIndex, ElasticFieldMapping } from '../types/elasticsearch'
import { elasticGetMapping } from '../clients/elasticsearch'
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  List,
  Search,
  TreePine,
  X,
} from 'lucide-react'
import { CenteredLoadingState } from '../../_shared/components/ui/CenteredLoadingState'
import { ActionButton } from '../../_shared/components/ui/ActionButton'

interface Props {
  connection: ConnectionPayload
  indexName?: string | null
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
  const hasChildren =
    mapping.properties && Object.keys(mapping.properties).length > 0
  const matchesSearch = name.toLowerCase().includes(search.toLowerCase())

  if (search && !matchesSearch) {
    // Check children
    const hasMatchingChild = mapping.properties
      ? Object.keys(mapping.properties).some((k) =>
          k.toLowerCase().includes(search.toLowerCase()),
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
        <span className="text-body text-mono">{name}</span>
        {mapping.type && (
          <span className="ml-2 text-caption text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded">
            {mapping.type}
          </span>
        )}
        {mapping.analyzer && (
          <span className="ml-1 text-caption text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
            {mapping.analyzer}
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {Object.entries(mapping.properties!).map(
            ([childName, childMapping]) => (
              <TreeNode
                key={childName}
                name={childName}
                mapping={childMapping}
                depth={depth + 1}
                search={search}
              />
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function MappingExplorer({ connection, indexName, indices }: Props) {
  const [currentIndex, setCurrentIndex] = useState(indexName)
  const [mappingData, setMappingData] = useState<Record<
    string,
    { mappings: { properties: Record<string, ElasticFieldMapping> } }
  > | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'tree' | 'flat'>('tree')
  const fetchMapping = useCallback(
    async (idx: string) => {
      setLoading(true)
      setError(null)
      try {
        const result = await elasticGetMapping({ connection, indexName: idx })
        setMappingData(
          result as Record<
            string,
            { mappings: { properties: Record<string, ElasticFieldMapping> } }
          >,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [connection],
  )

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

  const handleSelectIndex = useCallback(
    (name: string) => {
      setCurrentIndex(name)
      setSearchQuery('')
      setSearchOpen(false)
      fetchMapping(name)
    },
    [fetchMapping],
  )

  const copyFieldPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path)
  }, [])

  const exportMapping = useCallback(() => {
    if (!mappingData) return
    const blob = new Blob([JSON.stringify(mappingData, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentIndex}_mapping.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [mappingData, currentIndex])

  const properties =
    currentIndex && mappingData?.[currentIndex]?.mappings?.properties

  if (!currentIndex) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-2 py-1.5 border-b border-border-default bg-bg-base">
          <h3 className="text-subheading text-text-primary">
            Select an index to view mappings
          </h3>
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {indices.map((idx) => (
            <button
              key={idx.index}
              onClick={() => handleSelectIndex(idx.index)}
              className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded hover:bg-bg-hover text-left text-text-secondary"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  idx.health === 'green'
                    ? 'bg-success'
                    : idx.health === 'yellow'
                      ? 'bg-warning'
                      : 'bg-danger'
                }`}
              />
              <span className="text-body text-mono">{idx.index}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
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

        {/* Search toggle */}
        <ActionButton
          icon={<Search size={14} />}
          aria-label="Toggle Search"
          variant={searchOpen ? 'accent' : 'default'}
          onClick={() => setSearchOpen(!searchOpen)}
          title="Search fields"
        />

        <span className="mx-0.5 h-5 w-px bg-border-default" />

        {/* View mode toggle */}
        <div className="flex items-center overflow-hidden rounded-lg border border-border-default">
          <button
            type="button"
            onClick={() => setViewMode('tree')}
            className={`p-1.5 transition-colors ${
              viewMode === 'tree'
                ? 'bg-bg-muted text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Tree view"
          >
            <TreePine size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('flat')}
            className={`p-1.5 transition-colors ${
              viewMode === 'flat'
                ? 'bg-bg-muted text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
            title="Flat view"
          >
            <List size={13} />
          </button>
        </div>

        <span className="mx-0.5 h-5 w-px bg-border-default" />

        {/* Export */}
        <ActionButton
          icon={<Download size={14} />}
          aria-label="Export mapping"
          variant="default"
          onClick={exportMapping}
          title="Export mapping"
        />
      </div>

      {/* ── Search bar (collapsible) ──────────────────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
          searchOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex items-center gap-1 border-b border-border-default px-2 py-1">
            <Search size={13} className="shrink-0 text-text-muted" />
            <input
              type="text"
              placeholder="Search field paths..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-6 flex-1 bg-transparent text-[11px] text-text-primary outline-none placeholder:text-text-muted"
            />
            {searchQuery && (
              <button
                type="button"
                className="rounded p-0.5 text-text-muted hover:text-text-primary"
                onClick={() => setSearchQuery('')}
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-2 py-1 text-caption text-danger bg-danger/15 border-b border-danger/20">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {loading ? (
          <CenteredLoadingState loading={loading} label="Loading mapping..." />
        ) : !properties ? (
          <div className="flex items-center justify-center h-full text-caption">
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
                search={searchQuery}
              />
            ))}
          </div>
        ) : (
          <table className="w-full text-body">
            <thead className="sticky top-0 bg-bg-base z-10">
              <tr className="border-b border-border-default text-left text-label">
                <th className="px-2 py-1.5">Field Path</th>
                <th className="px-2 py-1.5">Type</th>
                <th className="px-2 py-1.5">Analyzer</th>
                <th className="px-2 py-1.5">Index</th>
                <th className="px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {flatFields
                .filter(
                  (f) =>
                    !searchQuery ||
                    f.path.toLowerCase().includes(searchQuery.toLowerCase()),
                )
                .map((field) => (
                  <tr
                    key={field.path}
                    className="border-b border-border-subtle hover:bg-bg-hover"
                  >
                    <td className="px-2 py-1.5 text-mono text-text-primary">
                      {field.path}
                    </td>
                    <td className="px-2 py-1.5">
                      {field.type && (
                        <span className="text-[10px] text-primary bg-primary/15 px-1.5 py-0.5 rounded">
                          {field.type}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-text-muted">
                      {field.analyzer ?? '-'}
                    </td>
                    <td className="px-2 py-1.5 text-text-muted">
                      {field.index !== undefined ? String(field.index) : '-'}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => copyFieldPath(field.path)}
                        title="Copy field path"
                        className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
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
