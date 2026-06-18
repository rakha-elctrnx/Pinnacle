import { createBrowserRouter, Navigate } from 'react-router-dom'
import { DataExplorerPage } from '../features/data-explorer/pages/DataExplorerPage'
import { DataExplorerLayout } from '../features/data-explorer/layouts/DataExplorerLayout'

/**
 * Top-level router.
 *
 * After the five-region layout refactor (task-025) every authenticated
 * route renders inside `DataExplorerLayout`, which owns the orchestrator
 * context and the five persistent regions (header, footer, navigation
 * strip, sidebar overlay, inspector overlay). The legacy `AppShell`
 * and `SettingsPage` are gone.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/data-explorer/tables" replace />,
  },
  {
    path: '/data-explorer',
    element: <Navigate to="/data-explorer/tables" replace />,
  },
  {
    path: '/data-explorer',
    element: <DataExplorerLayout />,
    children: [
      {
        path: 'tables',
        element: <DataExplorerPage />,
        children: [
          { path: ':tableName', element: <DataExplorerPage /> },
        ],
      },
      {
        path: 'query',
        element: <DataExplorerPage />,
        children: [
          { path: ':queryId', element: <DataExplorerPage /> },
        ],
      },
      {
        path: 'erd',
        element: (
          <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
            ERD coming in Phase 3
          </div>
        ),
      },
    ],
  },
])
