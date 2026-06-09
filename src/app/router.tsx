import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../layouts/AppShell'
import { DataExplorerPage } from '../features/data-explorer/pages/DataExplorerPage'
import { SettingsPage } from '../features/settings/SettingsPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DataExplorerPage /> },
      { path: 'data-explorer', element: <DataExplorerPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])