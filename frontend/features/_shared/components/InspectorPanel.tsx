import { X } from 'lucide-react'
import { useShellLayout } from '../store/shellLayoutStore'

/**
 * InspectorPanel — right-side overlay panel.
 *
 * The panel body is intentionally empty in Phase 1. The component is
 * mounted from `DataExplorerLayout` and visibility is fully controlled
 * by the `useShellLayout` store (`inspectorOpen`). The header is shown
 * so the user can identify the panel and close it via the X button;
 * a duplicate toggle also lives in the top `Header` bar.
 */
export function InspectorPanel() {
  const closeInspector = useShellLayout((s) => s.closeInspector)

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-bg-subtle/40">
      <div className="flex shrink-0 items-center justify-between border-b border-border-default/60 bg-bg-muted/60 pl-3 pr-2.5 py-2.5 backdrop-blur-sm">
        <p className="text-label text-text-primary">Inspector</p>
        <button
          type="button"
          onClick={closeInspector}
          className="rounded-md p-1 text-text-secondary transition-all duration-150 hover:bg-bg-hover hover:text-primary active:scale-95"
          aria-label="Close inspector"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 text-center text-caption text-text-muted">
        Nothing to inspect.
      </div>
    </aside>
  )
}
