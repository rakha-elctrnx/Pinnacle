import type { SqlTableListItem } from '../../../_shared/types/shared'

export type SortField = 'tableName' | 'oid' | 'owner' | 'tableType' | 'rowCount'
export type SortDirection = 'asc' | 'desc'

interface TablesListViewProps {
  rows: SqlTableListItem[]
  sortField: SortField
  sortDirection: SortDirection
  selectedTableName: string | null
  onSort: (field: SortField) => void
  onRowSelect: (name: string) => void
  onRowDoubleClick: (name: string) => void
}

export function TablesListView({
  rows,
  sortField,
  sortDirection,
  selectedTableName,
  onSort,
  onRowSelect,
  onRowDoubleClick,
}: TablesListViewProps) {
  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null
    return (
      <span className="ml-1 text-text-muted">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    )
  }

  return (
    <div
      className="scrollbar-thin flex-1 min-h-0 overflow-auto border border-border-default [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-bg-muted [&::-webkit-scrollbar-track]:bg-bg-subtle"
      onClick={(e) => e.stopPropagation()}
    >
      <table
        className="w-full border-collapse text-xs"
        style={{ tableLayout: 'fixed' }}
      >
        <thead className="sticky top-0 z-10 bg-bg-subtle shadow-[0_1px_0_0_var(--color-border-default)]">
          <tr className="text-left text-text-secondary">
            <th
              className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
              onClick={() => onSort('tableName')}
            >
              Table Name {sortIndicator('tableName')}
            </th>
            <th
              className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
              style={{ width: 90 }}
              onClick={() => onSort('oid')}
            >
              OID {sortIndicator('oid')}
            </th>
            <th
              className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
              style={{ width: 150 }}
              onClick={() => onSort('owner')}
            >
              Owner {sortIndicator('owner')}
            </th>
            <th
              className="cursor-pointer whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-label text-text-primary"
              style={{ width: 150 }}
              onClick={() => onSort('tableType')}
            >
              Table Type {sortIndicator('tableType')}
            </th>
            <th
              className="cursor-pointer whitespace-nowrap border-b border-border-default px-2 py-1.5 text-right text-label text-text-primary"
              style={{ width: 120 }}
              onClick={() => onSort('rowCount')}
            >
              Rows {sortIndicator('rowCount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={5}
                className="px-2 py-8 text-center text-text-muted"
              >
                No tables found
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const isSelected = selectedTableName === row.tableName
            return (
              <tr
                key={row.tableName}
                className={[
                  'cursor-pointer text-text-primary even:bg-bg-subtle/50 hover:bg-primary-subtle/40',
                  isSelected
                    ? 'bg-primary-subtle/70! even:bg-primary-subtle/70!'
                    : '',
                ].join(' ')}
                onClick={() => onRowSelect(row.tableName)}
                onDoubleClick={() => onRowDoubleClick(row.tableName)}
              >
                <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRowDoubleClick(row.tableName)
                    }}
                    className="text-mono text-primary hover:text-primary-hover hover:underline"
                  >
                    {row.tableName}
                  </button>
                </td>
                <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-mono">
                  {row.oid}
                </td>
                <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                  {row.owner}
                </td>
                <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5">
                  {row.tableType}
                </td>
                <td className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border-default px-2 py-1.5 text-right text-mono">
                  {row.rowCount}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
