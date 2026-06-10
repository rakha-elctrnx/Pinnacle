import { useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { SqlTableListItem } from '../../../types'

interface SqlTableListProps {
  rows: SqlTableListItem[]
  loading: boolean
  onSelectTable: (tableName: string) => void
}

type SortField = 'tableName' | 'oid' | 'owner' | 'tableType' | 'rowCount'
type SortDirection = 'asc' | 'desc'

export function SqlTableList({ rows, loading, onSelectTable }: SqlTableListProps) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('tableName')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const searched = normalizedSearch
      ? rows.filter((row) => {
          return (
            row.tableName.toLowerCase().includes(normalizedSearch) ||
            row.owner.toLowerCase().includes(normalizedSearch) ||
            row.tableType.toLowerCase().includes(normalizedSearch)
          )
        })
      : rows

    return [...searched].sort((a, b) => {
      const aVal = String(a[sortField] ?? '')
      const bVal = String(b[sortField] ?? '')

      if (sortField === 'rowCount') {
        const aNum = Number(a.rowCount) || 0
        const bNum = Number(b.rowCount) || 0
        return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
      }

      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    })
  }, [rows, search, sortField, sortDirection])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortField(field)
    setSortDirection('asc')
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return <span className="ml-1 text-slate-400">{sortDirection === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-64 rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blue-500" />
          <span className="ml-2 text-sm text-slate-500">Loading tables...</span>
        </div>
      )}

      {!loading && (
        <div className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-slate-200 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-50">
          <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
            <thead className="sticky top-0 z-10 bg-slate-100 shadow-[0_1px_0_0_var(--color-slate-200)]">
              <tr className="text-left text-slate-600">
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  onClick={() => toggleSort('tableName')}
                >
                  Table Name {sortIndicator('tableName')}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 90 }}
                  onClick={() => toggleSort('oid')}
                >
                  OID {sortIndicator('oid')}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 150 }}
                  onClick={() => toggleSort('owner')}
                >
                  Owner {sortIndicator('owner')}
                </th>
                <th
                  className="cursor-pointer border-b border-r border-slate-200 px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 150 }}
                  onClick={() => toggleSort('tableType')}
                >
                  Table Type {sortIndicator('tableType')}
                </th>
                <th
                  className="cursor-pointer border-b border-slate-200 px-2 py-1.5 text-right font-semibold text-slate-700 whitespace-nowrap"
                  style={{ width: 120 }}
                  onClick={() => toggleSort('rowCount')}
                >
                  Rows {sortIndicator('rowCount')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-slate-400">
                    No tables found
                  </td>
                </tr>
              )}

              {filteredRows.map((row) => (
                <tr key={row.tableName} className="text-slate-700 even:bg-slate-50/50 hover:bg-blue-50/40">
                  <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                    <button
                      type="button"
                      onClick={() => onSelectTable(row.tableName)}
                      className="font-mono text-blue-600 hover:text-blue-500 hover:underline"
                    >
                      {row.tableName}
                    </button>
                  </td>
                  <td className="border-b border-r border-slate-100 px-2 py-1.5 font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.oid}
                  </td>
                  <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.owner}
                  </td>
                  <td className="border-b border-r border-slate-100 px-2 py-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.tableType}
                  </td>
                  <td className="border-b border-slate-100 px-2 py-1.5 text-right font-mono text-[11px] whitespace-nowrap overflow-hidden text-ellipsis">
                    {row.rowCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
