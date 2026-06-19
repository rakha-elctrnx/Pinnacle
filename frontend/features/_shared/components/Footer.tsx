import { ChevronRight } from 'lucide-react'
import { useDataExplorerContext } from '../context/DataExplorerContext'

/**
 * Footer — application-level bottom bar.
 *
 * Phase 1: read-only breadcrumb on the left and the app version on the
 * right. The breadcrumb is derived from the orchestrator context:
 *   Group > Connection > Database > Schema > Tables > Table
 *
 * Click-to-navigate is deferred to Phase 2 per the task scope.
 */
export function Footer() {
  const { selectedConnection, explorerData, selectedTreeNode, groupedConnections } =
    useDataExplorerContext()

  // Derive the group label for the selected connection (its first tag).
  const groupLabel = (() => {
    if (!selectedConnection) return '—'
    const group = selectedConnection.tags?.[0]
    return group || 'Ungrouped'
  })()

  // List groups the connection belongs to (for fallback display when
  // groupedConnections keys do not include the active group).
  const hasGroupInStore = selectedConnection
    ? Object.prototype.hasOwnProperty.call(groupedConnections, groupLabel)
    : false

  // Display labels for breadcrumb segments. Empty strings collapse the
  // segment out of the rendered chain so the breadcrumb never shows
  // dangling chevrons.
  const segments: string[] = []
  if (selectedConnection) {
    segments.push(hasGroupInStore ? groupLabel : '—')
    segments.push(selectedConnection.name)
    if (explorerData.selectedDatabase) segments.push(explorerData.selectedDatabase)
    if (explorerData.selectedSchema) segments.push(explorerData.selectedSchema)
    if (selectedTreeNode) segments.push(selectedTreeNode)
  }

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between pt-2 px-4 text-[11px] text-on-surface-variant">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 truncate">
        {segments.length === 0 ? (
          <span className="italic text-outline">No connection selected</span>
        ) : (
          segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight size={11} className="shrink-0 text-outline/70" aria-hidden="true" />
              )}
              <span className="truncate">{segment}</span>
            </span>
          ))
        )}
      </nav>
      <span className="shrink-0 pl-3 font-mono text-[10px] text-outline">v0.0.0</span>
    </footer>
  )
}
