import {
  Database,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  SquareTerminal,
  X,
} from 'lucide-react'
import type { ConnectionProfile } from '../../../../../types/domain'
import type {
  ConnectionStatus,
  ExplorerTreeData,
  QueryResult,
  QueryResultTab,
  QueryTab,
  SavedQuery,
  SqlTableListItem,
  TableStats,
  TableInfoTab,
} from '../../../types'
import { statusStyle } from '../../../constants'
import { TableBrowser } from './TableBrowser'
import { QueryEditor } from './QueryEditor'
import { SqlTableList } from './SqlTableList'

interface SqlExplorerWorkspaceProps {
  selectedConnection: ConnectionProfile | null
  lastRefreshedAt: string
  selectedTable: string | null
  tableInfoTab: TableInfoTab
  onTableInfoTabChange: (tab: TableInfoTab) => void
  realTableStats: TableStats | null
  tableDataLoading: boolean
  realTableStructure: Record<string, string>[]
  realTableIndexes: string[]
  realTableColumns: string[]
  realTableRows: Record<string, string>[]
  sqlTableListLoading: boolean
  sqlTableList: SqlTableListItem[]
  isSqlTableListView: boolean
  queryTabs: QueryTab[]
  queryTabsDirty: Record<string, boolean>
  activeQueryTab: QueryTab | null
  activeQueryTabId: string | null
  isRunningQuery: boolean
  queryResult: QueryResult | null
  queryMessages: string[]
  queryResultTab: QueryResultTab
  queryHistoryByConnection: string[]
  savedQueries: SavedQuery[]
  openedTableTabs: Array<{ id: string; label: string }>
  activeTableTabId: string | null
  selectedConnectionId: string | null
  onSelectedConnectionIdChange: (id: string | null) => void
  onExpandedConnectionIdChange: (id: string | null) => void
  recentConnections: ConnectionProfile[]
  selectedConnectionStatus: ConnectionStatus
  isDetailsPanelOpen: boolean
  onToggleDetailsPanel: () => void
  treeData: ExplorerTreeData | null
  selectedConnectionType: string
  queryDatabase: string
  querySchema: string
  onQueryDatabaseChange: (db: string) => void
  onQuerySchemaChange: (schema: string) => void
  onActiveQueryTabIdChange: (id: string) => void
  onCloseQueryTab: (id: string) => void
  onActiveTableTabIdChange: (id: string) => void
  onCloseTableTab: (id: string) => void
  onAddQueryTab: () => void
  onSelectTableFromList: (tableName: string) => void
  onUpdateActiveQuery: (value: string) => void
  onSaveQuery: () => void
  onUseSavedQuery: (sql: string) => void
  onQueryResultTabChange: (tab: QueryResultTab) => void
  onRunQuery: (mode: 'run' | 'run-selected' | 'explain') => Promise<void>
}

export function SqlExplorerWorkspace({
  selectedConnection,
  lastRefreshedAt,
  selectedTable,
  tableInfoTab,
  onTableInfoTabChange,
  realTableStats,
  tableDataLoading,
  realTableStructure,
  realTableIndexes,
  realTableColumns,
  realTableRows,
  sqlTableListLoading,
  sqlTableList,
  isSqlTableListView,
  queryTabs,
  queryTabsDirty,
  activeQueryTab,
  activeQueryTabId,
  treeData,
  selectedConnectionType,
  queryDatabase,
  querySchema,
  onQueryDatabaseChange,
  onQuerySchemaChange,
  isRunningQuery,
  queryResult,
  queryMessages,
  queryResultTab,
  queryHistoryByConnection,
  savedQueries,
  openedTableTabs,
  activeTableTabId,
  selectedConnectionId,
  onSelectedConnectionIdChange,
  onExpandedConnectionIdChange,
  recentConnections,
  selectedConnectionStatus,
  isDetailsPanelOpen,
  onToggleDetailsPanel,
  onActiveQueryTabIdChange,
  onCloseQueryTab,
  onActiveTableTabIdChange,
  onCloseTableTab,
  onAddQueryTab,
  onSelectTableFromList,
  onUpdateActiveQuery,
  onSaveQuery,
  onUseSavedQuery,
  onQueryResultTabChange,
  onRunQuery,
}: SqlExplorerWorkspaceProps) {
  if (!selectedConnection) {
    return (
      <div className="flex h-full items-center justify-center pb-20">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate-400"
            >
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M3 5v14a9 3 0 0 0 18 0V5" />
              <path d="M3 12a9 3 0 0 0 18 0" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-slate-700">No Connection Selected</h3>
          <p className="max-w-xs text-xs text-slate-500">
            Select an existing connection from the sidebar or create a new one to start exploring your data.
          </p>
        </div>
      </div>
    )
  }

  // Determine whether we're showing a table or query based on which tab type is active
  const isTableView = activeTableTabId !== null && openedTableTabs.some((t) => t.id === activeTableTabId)
  const showTableListView = isSqlTableListView && !isTableView
  const hasContent = openedTableTabs.length > 0 || queryTabs.length > 0

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Unified Tab Bar ── */}
      {hasContent && (
        <div className="flex flex-wrap items-center gap-1 pt-3 px-3 bg-gray-100">
          {openedTableTabs.map((tab) => {
            const isActive = tab.id === activeTableTabId
            return (
              <div
                key={tab.id}
                className={[
                  'inline-flex items-center gap-1.5 rounded-t-lg border px-2 py-1.5 text-xs',
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                <Database size={12} />
                <button type="button" onClick={() => onActiveTableTabIdChange(tab.id)}>
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTableTab(tab.id)}
                  className="rounded p-0.5 hover:bg-slate-200/70"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
          {queryTabs.map((tab) => {
            const isActive = tab.id === activeQueryTabId
            const isDirty = queryTabsDirty[tab.id]
            return (
              <div
                key={tab.id}
                className={[
                  'inline-flex items-center gap-1.5 rounded-t-lg border px-2 py-1.5 text-xs',
                  isActive
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                <SquareTerminal size={12} />
                <button type="button" onClick={() => onActiveQueryTabIdChange(tab.id)}>
                  {tab.title}
                </button>
                {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                <button
                  type="button"
                  onClick={() => onCloseQueryTab(tab.id)}
                  className="rounded p-0.5 hover:bg-slate-200/70"
                >
                  <X size={10} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={onAddQueryTab}
            className="inline-flex items-center gap-1 rounded-t-lg border border-dashed border-slate-300 px-2 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            <Plus size={12} />
          </button>
        </div>
      )}

      {!hasContent && !showTableListView && (
        <section className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200">
              <svg
                className="w-7 h-7 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776"
                />
              </svg>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold text-slate-700">
                Workspace Ready
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Open a table from the sidebar or create a new query tab to start exploring your data.
              </p>
            </div>
          </div>
        </section>
      )}

      {isTableView && (
        <section className="flex-1 min-h-0 overflow-hidden bg-white">
          <div className="h-full min-h-0">
            <TableBrowser
              selectedTable={selectedTable}
              tableInfoTab={tableInfoTab}
              onTableInfoTabChange={onTableInfoTabChange}
              tableDataLoading={tableDataLoading}
              displayColumns={realTableColumns}
              displayRows={realTableRows}
              realTableStructure={realTableStructure}
              realTableIndexes={realTableIndexes}
              embedded
            />
          </div>
        </section>
      )}

      {showTableListView && (
        <SqlTableList
          rows={sqlTableList}
          loading={sqlTableListLoading}
          onSelectTable={onSelectTableFromList}
        />
      )}

      {!isTableView && !showTableListView && hasContent && (
        <section>
          {activeQueryTab && (
          <QueryEditor
            queryTabs={queryTabs}
            activeQueryTab={activeQueryTab}
            activeQueryTabId={activeQueryTabId ?? ''}
            isRunningQuery={isRunningQuery}
            queryResult={queryResult}
            queryMessages={queryMessages}
            queryResultTab={queryResultTab}
            queryHistoryByConnection={queryHistoryByConnection}
            savedQueries={savedQueries}
            displayColumns={queryResult?.columns.length ? queryResult.columns : realTableColumns}
            displayRows={queryResult?.rows.length ? queryResult.rows : realTableRows}
            treeData={treeData}
            selectedConnectionType={selectedConnectionType}
            queryDatabase={queryDatabase}
            querySchema={querySchema}
            onQueryDatabaseChange={onQueryDatabaseChange}
            onQuerySchemaChange={onQuerySchemaChange}
            onActiveQueryTabIdChange={onActiveQueryTabIdChange}
            onAddQueryTab={onAddQueryTab}
            onUpdateActiveQuery={onUpdateActiveQuery}
            onSaveQuery={onSaveQuery}
            onUseSavedQuery={onUseSavedQuery}
            onQueryResultTabChange={onQueryResultTabChange}
            onRunQuery={onRunQuery}
          />
          )}
        </section>
      )}

      </div>

      {/* ── Context Bar ── */}
      <div className="shrink-0 flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 font-semibold text-slate-600">
          {selectedConnection.name}
        </span>
        <span className="text-slate-400">·</span>
        <span>{selectedConnection.host}:{selectedConnection.port}</span>
        <span className="text-slate-400">·</span>
        <span>DB: {queryDatabase || selectedConnection.database}</span>
        {querySchema && (
          <>
            <span className="text-slate-400">·</span>
            <span>Schema: {querySchema}</span>
          </>
        )}
        <span className="text-slate-400">·</span>
        <span className="font-medium text-slate-600">
          {isTableView ? 'Table View' : showTableListView ? 'Table List' : 'Query Editor'}
        </span>
      </div>

      <footer className="shrink-0 border border-slate-200 bg-gray-200 px-3 py-1.5 text-[11px] text-slate-600 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span>{selectedConnection.type.toUpperCase()} · last refresh {lastRefreshedAt}</span>
            {realTableStats && (
              <div className="flex items-center gap-4 font-semibold whitespace-nowrap rounded-md px-2 py-1">
                <span>Rows: {realTableStats.rows} </span>
                <span>Columns: {realTableStats.columns}</span>
                <span>Indexes: {realTableStats.indexes}</span>
              </div>
            )}
          </div>

          <div className="ml-auto inline-flex items-center gap-1">
            <select
              value={selectedConnectionId ?? ''}
              onChange={(event) => {
                const id = event.target.value || null
                onSelectedConnectionIdChange(id)
                if (id) onExpandedConnectionIdChange(id)
              }}
              className="h-7 rounded-md border-0 bg-transparent px-2 text-[11px] text-slate-700 focus:outline-none"
            >
              <option value="">Recent Connections</option>
              {recentConnections.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {connection.name}
                </option>
              ))}
            </select>

            <span className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold text-slate-600">
              <span className={`h-2 w-2 rounded-full ${statusStyle[selectedConnectionStatus]}`} />
              {selectedConnectionStatus}
            </span>

            <button
              type="button"
              onClick={onToggleDetailsPanel}
              className="inline-flex h-7 items-center rounded-md px-2 text-slate-600 hover:bg-gray-300 transition-colors"
              title={isDetailsPanelOpen ? 'Hide details panel' : 'Show details panel'}
            >
              {isDetailsPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}