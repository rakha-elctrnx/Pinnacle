import { useCallback, useEffect, useMemo, useState } from 'react'
import { executeSql } from '../clients/sql'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { QueryTab, QueryResult, ConnectionStatus, SavedQuery } from '../../_shared/types/shared'
import { isSqlConnectionType, getConnPayloadWithPassword } from '../../_shared/utils'

interface QueryTabInternal {
  id: string
  title: string
  sql: string
  initialSql: string
}

interface UseQueryExecutionParams {
  selectedConnection: ConnectionProfile | null
  selectedSchema: string
  selectedDatabase: string
  setConnectionStatuses: React.Dispatch<React.SetStateAction<Record<string, ConnectionStatus>>>
}

interface UseQueryExecutionReturn {
  queryTabs: QueryTab[]
  queryTabsDirty: Record<string, boolean>
  activeQueryTabId: string | null
  activeQueryTab: QueryTab | null
  isRunningQuery: boolean
  queryResult: QueryResult | null
  queryMessages: string[]
  queryHistoryByConnection: Record<string, string[]>
  savedQueriesByConnection: Record<string, SavedQuery[]>
  queryDatabase: string
  querySchema: string
  onQueryDatabaseChange: (db: string) => void
  onQuerySchemaChange: (schema: string) => void
  addQueryTab: () => void
  closeQueryTab: (id: string) => void
  openQueryTabFromTree: (databaseName?: string) => void
  updateActiveQuery: (value: string) => void
  saveActiveQuery: () => void
  applySavedQueryToActiveTab: (sql: string) => void
  setActiveQueryTabId: (id: string) => void
  handleRunQuery: (mode: 'run' | 'run-selected' | 'explain') => Promise<void>
  /** Reset all query execution state — called when connection is closed. */
  resetQueryData: () => void
}

const SAVED_QUERY_STORAGE_KEY = 'data-explorer.saved-queries'

export function useQueryExecution({
  selectedConnection,
  selectedSchema,
  selectedDatabase,
  setConnectionStatuses,
}: UseQueryExecutionParams): UseQueryExecutionReturn {
  const [queryTabs, setQueryTabs] = useState<QueryTabInternal[]>([])
  const [activeQueryTabId, setActiveQueryTabId] = useState<string | null>(null)
  const [isRunningQuery, setIsRunningQuery] = useState(false)
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null)
  const [queryMessages, setQueryMessages] = useState<string[]>(['Ready.'])
  const [queryHistoryByConnection, setQueryHistoryByConnection] = useState<Record<string, string[]>>({})
  const [queryDatabase, setQueryDatabase] = useState(() => selectedDatabase || (selectedConnection?.database ?? ''))
  const [querySchema, setQuerySchema] = useState(() => selectedSchema)
  const [savedQueriesByConnection, setSavedQueriesByConnection] = useState<Record<string, SavedQuery[]>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(SAVED_QUERY_STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, SavedQuery[]>) : {}
    } catch {
      return {}
    }
  })

  const activeQueryTab = useMemo(
    () => queryTabs.find((tab) => tab.id === activeQueryTabId) ?? null,
    [queryTabs, activeQueryTabId],
  )

  const queryTabsDirty = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const tab of queryTabs) {
      map[tab.id] = tab.sql !== tab.initialSql
    }
    return map
  }, [queryTabs])

  const appendMessage = useCallback((message: string) => {
    setQueryMessages((prev) => [`${new Date().toLocaleTimeString()}  ${message}`, ...prev].slice(0, 20))
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SAVED_QUERY_STORAGE_KEY, JSON.stringify(savedQueriesByConnection))
  }, [savedQueriesByConnection])

  const addQueryTab = useCallback(() => {
    const nextNumber = queryTabs.length + 1
    const id = `query-${Date.now()}`
    const sql = 'SELECT 1;'
    setQueryTabs((prev) => [...prev, { id, title: `Query ${nextNumber}`, sql, initialSql: sql }])
    setActiveQueryTabId(id)
  }, [queryTabs.length])

  const openQueryTabFromTree = useCallback(
    (databaseName?: string) => {
      const nextNumber = queryTabs.length + 1
      const id = `query-${Date.now()}`
      const title = databaseName ? `${databaseName} Query ${nextNumber}` : `Query ${nextNumber}`
      const sql = 'SELECT 1;'
      setQueryTabs((prev) => [...prev, { id, title, sql, initialSql: sql }])
      setActiveQueryTabId(id)
    },
    [queryTabs.length],
  )

  const updateActiveQuery = useCallback(
    (value: string) => {
      if (!activeQueryTab) return
      setQueryTabs((prev) => prev.map((tab) => (tab.id === activeQueryTab.id ? { ...tab, sql: value } : tab)))
    },
    [activeQueryTab],
  )

  const closeQueryTab = useCallback((tabId: string) => {
    setQueryTabs((prev) => {
      const nextTabs = prev.filter((tab) => tab.id !== tabId)
      // Use nextTabs to determine remaining tabs for active tab resolution
      setActiveQueryTabId((prevActiveId) => {
        if (prevActiveId !== tabId) return prevActiveId
        return nextTabs.length > 0 ? nextTabs[nextTabs.length - 1].id : null
      })
      return nextTabs
    })
  }, [])

  const saveActiveQuery = useCallback(() => {
    if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) {
      appendMessage('Select a SQL connection to save query.')
      return
    }

    if (!activeQueryTab) {
      appendMessage('No active query tab to save.')
      return
    }

    const sql = activeQueryTab.sql.trim()
    if (!sql) {
      appendMessage('Cannot save empty query.')
      return
    }

    const now = new Date().toISOString()
    const saved: SavedQuery = {
      id: crypto.randomUUID(),
      title: activeQueryTab.title,
      sql,
      updatedAt: now,
    }

    // Reset dirty state after saving
    setQueryTabs((prev) =>
      prev.map((tab) => (tab.id === activeQueryTab.id ? { ...tab, initialSql: tab.sql } : tab)),
    )

    setSavedQueriesByConnection((prev) => ({
      ...prev,
      [selectedConnection.id]: [saved, ...(prev[selectedConnection.id] ?? [])].slice(0, 50),
    }))
    appendMessage(`Saved query: ${activeQueryTab.title}`)
  }, [selectedConnection, activeQueryTab, appendMessage])

  const applySavedQueryToActiveTab = useCallback(
    (sql: string) => {
      if (!activeQueryTab) return
      setQueryTabs((prev) => prev.map((tab) => (tab.id === activeQueryTab.id ? { ...tab, sql } : tab)))
      appendMessage('Loaded saved query into active tab.')
    },
    [activeQueryTab, appendMessage],
  )

  const handleRunQuery = useCallback(
    async (mode: 'run' | 'run-selected' | 'explain') => {
      if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) {
        appendMessage('Only PostgreSQL and MySQL support SQL execution in MVP.')
        return
      }

      if (!activeQueryTab) {
        appendMessage('No active query tab.')
        return
      }

      const sql = mode === 'explain' ? `EXPLAIN ${activeQueryTab.sql}` : activeQueryTab.sql
      if (!sql.trim()) {
        appendMessage('No SQL query to execute.')
        return
      }

      setIsRunningQuery(true)
      appendMessage(`${mode.toUpperCase()} started`)

      try {
        const basePayload = await getConnPayloadWithPassword(selectedConnection, querySchema)
        const payload = queryDatabase ? { ...basePayload, database: queryDatabase } : basePayload
        const result = await executeSql({
          connection: payload,
          sql,
        })

        setQueryResult({
          columns: result.columns,
          rows: result.rows,
          rowsAffected: result.rowsAffected,
          elapsedMs: result.elapsedMs,
        })
        appendMessage(`Completed in ${result.elapsedMs} ms`)
        setConnectionStatuses((prev) => ({ ...prev, [selectedConnection.id]: 'connected' }))
        setQueryHistoryByConnection((prev) => ({
          ...prev,
          [selectedConnection.id]: [sql, ...(prev[selectedConnection.id] ?? [])].slice(0, 12),
        }))
      } catch (error) {
        appendMessage(error instanceof Error ? error.message : 'Failed to execute SQL query.')
        setConnectionStatuses((prev) => ({ ...prev, [selectedConnection.id]: 'error' }))
      } finally {
        setIsRunningQuery(false)
      }
    },
    [selectedConnection, activeQueryTab, queryDatabase, querySchema, appendMessage, setConnectionStatuses],
  )

  const resetQueryData = useCallback(() => {
    setQueryTabs([])
    setActiveQueryTabId(null)
    setQueryResult(null)
    setQueryMessages(['Ready.'])
    setQueryDatabase('')
    setQuerySchema('')
    setQueryHistoryByConnection({})
  }, [])

  return {
    queryTabs: queryTabs.map((tab) => ({ id: tab.id, title: tab.title, sql: tab.sql })) as QueryTab[],
    queryTabsDirty,
    activeQueryTabId,
    activeQueryTab: activeQueryTab ? { id: activeQueryTab.id, title: activeQueryTab.title, sql: activeQueryTab.sql } as QueryTab : null,
    queryDatabase,
    querySchema,
    onQueryDatabaseChange: setQueryDatabase,
    onQuerySchemaChange: setQuerySchema,
    isRunningQuery,
    queryResult,
    queryMessages,
    queryHistoryByConnection,
    savedQueriesByConnection,
    addQueryTab,
    closeQueryTab,
    openQueryTabFromTree,
    updateActiveQuery,
    saveActiveQuery,
    applySavedQueryToActiveTab,
    setActiveQueryTabId,
    handleRunQuery,
    resetQueryData,
  }
}