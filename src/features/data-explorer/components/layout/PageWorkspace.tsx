import { Outlet } from 'react-router-dom'

/**
 * PageWorkspace — the central content region of the five-region layout.
 *
 * Renders the nested route outlet inside a flex-1 container so it
 * fills all available space between the header, footer, navigation
 * strip, sidebar and inspector panel. It carries no application
 * state — pages mount here and consume `useDataExplorerContext`.
 */
export function PageWorkspace() {
  return (
    <div className="flex-1 min-w-0 h-full overflow-hidden">
      <Outlet />
    </div>
  )
}
