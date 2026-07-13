import { CirclePlus, Filter, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { RefObject } from 'react'
import type { ConnectionProfile } from '../../../_shared/types/domain'
import type { FilterCondition, FilterOperator } from '../../types/tableDetail'
import { buildOrderByClause } from '../../logic/tableDetailPageHelpers'

interface TableFilterBarProps {
  filterPanelOpen: boolean
  filters: FilterCondition[]
  newFilter: Partial<FilterCondition>
  setNewFilter: (nf: Partial<FilterCondition>) => void
  realTableColumns: string[]
  handleAddFilter: () => void
  handleClearAllFilters: () => void
  handleUpdateFilter: (index: number, patch: Partial<FilterCondition>) => void
  handleRemoveFilter: (index: number) => void
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
  setSortColumn: (col: string | null) => void
  setSortDirection: (dir: 'asc' | 'desc') => void
  setAppliedOrderByClause: (clause: string) => void
  selectedConnection: ConnectionProfile | null
  handleSortColumn: (col: string) => void
  valueInputRef: RefObject<HTMLInputElement | null>
}

export function TableFilterBar({
  filterPanelOpen,
  filters,
  newFilter,
  setNewFilter,
  realTableColumns,
  handleAddFilter,
  handleClearAllFilters,
  handleUpdateFilter,
  handleRemoveFilter,
  sortColumn,
  sortDirection,
  setSortColumn,
  setSortDirection,
  setAppliedOrderByClause,
  selectedConnection,
  handleSortColumn,
  valueInputRef,
}: TableFilterBarProps) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
        filterPanelOpen || filters.length > 0 || sortColumn
          ? 'grid-rows-[1fr]'
          : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">
        <div className="border-b border-border-default">
          {/* ── Add filter row ──────────────────────────────────────────── */}
          <div className="flex items-center gap-1 px-2 py-1">
            <select
              className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary disabled:opacity-40"
              value={newFilter.column || ''}
              onChange={(e) =>
                setNewFilter({ ...newFilter, column: e.target.value })
              }
              disabled={realTableColumns.length === 0}
            >
              <option value="">Column…</option>
              {realTableColumns.map((col) => (
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
              disabled={!newFilter.column}
            >
              <option value="=">=</option>
              <option value="!=">!=</option>
              <option value="contains">contains</option>
              <option value="starts_with">starts with</option>
              <option value="ends_with">ends with</option>
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
                placeholder="Value…"
                value={newFilter.value || ''}
                onChange={(e) =>
                  setNewFilter({ ...newFilter, value: e.target.value })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFilter()
                }}
                disabled={!newFilter.column || !newFilter.operator}
              />
            )}
            <button
              type="button"
              className="flex h-6 items-center gap-0.5 rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={handleAddFilter}
              disabled={
                !newFilter.column ||
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

          {/* ── Active filters + sort (inline, wrapping) ─────────────── */}
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
                    value={filter.column}
                    onChange={(e) =>
                      handleUpdateFilter(index, { column: e.target.value })
                    }
                  >
                    {realTableColumns.map((col) => (
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
                    <option value="starts_with">starts with</option>
                    <option value="ends_with">ends with</option>
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
                    aria-label={`Remove filter on ${filter.column}`}
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
              {/* ── Sort chip ── */}
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
                        setAppliedOrderByClause('')
                      } else {
                        handleSortColumn(e.target.value)
                      }
                    }}
                  >
                    {realTableColumns.map((col) => (
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
                      const dbType = selectedConnection?.type as
                        | 'postgresql'
                        | 'mysql'
                      if (
                        dbType &&
                        ['postgresql', 'mysql'].includes(dbType) &&
                        sortColumn
                      ) {
                        setAppliedOrderByClause(
                          buildOrderByClause(sortColumn, next, dbType),
                        )
                      }
                    }}
                  >
                    {sortDirection === 'asc' ? 'asc' : 'desc'}
                  </button>
                  <button
                    className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-danger group-hover/chip:opacity-100"
                    onClick={() => {
                      setSortColumn(null)
                      setSortDirection('asc')
                      setAppliedOrderByClause('')
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
  )
}
