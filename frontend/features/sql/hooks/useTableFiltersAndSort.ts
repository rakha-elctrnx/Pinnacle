import { useState, useCallback, useEffect } from 'react'
import type {
  FilterCondition,
  FilterOperator,
  ColumnMetadata,
} from '../types/tableDetail'
import {
  buildWhereClause,
  buildOrderByClause,
} from '../logic/tableDetailPageHelpers'
import { useTableDetailCacheStore } from '../store/tableDetailCacheStore'
import type { CacheFilterCondition } from '../store/tableDetailCacheStore'

interface UseTableFiltersAndSortProps {
  tabId: string
  dbType: 'postgresql' | 'mysql' | undefined
  tableColumnsMeta: ColumnMetadata[]
  tableName: string | undefined
}

export function useTableFiltersAndSort({
  tabId,
  dbType,
  tableColumnsMeta,
  tableName,
}: UseTableFiltersAndSortProps) {
  const cacheEntry = useTableDetailCacheStore.getState().get(tabId)

  // ── State initialization ──────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterCondition[]>(
    (cacheEntry?.filters as FilterCondition[]) ?? [],
  )
  const [appliedWhereClause, setAppliedWhereClause] = useState<string>(
    cacheEntry?.appliedWhereClause ?? '',
  )
  const [filterPanelOpen, setFilterPanelOpen] = useState<boolean>(
    cacheEntry?.filterPanelOpen ?? false,
  )
  const [newFilter, setNewFilter] = useState<Partial<FilterCondition>>(
    (cacheEntry?.newFilter as Partial<FilterCondition>) ?? {
      column: '',
      operator: '=',
      value: '',
    },
  )
  const [sortColumn, setSortColumn] = useState<string | null>(
    cacheEntry?.sortColumn ?? null,
  )
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    cacheEntry?.sortDirection ?? 'asc',
  )
  const [appliedOrderByClause, setAppliedOrderByClause] = useState<string>(
    cacheEntry?.appliedOrderByClause ?? '',
  )

  // ── Sync states synchronously when tabId changes to avoid stale effects ───
  const [prevTabId, setPrevTabId] = useState(tabId)
  if (tabId !== prevTabId) {
    setPrevTabId(tabId)
    const cached = useTableDetailCacheStore.getState().get(tabId)
    setFilters((cached?.filters as FilterCondition[]) ?? [])
    setNewFilter(
      (cached?.newFilter as Partial<FilterCondition>) ?? {
        column: '',
        operator: '=',
        value: '',
      },
    )
    setAppliedWhereClause(cached?.appliedWhereClause ?? '')
    setFilterPanelOpen(cached?.filterPanelOpen ?? false)
    setSortColumn(cached?.sortColumn ?? null)
    setSortDirection(cached?.sortDirection ?? 'asc')
    setAppliedOrderByClause(cached?.appliedOrderByClause ?? '')
  }

  // ── Sync UI state to cache whenever it changes ──────────────────────────
  useEffect(() => {
    if (!tabId) return
    useTableDetailCacheStore.getState().set(tabId, {
      filters: filters as CacheFilterCondition[],
      appliedWhereClause,
      appliedOrderByClause,
      sortColumn,
      sortDirection,
      filterPanelOpen,
      newFilter: newFilter as Partial<CacheFilterCondition>,
    })
  }, [
    tabId,
    filters,
    appliedWhereClause,
    appliedOrderByClause,
    sortColumn,
    sortDirection,
    filterPanelOpen,
    newFilter,
  ])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAddFilter = useCallback(() => {
    if (!newFilter.column || !newFilter.operator) return
    const isNullOp = ['is_null', 'is_not_null'].includes(newFilter.operator)
    if (!isNullOp && !newFilter.value) return

    const next = [
      ...filters,
      {
        column: newFilter.column,
        operator: newFilter.operator as FilterOperator,
        value: (isNullOp ? '' : newFilter.value) ?? '',
      },
    ]
    setFilters(next)
    setNewFilter({ column: '', operator: '=', value: '' })

    const typedDbType = dbType as 'postgresql' | 'mysql'
    if (
      typedDbType &&
      ['postgresql', 'mysql'].includes(typedDbType) &&
      tableName
    ) {
      const whereClause = buildWhereClause(next, typedDbType, tableColumnsMeta)
      setAppliedWhereClause(whereClause)
    }
  }, [filters, newFilter, dbType, tableColumnsMeta, tableName])

  const handleUpdateFilter = useCallback(
    (index: number, patch: Partial<FilterCondition>) => {
      const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f))
      setFilters(next)

      const typedDbType = dbType as 'postgresql' | 'mysql'
      if (
        typedDbType &&
        ['postgresql', 'mysql'].includes(typedDbType) &&
        tableName
      ) {
        const whereClause = buildWhereClause(
          next,
          typedDbType,
          tableColumnsMeta,
        )
        setAppliedWhereClause(whereClause)
      }
    },
    [filters, dbType, tableColumnsMeta, tableName],
  )

  const handleRemoveFilter = useCallback(
    (index: number) => {
      const next = filters.filter((_, i) => i !== index)
      setFilters(next)

      const typedDbType = dbType as 'postgresql' | 'mysql'
      if (
        typedDbType &&
        ['postgresql', 'mysql'].includes(typedDbType) &&
        tableName
      ) {
        const whereClause =
          next.length > 0
            ? buildWhereClause(next, typedDbType, tableColumnsMeta)
            : ''
        setAppliedWhereClause(whereClause)
      }
    },
    [filters, dbType, tableColumnsMeta, tableName],
  )

  const handleClearAllFilters = useCallback(() => {
    setFilters([])
    setNewFilter({ column: '', operator: '=', value: '' })
    setAppliedWhereClause('')
    setSortColumn(null)
    setSortDirection('asc')
    setAppliedOrderByClause('')
  }, [])

  const handleSortColumn = useCallback(
    (column: string) => {
      let nextDirection: 'asc' | 'desc' = 'asc'

      if (sortColumn === column) {
        if (sortDirection === 'asc') {
          nextDirection = 'desc'
        } else {
          setSortColumn(null)
          setSortDirection('asc')
          setAppliedOrderByClause('')
          return
        }
      }

      setSortColumn(column)
      setSortDirection(nextDirection)

      const typedDbType = dbType as 'postgresql' | 'mysql'
      if (typedDbType && ['postgresql', 'mysql'].includes(typedDbType)) {
        const orderByClause = buildOrderByClause(
          column,
          nextDirection,
          typedDbType,
        )
        setAppliedOrderByClause(orderByClause)
      }
    },
    [sortColumn, sortDirection, dbType],
  )

  return {
    filters,
    setFilters,
    appliedWhereClause,
    setAppliedWhereClause,
    filterPanelOpen,
    setFilterPanelOpen,
    newFilter,
    setNewFilter,
    sortColumn,
    setSortColumn,
    sortDirection,
    setSortDirection,
    appliedOrderByClause,
    setAppliedOrderByClause,
    handleAddFilter,
    handleUpdateFilter,
    handleRemoveFilter,
    handleClearAllFilters,
    handleSortColumn,
  }
}
