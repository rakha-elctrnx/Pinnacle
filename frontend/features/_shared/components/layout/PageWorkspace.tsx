import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { TabBar } from './TabBar'
import { useTabStore } from '../../store/tabStore'

/**
 * PageWorkspace — the central content region of the five-region layout.
 *
 * Renders the nested route outlet inside a flex-1 container so it
 * fills all available space between the header, footer, navigation
 * strip, sidebar and inspector panel. It carries no application
 * state — pages mount here and consume `useDataExplorerContext`.
 *
 * When tabs are open the `TabBar` is shown above the content area.
 *
 * Registers a global `Cmd+W` / `Ctrl+W` keyboard shortcut to close the
 * active tab (task-010f).
 */
export function PageWorkspace() {
  const navigate = useNavigate()

  // Global Cmd+W / Ctrl+W — close active tab.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
        e.preventDefault()
        const { activeTabId, closeTab } = useTabStore.getState()
        if (!activeTabId) return
        closeTab(activeTabId)

        // Navigate to the new active tab's route, or '/' if all tabs closed.
        const { activeTabId: nextActiveId, tabs } = useTabStore.getState()
        const nextTab = nextActiveId
          ? tabs.find((t) => t.id === nextActiveId)
          : null
        navigate(nextTab?.route ?? '/')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
      <TabBar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
