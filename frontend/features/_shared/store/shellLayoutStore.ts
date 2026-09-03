import { create } from 'zustand'

/**
 * Shell Layout Store — layout-level UI state for the Data Explorer shell.
 *
 * Owns: connection sidebar open state + width, inspector visibility + width.
 */

interface ShellLayoutState {
  /** Whether the connection sidebar is open/visible. */
  sidebarOpen: boolean
  /** Width in px of the connection sidebar. */
  sidebarWidth: number
  inspectorOpen: boolean
  inspectorWidth: number

  // Sidebar actions
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void

  // Inspector actions
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  closeInspector: () => void
  setInspectorWidth: (width: number) => void
}

export const useShellLayoutStore = create<ShellLayoutState>((set) => ({
  sidebarOpen: true,
  sidebarWidth: 280,
  inspectorOpen: false,
  inspectorWidth: 320,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  toggleInspector: () =>
    set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  closeInspector: () => set({ inspectorOpen: false }),
  setInspectorWidth: (width) => set({ inspectorWidth: width }),
}))

/** Convenience hook alias matching the task spec. */
export const useShellLayout = useShellLayoutStore
