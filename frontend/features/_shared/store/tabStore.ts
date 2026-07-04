import { create } from 'zustand'
import type { ConnectionType } from '../types/domain'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** What kind of page a tab represents. */
export type TabPageType = 'table' | 'query' | 'elastic-index'

export interface Tab {
  /** Unique identifier — connection id for connection tabs, composite key for sub-pages. */
  id: string
  /** Human-readable display label (e.g. connection name, table name). */
  label: string
  /** Connection service type. */
  type: ConnectionType
  /** What kind of page this tab represents. */
  pageType: TabPageType
  /** Current route path within the service (e.g. `/sql/conn-1/tables`). */
  route: string
  /** Parent connection id — present on sub-page tabs (table, query, elastic-index). */
  connectionId?: string
  /** Number of pending changes (table edit store). Shown as badge in TabBar. */
  pendingCount?: number
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface TabState {
  /** All open tabs in display order. */
  tabs: Tab[]
  /** ID of the currently active tab, or `null` when no tabs are open. */
  activeTabId: string | null

  // Actions
  openTab: (tab: Tab) => void
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  updateTabRoute: (tabId: string, route: string) => void
  /** Set the pending change count for a tab (shown as badge). */
  setTabPendingCount: (tabId: string, count: number) => void
  closeTabsByConnectionId: (connectionId: string) => void
}

// ---------------------------------------------------------------------------
// Store — session-only (no `persist` middleware)
// ---------------------------------------------------------------------------

export const useTabStore = create<TabState>((set) => ({
  tabs: [],
  activeTabId: null,

  openTab: (tab) =>
    set((state) => {
      const exists = state.tabs.some((t) => t.id === tab.id)
      if (exists) {
        // Already open — just activate it (and update route if changed).
        return {
          activeTabId: tab.id,
          tabs: state.tabs.map((t) =>
            t.id === tab.id ? { ...t, route: tab.route, label: tab.label } : t
          ),
        }
      }
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      }
    }),

  closeTab: (tabId) =>
    set((state) => {
      const idx = state.tabs.findIndex((t) => t.id === tabId)
      if (idx === -1) return state

      const remaining = state.tabs.filter((t) => t.id !== tabId)

      // Determine next active tab.
      let nextActiveId: string | null
      if (state.activeTabId !== tabId) {
        // Closing a non-active tab — keep the current active tab.
        nextActiveId = state.activeTabId
      } else if (remaining.length > 0) {
        // Activate the tab to the left, clamped to 0.
        nextActiveId = remaining[Math.min(idx, remaining.length - 1)].id
      } else {
        nextActiveId = null
      }

      return { tabs: remaining, activeTabId: nextActiveId }
    }),

  activateTab: (tabId) =>
    set((state) => {
      if (!state.tabs.some((t) => t.id === tabId)) return state
      return { activeTabId: tabId }
    }),

  updateTabRoute: (tabId, route) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, route } : t)),
    })),

  setTabPendingCount: (tabId, count) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, pendingCount: count } : t,
      ),
    })),

  closeTabsByConnectionId: (connectionId) =>
    set((state) => {
      const remaining = state.tabs.filter((t) => {
        // Remove any sub-page tab that belongs to this connection.
        if (t.connectionId === connectionId) return false
        return true
      })

      // Determine next active tab.
      let nextActiveId: string | null
      if (!state.activeTabId) {
        nextActiveId = null
      } else {
        // Check if the active tab was among the removed ones.
        const activeWasRemoved = !remaining.some((t) => t.id === state.activeTabId)
        if (activeWasRemoved) {
          nextActiveId = remaining.length > 0 ? remaining[remaining.length - 1].id : null
        } else {
          nextActiveId = state.activeTabId
        }
      }

      return { tabs: remaining, activeTabId: nextActiveId }
    }),
}))
