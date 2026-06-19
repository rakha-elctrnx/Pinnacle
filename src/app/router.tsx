import { createBrowserRouter, Navigate } from 'react-router-dom'
import { DataExplorerLayout } from '../features/data-explorer/layouts/DataExplorerLayout'
import { SqlLayout } from '../features/sql/layouts/SqlLayout'
import { TablesPage } from '../features/sql/pages/TablesPage'
import { TableDetailPage } from '../features/sql/pages/TableDetailPage'
import { QueryPage } from '../features/sql/pages/QueryPage'

/**
 * Top-level router.
 *
 * Follows the nested-routing pattern from
 * `docs/decisions/adr-20260619-modular-folder-structure.md`:
 * - `path: '/'` renders `DataExplorerLayout` (the shell: header, footer,
 *   sidebar, inspector + global modals).
 * - `path: 'sql'` renders `SqlLayout` once for all SQL connections.
 *   `connectionId` is a pure path parameter (no element) — `SqlLayout`
 *   reads it via `useParams()` and renders the per-connection chrome
 *   (toolbar, sub-nav, tab bar, db/schema selector, SQL modals).
 *   The leaf pages (`tables`, `tables/:tableName`, `query`, `erd`)
 *   render through `<Outlet />`.
 *
 * Visiting `/` redirects to a connections landing placeholder; once a
 * connections list page exists this can point there.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <DataExplorerLayout />,
    children: [
      // Default landing — redirect to SQL section for now.
      { index: true, element: <Navigate to="/sql" replace /> },

      // SQL feature routes — matches ADR pattern. `sql` owns `SqlLayout`
      // (chrome); `:connectionId` is a layout route (no element) whose
      // children are the leaf pages. SqlLayout reads `connectionId`
      // from useParams and renders <Outlet /> for the leaf page.
      {
        path: 'sql',
        element: <SqlLayout />,
        children: [
          {
            path: ':connectionId',
            children: [
              { path: 'tables', element: <TablesPage /> },
              { path: 'tables/:tableName', element: <TableDetailPage /> },
              { path: 'query', element: <QueryPage /> },
              { path: 'erd', element: <div className="p-6 text-on-surface-variant">ERD — coming in Phase 3</div> },
            ],
          },
        ],
      },
    ],
  },
])
