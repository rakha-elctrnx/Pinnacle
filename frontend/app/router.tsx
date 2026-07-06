import { createBrowserRouter } from 'react-router-dom'
import { DataExplorerLayout } from '../features/_shared/layouts/DataExplorerLayout'
import { SqlLayout } from '../features/sql/layouts/SqlLayout'
import { TablesPage } from '../features/sql/pages/TablesPage'
import { TableDetailPage } from '../features/sql/pages/TableDetailPage'
import { QueryPage } from '../features/sql/pages/QueryPage'
import { WelcomePage } from '../features/_shared/pages/WelcomePage'
import { ConnectionWelcomePage } from '../features/sql/pages/ConnectionWelcomePage'
import { ElasticLayout } from '../features/elasticsearch/layouts/ElasticLayout'
import { ElasticConnectionWelcomePage } from '../features/elasticsearch/pages/ElasticConnectionWelcomePage'
import { ClusterPage } from '../features/elasticsearch/pages/ClusterPage'
import { IndicesPage } from '../features/elasticsearch/pages/IndicesPage'
import { DocumentsPage } from '../features/elasticsearch/pages/DocumentsPage'
import { QueryConsolePage } from '../features/elasticsearch/pages/QueryConsolePage'
import { MappingsPage } from '../features/elasticsearch/pages/MappingsPage'
import { NewConnectionPage } from '../features/_shared/pages/window'
import { TableDesignerPage } from '../features/sql/pages/window/TableDesignerPage'

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
 * - `path: 'elasticsearch'` renders `ElasticLayout` once for all
 *   Elasticsearch connections. `connectionId` is a pure path parameter —
 *   `ElasticLayout` reads it via `useParams()` and renders the per-connection
 *   chrome (sub-nav tabs, cluster health indicator, index tabs).
 *   The leaf pages (`cluster`, `indices`, `documents`, `query`, `mappings`)
 *   render through `<Outlet />`.
 *
 * Visiting `/` renders the `WelcomePage` — an empty landing that
 * prompts the user to create or select a connection from the sidebar.
 */
export const router = createBrowserRouter([
  {
    path: '/new-connection',
    element: <NewConnectionPage />,
  },
  {
    path: '/table-designer',
    element: <TableDesignerPage />,
   },
   {
    path: '/',
    element: <DataExplorerLayout />,
    children: [
      // Default landing — show welcome page prompting user to open a connection.
      { index: true, element: <WelcomePage /> },

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
              { index: true, element: <ConnectionWelcomePage /> },
              { path: 'tables', element: <TablesPage /> },
              { path: 'tables/:tableName', element: <TableDetailPage /> },
              { path: 'query/:queryId', element: <QueryPage /> },
            ],
          },
        ],
      },

      // Elasticsearch feature routes — follows the same nested-routing pattern
      // as SQL. `elasticsearch` owns `ElasticLayout` (chrome); `:connectionId`
      // is a layout route (no element) whose children are the leaf pages.
      // ElasticLayout reads `connectionId` from useParams and renders <Outlet />
      // for the leaf page with cluster data (health, indices, payload).
      {
        path: 'elasticsearch',
        element: <ElasticLayout />,
        children: [
          {
            path: ':connectionId',
            children: [
              { index: true, element: <ElasticConnectionWelcomePage /> },
              { path: 'cluster', element: <ClusterPage /> },
              { path: 'indices', element: <IndicesPage /> },
              { path: 'documents', element: <DocumentsPage /> },
              { path: 'query', element: <QueryConsolePage /> },
              { path: 'mappings', element: <MappingsPage /> },
            ],
          },
        ],
      },
    ],
  },
])
