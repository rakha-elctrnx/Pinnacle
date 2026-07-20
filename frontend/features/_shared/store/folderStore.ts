import { create } from 'zustand'
import type { Folder } from '../types/domain'

const FOLDERS_STORAGE_KEY = 'pinnacle_folders'

function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Folder[]
  } catch {
    return []
  }
}

function persistFolders(folders: Folder[]) {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  } catch {
    // Ignore storage failures
  }
}

interface FolderState {
  items: Folder[]
  /** Load folders from localStorage */
  refresh: () => void
  /** Create a new folder and return its id */
  create: (name: string) => string
  /** Rename a folder by id */
  rename: (id: string, name: string) => void
  /** Delete a folder by id */
  remove: (id: string) => void
}

export const useFolderStore = create<FolderState>()((set, get) => ({
  items: loadFolders(),

  refresh: () => {
    set({ items: loadFolders() })
  },

  create: (name: string) => {
    const id = crypto.randomUUID()
    const folder: Folder = { id, name }
    const next = [...get().items, folder]
    persistFolders(next)
    set({ items: next })
    return id
  },

  rename: (id: string, name: string) => {
    const next = get().items.map((f) =>
      f.id === id ? { ...f, name } : f,
    )
    persistFolders(next)
    set({ items: next })
  },

  remove: (id: string) => {
    const next = get().items.filter((f) => f.id !== id)
    persistFolders(next)
    set({ items: next })
  },
}))
