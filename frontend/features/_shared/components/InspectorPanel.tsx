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
    <aside className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-outline-variant pl-3 pr-2 py-2">
        <p className="text-sm font-semibold text-on-surface">Inspector</p>
        <button
          type="button"
          onClick={closeInspector}
          className="rounded-lg p-1 text-on-surface hover:bg-surface-variant"
          aria-label="Close inspector"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-outline">
        Nothing to inspect.
      </div>
    </aside>
  )
}
