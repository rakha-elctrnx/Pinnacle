import { create } from 'zustand'
import type { ConnectionProfile } from '../types/domain'
import {
  listConnections,
  saveConnection,
  deleteConnection,
  updateConnection,
} from '../services/tauriClient'

interface ConnectionState {
  search: string
  items: ConnectionProfile[]
  isLoading: boolean
  error: string | null
  setSearch: (value: string) => void
  upsert: (
    profile: ConnectionProfile,
    password?: string,
    sshPassword?: string,
    keyPassphrase?: string,
  ) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  refresh: () => Promise<void>
  setItems: (items: ConnectionProfile[]) => void
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  search: '',
  items: [],
  isLoading: false,
  error: null,
  setSearch: (value) => set({ search: value }),
  setItems: (items) => set({ items, isLoading: false }),

  refresh: async () => {
    try {
      set({ isLoading: true, error: null })
      const response = await listConnections(get().search)
      // Convert ConnectionResponse to ConnectionProfile
      const profiles: ConnectionProfile[] = response.connections.map((c) => ({
        ...c.metadata,
        passwordRef: c.passwordRef,
      }))
      set({ items: profiles, isLoading: false, error: null })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to load connections',
        isLoading: false,
      })
    }
  },

  upsert: async (profile, password, sshPassword, keyPassphrase) => {
    try {
      set({ isLoading: true, error: null })
      const response = await saveConnection({
        id: profile.id,
        name: profile.name,
        type: profile.type,
        host: profile.host,
        port: profile.port,
        username: profile.username,
        database: profile.database,
        ssl: profile.ssl,
        sslConfig: profile.sslConfig,
        schema: profile.schema,
        tags: profile.tags,
        favorite: profile.favorite,
        password,
        ssh: profile.ssh,
        sshPassword,
        keyPassphrase,
      })

      // Update local state
      const updatedProfile: ConnectionProfile = {
        ...profile,
        passwordRef: response.passwordRef,
        updatedAt: new Date().toISOString(),
      }

      const existing = get().items
      const found = existing.find((item) => item.id === profile.id)
      if (found) {
        set({
          items: existing.map((item) =>
            item.id === profile.id ? updatedProfile : item,
          ),
          isLoading: false,
        })
      } else {
        set({ items: [updatedProfile, ...existing], isLoading: false })
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to save connection',
        isLoading: false,
      })
      throw err
    }
  },

  remove: async (id) => {
    try {
      set({ isLoading: true, error: null })
      await deleteConnection(id)
      set({
        items: get().items.filter((item) => item.id !== id),
        isLoading: false,
      })
    } catch (err) {
      set({
        error:
          err instanceof Error ? err.message : 'Failed to delete connection',
        isLoading: false,
      })
      throw err
    }
  },

  toggleFavorite: async (id) => {
    try {
      const profile = get().items.find((item) => item.id === id)
      if (!profile) return

      const updatedProfile: ConnectionProfile = {
        ...profile,
        favorite: !profile.favorite,
        updatedAt: new Date().toISOString(),
      }

      await updateConnection(updatedProfile)
      set({
        items: get().items.map((item) =>
          item.id === id
            ? {
                ...item,
                favorite: !item.favorite,
                updatedAt: new Date().toISOString(),
              }
            : item,
        ),
      })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to toggle favorite',
        isLoading: false,
      })
      throw err
    }
  },
}))
