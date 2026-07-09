/**
 * Elasticsearch Query Store — Zustand
 *
 * Per-tab persistence for the ES QueryConsole.
 * Each open tab gets its own editor state (method, path, body, etc.)
 * via a map keyed by tab ID.
 *
 * Uses Zustand `persist` middleware backed by `sessionStorage` so state
 * survives navigation within the session but is cleared on tab close.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ElasticQueryResult } from '../types/elasticsearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EsQueryTabState {
  method: string
  path: string
  body: string
  resultTab: 'response' | 'messages' | 'statistics'
  result: ElasticQueryResult | null
  error: string | null
}

interface EsQueryStore {
  /** Per-tab query states, keyed by tab ID. */
  tabs: Record<string, EsQueryTabState>
  /** Set the state for a given tab. */
  setTab: (tabId: string, state: EsQueryTabState) => void
  /** Remove a tab's state when closed. */
  removeTab: (tabId: string) => void
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TAB_STATE: EsQueryTabState = {
  method: 'GET',
  path: '/_cluster/health',
  body: '',
  resultTab: 'response',
  result: null,
  error: null,
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEsQueryStore = create<EsQueryStore>()(
  persist(
    (set) => ({
      tabs: {},

      setTab: (tabId, state) =>
        set((prev) => ({
          tabs: { ...prev.tabs, [tabId]: state },
        })),

      removeTab: (tabId) =>
        set((prev) => {
          const { [tabId]: _removed, ...rest } = prev.tabs
          return { tabs: rest }
        }),
    }),
    {
      name: 'pinnacle-es-query-store',
      storage: {
        getItem: (name) => {
          const raw = sessionStorage.getItem(name)
          return raw ? JSON.parse(raw) : null
        },
        setItem: (name, value) => {
          sessionStorage.setItem(name, JSON.stringify(value))
        },
        removeItem: (name) => {
          sessionStorage.removeItem(name)
        },
      },
    },
  ),
)

export { DEFAULT_TAB_STATE }