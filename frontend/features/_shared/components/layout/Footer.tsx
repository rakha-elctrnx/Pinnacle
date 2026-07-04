import { ChevronRight } from 'lucide-react'
import { useDataExplorerContext } from '../../context/DataExplorerContext'

/**
 * Footer — application-level bottom bar.
 *
 * Phase 1: read-only breadcrumb on the left and the app version on the
 * right. The breadcrumb is derived from the orchestrator context:
 *   Group > Connection > Database > Schema > Table
 *
 * Click-to-navigate is deferred to Phase 2 per the task scope.
 */
export function Footer() {
  const { selectedConnection, selectedTreeNode, groupedConnections } =
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

  // ── Breadcrumb segments
  // selectedTreeNode can be a full tree path
  // ("Acty/Contabo/sr_cafe/public/Tables/MenuItem") or a partial path
  // ("sr_cafe/public/Tables/MenuItem") set by page-level navigation.
  // Detect the format by checking if segment[1] is the connection name.
  const segments: string[] = []
  if (selectedConnection) {
    segments.push(hasGroupInStore ? groupLabel : '—')
    segments.push(selectedConnection.name)
    if (selectedTreeNode) {
      const parts = selectedTreeNode.split('/').filter(Boolean)
      if (parts.length > 2 && parts[1] === selectedConnection.name) {
        // Full tree path — skip group + connection (already added above)
        segments.push(...parts.slice(2))
      } else if (parts.length > 2) {
        // Partial path without group/connection prefix — use as-is
        segments.push(...parts)
      }
    }
  }

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between pt-2 px-4 text-caption text-text-secondary">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 truncate">
        {segments.length === 0 ? (
          <span className="italic text-text-muted">No connection selected</span>
        ) : (
          segments.map((segment, index) => (
            <span key={`${segment}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <ChevronRight size={11} className="shrink-0 text-text-muted/70" aria-hidden="true" />
              )}
              <span className="truncate">{segment}</span>
            </span>
          ))
        )}
      </nav>
      <span className="shrink-0 pl-3 text-mono text-micro text-text-muted">v0.0.0</span>
    </footer>
  )
}
