/**
 * useTableDetailCacheStore — per-tab persistence for TableDetailPage UI-state
 * (pagination, filters, sort).
 *
 * Zustand store, session-only (never persisted to disk). Keyed by tabId
 * (`${connectionId}:table:${tableName}`). When a tab is switched away, the
 * page component unmounts and its local `useState` is lost — this cache
 * survives the remount so filters / sort / pagination remain intact.
 *
 * Removed when a tab is closed (see TabBar closeTab → remove).
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
// Types — mirrors the local types in TableDetailPage so the cache stays
// compatible without import cycles.
// ---------------------------------------------------------------------------

/** Looser than FilterOperator; accepts any FilterOperator literal at runtime. */
export type CacheFilterOperator = string

export interface CacheFilterCondition {
  column: string
  operator: CacheFilterOperator
  value: string
}

/** Snapshot of filter/sort/pagination state for one table-detail tab. */
export interface TableDetailCacheEntry {
  page: number
  pageSize: number
  filters: CacheFilterCondition[]
  appliedWhereClause: string
  appliedOrderByClause: string
  sortColumn: string | null
  sortDirection: 'asc' | 'desc'
  filterPanelOpen: boolean
  newFilter: Partial<CacheFilterCondition>
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface TableDetailCacheState {
  cache: Record<string, TableDetailCacheEntry>

  /** Get a cached entry for a tab, or `undefined` when none exists. */
  get: (tabId: string) => TableDetailCacheEntry | undefined

  /** Merge partial state into a tab's cached entry (creates one on first call). */
  set: (tabId: string, snapshot: Partial<TableDetailCacheEntry>) => void

  /** Drop an entry (called when a tab is closed). */
  remove: (tabId: string) => void
}

// ---------------------------------------------------------------------------
// Defaults — used when no cached entry exists for a tab.
// ---------------------------------------------------------------------------

const DEFAULTS: TableDetailCacheEntry = {
  page: 1,
  pageSize: 50,
  filters: [],
  appliedWhereClause: '',
  appliedOrderByClause: '',
  sortColumn: null,
  sortDirection: 'asc',
  filterPanelOpen: false,
  newFilter: { column: '', operator: '=', value: '' },
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTableDetailCacheStore = create<TableDetailCacheState>(
  (set, get) => ({
    cache: {},

    get: (tabId) => get().cache[tabId],

    set: (tabId, snapshot) =>
      set((state) => ({
        cache: {
          ...state.cache,
          [tabId]: {
            ...(state.cache[tabId] ?? DEFAULTS),
            ...snapshot,
          },
        },
      })),

    remove: (tabId) =>
      set((state) => {
        if (!(tabId in state.cache)) return state
        const next = { ...state.cache }
        delete next[tabId]
        return { cache: next }
      }),
  }),
)
