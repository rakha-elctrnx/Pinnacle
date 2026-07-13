import Editor from '@monaco-editor/react'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { useTheme } from '../../../app/theme'
import { beautifySql, minifySql } from '../utils/sqlFormatter'
import type { SchemaColumn } from '../types/sql'

// Import hooks
import { useQueryLayout } from '../hooks/useQueryLayout'
import { useQueryMonaco } from '../hooks/useQueryMonaco'

// Import subcomponents
import { QueryToolbar } from '../components/query/QueryToolbar'
import { TransactionStatusBar } from '../components/query/TransactionStatusBar'
import { QueryResultPanel } from '../components/query/QueryResultPanel'
import { QueryHistoryPanel } from '../components/query/QueryHistoryPanel'
import { ConfirmTransactionModal } from '../components/query/ConfirmTransactionModal'

const EMPTY_SCHEMA: Record<string, SchemaColumn[]> = {}

export function QueryPage() {
  const { connectionId, queryId } = useParams<{
    connectionId: string
    queryId: string
  }>()
  const {
    selectedConnection,
    explorerData,
    queryExecution,
    setQueryResultTab,
    queryResultTab,
  } = useDataExplorerContext()

  const { theme } = useTheme()

  const {
    querySql,
    isRunningQuery,
    queryResult,
    queryMessages,
    queryDatabase,
    querySchema,
    queryHistoryByConnection,
    updateActiveQuery,
    handleRunQuery,
    registerEditor,
    onQueryDatabaseChange,
    onQuerySchemaChange,
    setActiveQueryId,
    transactionMode,
    activeTransactionId,
    transactionSteps,
    toggleTransactionMode,
    handleCommitTransaction,
    handleRollbackTransaction,
  } = queryExecution

  useEffect(() => {
    if (queryId) setActiveQueryId(queryId)
  }, [queryId, setActiveQueryId])

  const schemaColumnsByTable = explorerData.schemaColumnsByTable ?? EMPTY_SCHEMA
  const connectionType = selectedConnection?.type ?? ''
  const history = connectionId
    ? (queryHistoryByConnection[connectionId] ?? [])
    : []

  const treeData = connectionId
    ? explorerData.treeDataMap[connectionId]
    : undefined
  const databases = useMemo(
    () => treeData?.databases.map((d) => d.name) ?? [],
    [treeData],
  )
  const schemas = useMemo(() => {
    if (connectionType !== 'postgresql' || !treeData) return []
    const db = treeData.databases.find((d) => d.name === queryDatabase)
    return db?.schemas.map((s) => s.name) ?? []
  }, [treeData, queryDatabase, connectionType])

  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmTxExit, setConfirmTxExit] = useState(false)

  // Use layout hook
  const { resultHeight, handleResizeMouseDown } = useQueryLayout(240)

  // Use Monaco hook
  const { handleBeforeMount, handleMount } = useQueryMonaco({
    querySql,
    schemaColumnsByTable,
    handleRunQuery,
    registerEditor,
  })

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <section className="flex h-full min-h-0 flex-col bg-bg-base">
        {/* Toolbar */}
        <QueryToolbar
          connectionType={connectionType}
          queryDatabase={queryDatabase}
          querySchema={querySchema}
          databases={databases}
          schemas={schemas}
          querySql={querySql}
          isRunningQuery={isRunningQuery}
          transactionMode={transactionMode}
          historyOpen={historyOpen}
          onRunQuery={(mode) => void handleRunQuery(mode)}
          onToggleTransactionMode={() => {
            if (transactionMode && activeTransactionId) {
              setConfirmTxExit(true)
            } else {
              void toggleTransactionMode()
            }
          }}
          onBeautify={() => updateActiveQuery(beautifySql(querySql))}
          onMinify={() => updateActiveQuery(minifySql(querySql))}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          onDatabaseChange={onQueryDatabaseChange}
          onSchemaChange={onQuerySchemaChange}
        />

        {/* Transaction Status Bar */}
        {transactionMode && activeTransactionId && (
          <TransactionStatusBar
            activeTransactionId={activeTransactionId}
            stepCount={transactionSteps.length}
            connectionType={connectionType}
            isRunningQuery={isRunningQuery}
            onCommit={() => void handleCommitTransaction()}
            onRollback={() => void handleRollbackTransaction()}
          />
        )}

        {/* Editor */}
        <div className="relative min-h-45 flex-1">
          <Editor
            height="100%"
            language="sql"
            value={querySql}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            onChange={(value) => updateActiveQuery(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              quickSuggestions: {
                other: true,
                comments: false,
                strings: false,
              },
              suggestOnTriggerCharacters: true,
              parameterHints: { enabled: true },
              tabCompletion: 'on',
              acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: 'smart',
              suggest: {
                showKeywords: true,
                showSnippets: true,
                showFunctions: true,
                showClasses: true,
                showFields: true,
                showWords: false,
                insertMode: 'replace',
                preview: true,
              },
              suggestFontSize: 13,
              suggestLineHeight: 22,
              readOnly: isRunningQuery,
            }}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            loading={
              <div className="p-3 text-xs text-text-muted">Loading editor…</div>
            }
          />
          {isRunningQuery && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-bg-base/60 text-xs text-text-muted">
              Running…
            </div>
          )}
        </div>

        {/* Results Panel */}
        <QueryResultPanel
          queryResult={queryResult}
          queryMessages={queryMessages}
          queryResultTab={queryResultTab}
          setQueryResultTab={setQueryResultTab}
          transactionMode={transactionMode}
          transactionSteps={transactionSteps}
          resultHeight={resultHeight}
          handleResizeMouseDown={handleResizeMouseDown}
        />

        {/* Query History */}
        {historyOpen && (
          <QueryHistoryPanel
            history={history}
            onSelectQuery={updateActiveQuery}
          />
        )}

        {/* Confirm Transaction Exit Modal */}
        <ConfirmTransactionModal
          isOpen={confirmTxExit}
          onClose={() => setConfirmTxExit(false)}
          onCommit={() => void handleCommitTransaction()}
          onRollback={() => void handleRollbackTransaction()}
        />
      </section>
    </div>
  )
}
