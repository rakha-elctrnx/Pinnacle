import { create } from 'zustand'

/**
 * Shell Layout Store — layout-level UI state for the Data Explorer shell.
 *
 * Phase 1 (current): in-memory only — width/visibility reset on reload.
 * Phase 2 (deferred): persist `sidebarWidth` and `inspectorWidth` to
 * localStorage or a Tauri store plugin.
 *
 * Owns: connection-sidebar width, inspector visibility + width. The
 * `NavigationStrip` and its toggleable sidebar overlay were removed —
 * the connection sidebar is now always visible, so visibility actions
 * for it are no longer needed.
 */

interface ShellLayoutState {
  /** Width in px of the always-visible connection sidebar. */
  sidebarWidth: number
  inspectorOpen: boolean
  inspectorWidth: number

  // Sidebar actions
  setSidebarWidth: (width: number) => void

  // Inspector actions
  setInspectorOpen: (open: boolean) => void
  toggleInspector: () => void
  closeInspector: () => void
  setInspectorWidth: (width: number) => void
}

export const useShellLayoutStore = create<ShellLayoutState>((set) => ({
  sidebarWidth: 280,
  inspectorOpen: false,
  inspectorWidth: 320,

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setInspectorOpen: (open) => set({ inspectorOpen: open }),
  toggleInspector: () =>
    set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  closeInspector: () => set({ inspectorOpen: false }),
  setInspectorWidth: (width) => set({ inspectorWidth: width }),
}))

/** Convenience hook alias matching the task spec. */
export const useShellLayout = useShellLayoutStore
