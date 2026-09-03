import { useState, useCallback, useEffect, useRef } from 'react'
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
  /**
   * Invoked whenever a state-changing filter/sort mutation lands (add /
   * update / remove / clear filter, sort change). The page uses it to reset
   * pagination to page 1 and clear index-keyed selection before the refetch.
   */
  onQueryStateChange?: () => void
}

export function useTableFiltersAndSort({
  tabId,
  dbType,
  tableColumnsMeta,
  tableName,
  onQueryStateChange,
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

  // ── Reconcile cached filters/sort once columns load ────────────────────
  // Discard filters whose columns no longer exist, rebuild the WHERE clause
  // from surviving state, and drop a stale sort column. Skipped until real
  // column metadata exists so a fresh mount never wipes restored cache.
  const columnsSignature = tableColumnsMeta.map((c) => c.columnName).join(' ')
  useEffect(() => {
    if (!tabId || columnsSignature === '') return
    const knownColumns = new Set(columnsSignature.split(' '))
    const hasStaleFilter = filters.some((f) => !knownColumns.has(f.column))
    const sortStale = sortColumn !== null && !knownColumns.has(sortColumn)
    if (!hasStaleFilter && !sortStale) return

    // Deferred one microtask: reconciliation reacts to async column loads,
    // and the lint rule forbids synchronous setState inside effects.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      const nextFilters = filters.filter((f) => knownColumns.has(f.column))
      const typedDbType = dbType as 'postgresql' | 'mysql'
      const canBuildClause =
        !!typedDbType &&
        ['postgresql', 'mysql'].includes(typedDbType) &&
        !!tableName
      setFilters(nextFilters)
      setAppliedWhereClause(
        canBuildClause && nextFilters.length > 0
          ? buildWhereClause(nextFilters, typedDbType, tableColumnsMeta)
          : '',
      )
      if (sortStale) {
        setSortColumn(null)
        setSortDirection('asc')
        setAppliedOrderByClause('')
      }
      // The sync-to-cache effect persists the reconciled state.
    })
    return () => {
      cancelled = true
    }
  }, [
    tabId,
    columnsSignature,
    filters,
    sortColumn,
    dbType,
    tableName,
    tableColumnsMeta,
  ])

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Latest-callback ref so the signal never goes stale inside handlers.
  const onQueryStateChangeRef = useRef(onQueryStateChange)
  useEffect(() => {
    onQueryStateChangeRef.current = onQueryStateChange
  }, [onQueryStateChange])

  const notifyQueryStateChange = useCallback(() => {
    onQueryStateChangeRef.current?.()
  }, [])

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
    // Reset pagination/selection before the page reacts to the new clause.
    notifyQueryStateChange()
  }, [
    filters,
    newFilter,
    dbType,
    tableColumnsMeta,
    tableName,
    notifyQueryStateChange,
  ])

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
      notifyQueryStateChange()
    },
    [filters, dbType, tableColumnsMeta, tableName, notifyQueryStateChange],
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
      notifyQueryStateChange()
    },
    [filters, dbType, tableColumnsMeta, tableName, notifyQueryStateChange],
  )

  const handleClearAllFilters = useCallback(() => {
    setFilters([])
    setNewFilter({ column: '', operator: '=', value: '' })
    setAppliedWhereClause('')
    setSortColumn(null)
    setSortDirection('asc')
    setAppliedOrderByClause('')
    notifyQueryStateChange()
  }, [notifyQueryStateChange])

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
          // Reset pagination/selection before the page reacts.
          notifyQueryStateChange()
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

      // Reset pagination/selection before the page reacts to the new sort.
      notifyQueryStateChange()
    },
    [sortColumn, sortDirection, dbType, notifyQueryStateChange],
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
