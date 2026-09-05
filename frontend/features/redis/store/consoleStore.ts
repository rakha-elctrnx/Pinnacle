import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RedisConsoleTabState {
  command: string
  output: string | null
  error: string | null
}

interface RedisConsoleStore {
  tabs: Record<string, RedisConsoleTabState>
  setTab: (tabId: string, state: RedisConsoleTabState) => void
  removeTab: (tabId: string) => void
}

export const DEFAULT_REDIS_CONSOLE_TAB_STATE: RedisConsoleTabState = {
  command: 'PING',
  output: null,
  error: null,
}

export const useRedisConsoleStore = create<RedisConsoleStore>()(
  persist(
    (set) => ({
      tabs: {},
      setTab: (tabId, state) =>
        set((prev) => ({
          tabs: { ...prev.tabs, [tabId]: state },
        })),
      removeTab: (tabId) =>
        set((prev) => {
          const rest = { ...prev.tabs }
          delete rest[tabId]
          return { tabs: rest }
        }),
    }),
    {
      name: 'pinnacle-redis-console-store',
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
