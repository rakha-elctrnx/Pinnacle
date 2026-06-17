import type { LucideIcon } from 'lucide-react'

export interface ToolbarItem {
  id: string
  label?: string
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'danger'
  /** Whether the item is visible in the current state. Default true. */
  visible?: boolean
  /** Whether the item is enabled. Default true. */
  enabled?: boolean
  onClick: () => void
}

interface WorkspaceToolbarProps {
  items: ToolbarItem[]
  /** Additional left-side filter/controls content (rendered before action buttons) */
  leftContent?: React.ReactNode
}

/**
 * Shared toolbar component rendered at the top of each panel.
 * Displays action buttons (max 5) and optional left-side filter/search controls.
 * If no items are visible, the toolbar is not rendered.
 */
export function WorkspaceToolbar({ items, leftContent }: WorkspaceToolbarProps) {
  const visibleItems = items.filter((item) => item.visible !== false).slice(0, 5)

  if (visibleItems.length === 0 && !leftContent) return null

  const variantStyles: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60',
    secondary:
      'border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50',
    danger:
      'border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50',
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-1.5 bg-white">
      {leftContent && <div className="flex items-center gap-2 min-w-0">{leftContent}</div>}
      {visibleItems.length > 0 && (
        <div className="flex items-center gap-0.5 ml-auto">
          {visibleItems.map((item) => {
            const variant = item.variant ?? 'secondary'
            const Icon = item.icon
            const enabled = item.enabled !== false
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                disabled={!enabled}
                title={item.label}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${variantStyles[variant] ?? variantStyles.secondary}`}
              >
                {Icon && <Icon size={13} />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}