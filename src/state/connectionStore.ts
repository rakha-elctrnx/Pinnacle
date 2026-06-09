import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ConnectionProfile } from '../types/domain'

interface ConnectionState {
  search: string
  items: ConnectionProfile[]
  setSearch: (value: string) => void
  upsert: (profile: ConnectionProfile) => void
  remove: (id: string) => void
  toggleFavorite: (id: string) => void
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      search: '',
      items: [],
      setSearch: (value) => set({ search: value }),
      upsert: (profile) => {
        const existing = get().items
        const found = existing.find((item) => item.id === profile.id)
        if (found) {
          set({ items: existing.map((item) => (item.id === profile.id ? profile : item)) })
          return
        }
        set({ items: [profile, ...existing] })
      },
      remove: (id) => set({ items: get().items.filter((item) => item.id !== id) }),
      toggleFavorite: (id) => {
        set({
          items: get().items.map((item) =>
            item.id === id ? { ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() } : item,
          ),
        })
      },
    }),
    {
      name: 'pinnacle-connections',
    },
  ),
)