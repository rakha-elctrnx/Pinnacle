import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { Play, Database, Save, RotateCcw } from 'lucide-react'
import * as monacoEditor from 'monaco-editor'
import { useDataExplorerContext } from '../../_shared/context/DataExplorerContext'
import { useTheme } from '../../../app/theme'
import { ActionButton } from '../../_shared/components/ui/ActionButton'
import { executeSql } from '../clients/sql'
import { getConnPayloadWithPassword } from '../../_shared/utils'
import { registerSqlProviders } from '../components/query/SqlCompletionProvider'
import { DataGrid } from '../components/DataGrid'
import { useTabStore } from '../../_shared/store/tabStore'
import { beautifySql } from '../utils/sqlFormatter'
import type { SchemaColumn } from '../types/sql'
import type { QueryResult } from '../clients/sql'
import { validateSql } from '../components/query/SqlValidator'

const EMPTY_SCHEMA: Record<string, SchemaColumn[]> = {}

const VIEW_TEMPLATE = `CREATE VIEW schema_name.view_name AS
SELECT
  column1,
  column2
FROM
  table_name
WHERE
  condition;`

export function ViewEditorPage() {
  const { connectionId, viewName } = useParams<{
    connectionId: string
    viewName: string
  }>()
  const navigate = useNavigate()

  const { selectedConnection, explorerData } = useDataExplorerContext()

  const { theme } = useTheme()

  const isNewView = viewName === 'new'
  const pageTitle = isNewView ? 'Create View' : `Edit View: ${viewName}`

  const [editorValue, setEditorValue] = useState(isNewView ? VIEW_TEMPLATE : '')
  const [isLoadingDefinition, setIsLoadingDefinition] = useState(
    !isNewView && !!viewName,
  )
  const [isExecuting, setIsExecuting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const treeData = connectionId
    ? explorerData.treeDataMap[connectionId]
    : undefined
  const databases = useMemo(
    () => treeData?.databases.map((d) => d.name) ?? [],
    [treeData],
  )
  const [selectedDb, setSelectedDb] = useState(
    explorerData.selectedDatabase || selectedConnection?.database || '',
  )
  const [selectedSchema, setSelectedSchema] = useState(
    selectedConnection?.type === 'postgresql'
      ? explorerData.selectedSchema || 'public'
      : '',
  )
  const schemas = useMemo(() => {
    if (selectedConnection?.type !== 'postgresql' || !treeData) return []
    const db = treeData.databases.find((d) => d.name === selectedDb)
    return db?.schemas.map((s) => s.name) ?? []
  }, [treeData, selectedDb, selectedConnection])

  useEffect(() => {
    if (schemas.length > 0 && !schemas.includes(selectedSchema)) {
      setSelectedSchema(schemas[0])
    }
  }, [schemas, selectedSchema])

  // Fetch existing view definition
  useEffect(() => {
    if (isNewView || !viewName || !selectedConnection) return

    let cancelled = false
    setIsLoadingDefinition(true)
    setError(null)

    const fetchDefinition = async () => {
      try {
        const payload = await getConnPayloadWithPassword(selectedConnection)
        if (cancelled) return

        let query: string
        if (selectedConnection.type === 'postgresql') {
          const schema =
            selectedSchema || explorerData.selectedSchema || 'public'
          query = `SELECT pg_get_viewdef('${schema.replace(/'/g, "''")}.${viewName.replace(/'/g, "''")}', true) AS definition`
        } else {
          query = `SHOW CREATE VIEW \`${viewName}\``
        }

        const res = await executeSql({
          connection: { ...payload, database: selectedDb || payload.database },
          sql: query,
        })

        if (cancelled) return

        let definition: string
        if (selectedConnection.type === 'postgresql') {
          definition = String(res.rows[0]?.definition || '')
        } else {
          // MySQL: column name is "Create View"
          const cols = Object.keys(res.rows[0] || {})
          definition = String(
            res.rows[0]?.['Create View'] || res.rows[0]?.[cols[0]] || '',
          )
        }

        let fullDefinition = definition
        if (!fullDefinition.toUpperCase().trimStart().startsWith('CREATE')) {
          if (selectedConnection.type === 'postgresql') {
            fullDefinition = `CREATE OR REPLACE VIEW ${q(selectedSchema || explorerData.selectedSchema || 'public')}.${q(viewName)} AS\n${definition}`
          } else {
            fullDefinition = `CREATE OR REPLACE VIEW \`${viewName}\` AS\n${definition}`
          }
        }

        if (!fullDefinition.trim().endsWith(';')) {
          fullDefinition += ';'
        }

        setEditorValue(beautifySql(fullDefinition) || fullDefinition)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setError(
            `Failed to fetch view definition: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      } finally {
        if (!cancelled) setIsLoadingDefinition(false)
      }
    }

    void fetchDefinition()
    return () => {
      cancelled = true
    }
  }, [
    viewName,
    selectedConnection,
    selectedDb,
    selectedSchema,
    isNewView,
    explorerData.selectedSchema,
  ])

  // Update tab in registry
  useEffect(() => {
    if (!connectionId || !viewName) return
    const tabId = isNewView
      ? `${connectionId}:view:new`
      : `${connectionId}:view:${viewName}`
    useTabStore.getState().openTab({
      id: tabId,
      label: pageTitle,
      type: selectedConnection?.type ?? 'postgresql',
      pageType: 'query',
      route: `/sql/${connectionId}/views/${viewName}`,
      connectionId,
    })
  }, [connectionId, viewName, pageTitle, selectedConnection])

  const handleRun = useCallback(async () => {
    if (!selectedConnection || !editorValue.trim()) return

    setIsExecuting(true)
    setError(null)
    setResult(null)

    try {
      const payload = await getConnPayloadWithPassword(selectedConnection)
      const res = await executeSql({
        connection: { ...payload, database: selectedDb || payload.database },
        sql: editorValue,
      })
      setResult(res)
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsExecuting(false)
    }
  }, [selectedConnection, editorValue, selectedDb])

  const handleSave = useCallback(async () => {
    if (!selectedConnection || !editorValue.trim()) return

    setIsSaving(true)
    setError(null)

    try {
      const payload = await getConnPayloadWithPassword(selectedConnection)
      let sql = editorValue.trim()
      if (sql.endsWith(';')) sql = sql.slice(0, -1)

      const upper = sql.toUpperCase().trimStart()
      if (!upper.startsWith('CREATE') && !upper.startsWith('ALTER')) {
        const targetName = viewName && !isNewView ? viewName : 'new_view'
        const schemaPrefix =
          selectedConnection.type === 'postgresql'
            ? `${q(selectedSchema)}.`
            : ''
        sql = `CREATE OR REPLACE VIEW ${schemaPrefix}${q(targetName)} AS ${sql}`
      }

      await executeSql({
        connection: { ...payload, database: selectedDb || payload.database },
        sql,
      })

      setError(null)
      if (connectionId && selectedConnection) {
        const dbName = selectedDb || selectedConnection.database
        void explorerData.fetchDatabaseDetails(
          connectionId,
          selectedConnection,
          dbName,
        )
      }

      setResult({
        rowsAffected: 0,
        elapsedMs: 0,
        columns: [],
        rows: [],
      })

      if (isNewView && connectionId) {
        navigate(`/sql/${connectionId}/views/${viewName || 'new_view'}`, {
          replace: true,
        })
      }
    } catch (err) {
      setError(
        `Failed to save view: ${err instanceof Error ? err.message : String(err)}`,
      )
    } finally {
      setIsSaving(false)
    }
  }, [
    selectedConnection,
    editorValue,
    selectedDb,
    selectedSchema,
    viewName,
    isNewView,
    connectionId,
    explorerData,
    navigate,
  ])

  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const monacoRef = useRef<typeof monacoEditor | null>(null)
  const handleRunRef = useRef(handleRun)
  useEffect(() => {
    handleRunRef.current = handleRun
  }, [handleRun])

  const schemaColumnsByTable = explorerData.schemaColumnsByTable ?? EMPTY_SCHEMA
  const tablesRef = useRef(schemaColumnsByTable)
  useEffect(() => {
    tablesRef.current = schemaColumnsByTable
  }, [schemaColumnsByTable])

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerSqlProviders(monacoInstance, tablesRef)
  }

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor
    const model = editor.getModel()
    if (model) {
      const mono = monacoInstance as unknown as typeof monacoEditor
      mono.editor.setModelMarkers(
        model,
        'sql-validator',
        validateSql(editorValue, mono),
      )
    }
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      ],
      run: () => {
        void handleRunRef.current()
      },
    })
  }

  const handleEditorChange = useCallback((value: string | undefined) => {
    setEditorValue(value ?? '')
    const mono = monacoRef.current
    const editor = editorRef.current
    if (mono && editor) {
      const model = editor.getModel()
      if (model) {
        mono.editor.setModelMarkers(
          model,
          'sql-validator',
          validateSql(value ?? '', mono),
        )
      }
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-full min-h-0 flex-col bg-bg-base">
        <div className="flex items-center gap-1 border-b border-border-default px-1.5 py-1.5">
          <ActionButton
            icon={<Play size={14} />}
            aria-label="Run (Ctrl+Enter)"
            variant="accent"
            disabled={isExecuting || isSaving || !editorValue.trim()}
            onClick={handleRun}
          />
          <ActionButton
            icon={<Save size={14} />}
            aria-label={isNewView ? 'Create View' : 'Save View'}
            variant="success"
            disabled={isExecuting || isSaving || !editorValue.trim()}
            onClick={handleSave}
          />
          <span className="mx-0.5 h-5 w-px bg-border-default" />
          <div className="flex items-center gap-1.5">
            <select
              value={selectedDb}
              onChange={(e) => setSelectedDb(e.target.value)}
              className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
            >
              {!databases.includes(selectedDb) && selectedDb && (
                <option value={selectedDb}>{selectedDb}</option>
              )}
              {databases.map((db) => (
                <option key={db} value={db}>
                  {db}
                </option>
              ))}
            </select>
            {selectedConnection?.type === 'postgresql' && (
              <select
                value={selectedSchema}
                onChange={(e) => setSelectedSchema(e.target.value)}
                className="h-6 rounded border border-border-default bg-bg-base px-1 text-[11px] font-mono outline-none focus:border-primary"
              >
                {schemas.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
          </div>
          <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
            <Database size={12} />
            {isNewView ? 'Create View' : `Edit: ${viewName}`}
          </span>
        </div>

        {isLoadingDefinition && (
          <div className="flex items-center justify-center py-8 text-text-muted">
            <RotateCcw size={16} className="mr-2 animate-spin" />
            Loading view definition...
          </div>
        )}

        {!isLoadingDefinition && error && (
          <div className="mx-2 mt-2 rounded border border-red-500/30 bg-red-500/5 px-3 py-2 text-[12px] text-red-500">
            {error}
          </div>
        )}

        {!isLoadingDefinition && (
          <div className="relative min-h-45 flex-1">
            <Editor
              height="100%"
              language="sql"
              value={editorValue}
              theme={theme === 'dark' ? 'vs-dark' : 'light'}
              onChange={handleEditorChange}
              beforeMount={handleBeforeMount}
              onMount={handleMount}
              options={{
                fontSize: 13,
                fontFamily:
                  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                lineNumbers: 'on',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 8 },
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                suggest: { showKeywords: true, showSnippets: true },
              }}
            />
          </div>
        )}

        {(result || isExecuting) && !isLoadingDefinition && (
          <>
            <div className="flex items-center gap-2 border-t border-border-default px-2 py-1 text-[11px] text-text-muted">
              {isExecuting ? (
                <span className="flex items-center gap-1">
                  <RotateCcw size={12} className="animate-spin" />
                  Running...
                </span>
              ) : result ? (
                <span className="text-green-500">
                  {result.rowsAffected > 0
                    ? `${result.rowsAffected} row(s) affected`
                    : result.rows.length > 0
                      ? `${result.rows.length} row(s) returned`
                      : 'Executed successfully'}
                  {' \u00b7 '}
                  {result.elapsedMs}ms
                </span>
              ) : null}
            </div>
            {result && result.columns.length > 0 && (
              <div className="min-h-40 flex-1 overflow-auto border-t border-border-default">
                <DataGrid columns={result.columns} rows={result.rows} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function q(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}
