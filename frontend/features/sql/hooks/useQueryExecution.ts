import { useCallback, useRef, useState } from 'react'
import {
  executeSql,
  sqlBeginTransaction,
  sqlCommitTransaction,
  sqlExecuteInTransaction,
  sqlRollbackTransaction,
} from '../clients/sql'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { QueryResult, ConnectionStatus } from '../../_shared/types/shared'
import {
  isSqlConnectionType,
  getConnPayloadWithPassword,
} from '../../_shared/utils'
import type * as monacoEditor from 'monaco-editor'

interface UseQueryExecutionParams {
  selectedConnection: ConnectionProfile | null
  selectedSchema: string
  selectedDatabase: string
  setConnectionStatuses: React.Dispatch<
    React.SetStateAction<Record<string, ConnectionStatus>>
  >
  onQueryTabChange?: (tab: 'results' | 'messages' | 'statistics') => void
}

interface QueryState {
  sql: string
  result: QueryResult | null
  messages: string[]
}

export interface UseQueryExecutionReturn {
  querySql: string
  isRunningQuery: boolean
  queryResult: QueryResult | null
  queryMessages: string[]
  queryHistoryByConnection: Record<string, string[]>
  queryDatabase: string
  querySchema: string
  activeQueryId: string
  onQueryDatabaseChange: (db: string) => void
  onQuerySchemaChange: (schema: string) => void
  updateActiveQuery: (value: string) => void
  setActiveQueryId: (id: string) => void
  createQueryId: () => string
  handleRunQuery: (mode: 'run' | 'run-selected' | 'explain') => Promise<void>
  registerEditor: (editor: monacoEditor.editor.IStandaloneCodeEditor) => void
  resetQueryData: () => void
  // Transaction mode
  transactionMode: boolean
  activeTransactionId: string | null
  transactionSteps: {
    statementIndex: number
    success: boolean
    error: string | null
    elapsedMs: number
    queryResult: QueryResult | null
    rowsAffected: number
  }[]
  toggleTransactionMode: () => Promise<void>
  handleCommitTransaction: () => Promise<void>
  handleRollbackTransaction: () => Promise<void>
}

const DEFAULT_SQL = 'SELECT 1;'

function defaultQueryState(): QueryState {
  return { sql: DEFAULT_SQL, result: null, messages: ['Ready.'] }
}

const SQL_KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS',
  'NULL',
  'INSERT',
  'INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE',
  'DROP',
  'ALTER',
  'TABLE',
  'INDEX',
  'VIEW',
  'AS',
  'ON',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'NATURAL',
  'USING',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'UNION',
  'ALL',
  'DISTINCT',
  'EXISTS',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'TRUE',
  'FALSE',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'COALESCE',
  'CAST',
  'PRIMARY',
  'KEY',
  'FOREIGN',
  'REFERENCES',
  'CONSTRAINT',
  'UNIQUE',
  'CHECK',
  'DEFAULT',
  'SERIAL',
  'BIGSERIAL',
  'TEXT',
  'INTEGER',
  'INT',
  'BIGINT',
  'SMALLINT',
  'BOOLEAN',
  'VARCHAR',
  'CHAR',
  'DECIMAL',
  'NUMERIC',
  'FLOAT',
  'DOUBLE',
  'PRECISION',
  'DATE',
  'TIME',
  'TIMESTAMP',
  'INTERVAL',
  'WITH',
  'RECURSIVE',
  'EXPLAIN',
  'ANALYZE',
  'VERBOSE',
  'RETURNING',
  'IF',
  'CASCADE',
  'RESTRICT',
  'ADD',
  'COLUMN',
  'RENAME',
  'TO',
  'SCHEMA',
  'DATABASE',
  'GRANT',
  'REVOKE',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'TRANSACTION',
  'TRUNCATE',
  'COPY',
  'TEMPORARY',
  'TEMP',
  'UNLOGGED',
  'MATERIALIZED',
  'REFRESH',
  'CONCURRENTLY',
  'TYPE',
  'ENUM',
  'TRIGGER',
  'FUNCTION',
  'PROCEDURE',
  'RETURNS',
  'LANGUAGE',
  'REPLACE',
  'EXECUTE',
  'CALL',
  'DO',
  'RAISE',
  'NOTICE',
  'EXCEPTION',
  'PERFORM',
  'RECORD',
  'VOID',
  'SETOF',
  'ROW',
  'ROWS',
  'FETCH',
  'NEXT',
  'PRIOR',
  'ABSOLUTE',
  'RELATIVE',
  'FORWARD',
  'BACKWARD',
  'SCROLL',
  'NO',
  'CURSOR',
  'FOR',
  'DECLARE',
  'OPEN',
  'CLOSE',
  'MOVE',
  'FOUND',
  'NEW',
  'OLD',
  'INSTEAD',
  'RULE',
  'ALSO',
  'EACH',
  'BEFORE',
  'AFTER',
  'STATEMENT',
  'DEFERRABLE',
  'DEFERRED',
  'IMMEDIATE',
  'INITIALLY',
  'ONLY',
  'PARTITION',
  'RANGE',
  'LIST',
  'HASH',
  'INCLUDE',
  'STORAGE',
  'PLAIN',
  'EXTERNAL',
  'EXTENDED',
  'MAIN',
  'GENERATED',
  'ALWAYS',
  'IDENTITY',
  'OVERRIDING',
  'SYSTEM',
  'VALUE',
  'SEQUENCE',
  'OWNED',
  'NONE',
  'LOGGED',
  'INHERIT',
  'INHERITS',
  'OF',
  'SOME',
  'ANY',
  'ARRAY',
  'LATERAL',
  'ORDINALITY',
  'TABLESAMPLE',
  'BERNOULLI',
  'SIMILAR',
  'ESCAPE',
  'WINDOW',
  'OVER',
  'FILTER',
  'WITHIN',
  'GROUPING',
  'SETS',
  'CUBE',
  'AGGREGATE',
  'VARIADIC',
  'PARALLEL',
  'SAFE',
  'UNSAFE',
  'RESTRICTED',
  'COST',
  'SUPPORT',
  'LEAKPROOF',
  'STRICT',
  'CALLED',
  'INPUT',
  'SECURITY',
  'DEFINER',
  'INVOKER',
  'VOLATILE',
  'STABLE',
  'IMMUTABLE',
])

function autoQuoteMixedCaseIdentifiers(sql: string): string {
  let result = ''
  let i = 0
  while (i < sql.length) {
    if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2
          continue
        }
        if (sql[j] === "'") {
          j++
          break
        }
        j++
      }
      result += sql.slice(i, j)
      i = j
      continue
    }
    if (sql[i] === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') {
          j += 2
          continue
        }
        if (sql[j] === '"') {
          j++
          break
        }
        j++
      }
      result += sql.slice(i, j)
      i = j
      continue
    }
    if (sql[i] === '-' && sql[i + 1] === '-') {
      let j = i
      while (j < sql.length && sql[j] !== '\n') j++
      result += sql.slice(i, j)
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(sql[i])) {
      let j = i
      while (j < sql.length && /[a-zA-Z0-9_]/.test(sql[j])) j++
      const word = sql.slice(i, j)
      const hasMixedCase = /[a-z]/.test(word) && /[A-Z]/.test(word)
      if (hasMixedCase && !SQL_KEYWORDS.has(word.toUpperCase())) {
        result += `"${word}"`
      } else {
        result += word
      }
      i = j
      continue
    }
    result += sql[i]
    i++
  }
  return result
}

export function useQueryExecution({
  selectedConnection,
  selectedSchema,
  selectedDatabase,
  setConnectionStatuses,
  onQueryTabChange,
}: UseQueryExecutionParams): UseQueryExecutionReturn {
  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(
    null,
  )
  const counterRef = useRef(0)
  const [queryStates, setQueryStates] = useState<Record<string, QueryState>>({})
  const [activeQueryId, setActiveQueryIdRaw] = useState('')
  const [isRunningQuery, setIsRunningQuery] = useState(false)
  const [queryHistoryByConnection, setQueryHistoryByConnection] = useState<
    Record<string, string[]>
  >({})
  const [queryDatabase, setQueryDatabase] = useState(
    () => selectedDatabase || (selectedConnection?.database ?? ''),
  )
  const [querySchema, setQuerySchema] = useState(() => selectedSchema)
  // Transaction mode state
  const [transactionMode, setTransactionMode] = useState(false)
  const [activeTransactionId, setActiveTransactionId] = useState<string | null>(
    null,
  )
  const [transactionSteps, setTransactionSteps] = useState<
    {
      statementIndex: number
      success: boolean
      error: string | null
      elapsedMs: number
      queryResult: QueryResult | null
      rowsAffected: number
    }[]
  >([])

  const getState = useCallback(
    (id: string): QueryState => {
      return queryStates[id] ?? defaultQueryState()
    },
    [queryStates],
  )

  const updateState = useCallback((id: string, patch: Partial<QueryState>) => {
    setQueryStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? defaultQueryState()), ...patch },
    }))
  }, [])

  const activeState = getState(activeQueryId)

  const createQueryId = useCallback(() => {
    counterRef.current += 1
    const id = String(counterRef.current)
    setQueryStates((prev) => ({ ...prev, [id]: defaultQueryState() }))
    return id
  }, [])

  const setActiveQueryId = useCallback((id: string) => {
    setActiveQueryIdRaw(id)
    setQueryStates((prev) => {
      if (prev[id]) return prev
      return { ...prev, [id]: defaultQueryState() }
    })
  }, [])

  const appendMessage = useCallback(
    (message: string) => {
      const ts = new Date().toLocaleTimeString()
      setQueryStates((prev) => {
        const cur = prev[activeQueryId] ?? defaultQueryState()
        return {
          ...prev,
          [activeQueryId]: {
            ...cur,
            messages: [`${ts}  ${message}`, ...cur.messages].slice(0, 20),
          },
        }
      })
    },
    [activeQueryId],
  )

  const updateActiveQuery = useCallback(
    (value: string) => {
      updateState(activeQueryId, { sql: value })
    },
    [activeQueryId, updateState],
  )

  const handleRunQuery = useCallback(
    async (mode: 'run' | 'run-selected' | 'explain') => {
      if (
        !selectedConnection ||
        !isSqlConnectionType(selectedConnection.type)
      ) {
        appendMessage('Only PostgreSQL and MySQL support SQL execution in MVP.')
        return
      }

      let currentSql = activeState.sql
      if (mode === 'run-selected' && editorRef.current) {
        const selection = editorRef.current.getSelection()
        if (selection && !selection.isEmpty()) {
          const model = editorRef.current.getModel()
          if (model) {
            currentSql = model.getValueInRange(selection)
          }
        }
      }
      const raw = mode === 'explain' ? `EXPLAIN ${currentSql}` : currentSql
      if (!raw.trim()) {
        appendMessage('No SQL query to execute.')
        return
      }

      if (transactionMode && !activeTransactionId) {
        appendMessage(
          'No active transaction. Toggle transaction mode off/on to start a new one.',
        )
        return
      }

      const sql =
        selectedConnection.type === 'postgresql'
          ? autoQuoteMixedCaseIdentifiers(raw)
          : raw

      setIsRunningQuery(true)
      appendMessage(`${mode.toUpperCase()} started`)

      try {
        const basePayload = await getConnPayloadWithPassword(
          selectedConnection,
          querySchema,
        )
        const payload = queryDatabase
          ? { ...basePayload, database: queryDatabase }
          : basePayload

        if (transactionMode && activeTransactionId) {
          // Execute inside transaction
          const step = await sqlExecuteInTransaction(
            payload,
            activeTransactionId,
            sql,
          )
          setTransactionSteps((prev) => [...prev, step])
          if (step.success && step.queryResult) {
            updateState(activeQueryId, {
              result: {
                columns: step.queryResult.columns,
                rows: step.queryResult.rows,
                rowsAffected: step.rowsAffected,
                elapsedMs: step.elapsedMs,
              },
            })
          } else if (!step.success) {
            appendMessage(
              `[step ${step.statementIndex}] Error: ${step.error ?? 'Unknown'}`,
            )
            onQueryTabChange?.('messages')
            // Transaction was rolled back by backend
            setActiveTransactionId(null)
            setTransactionSteps([])
          }
          if (step.success) {
            appendMessage(
              `[step ${step.statementIndex}] Completed in ${step.elapsedMs} ms`,
            )
          }
        } else {
          // Non-transactional execution (original path)
          const result = await executeSql({
            connection: payload,
            sql,
          })

          updateState(activeQueryId, {
            result: {
              columns: result.columns,
              rows: result.rows,
              rowsAffected: result.rowsAffected,
              elapsedMs: result.elapsedMs,
            },
          })
          appendMessage(`Completed in ${result.elapsedMs} ms`)
        }

        setConnectionStatuses((prev) => ({
          ...prev,
          [selectedConnection.id]: 'connected',
        }))
        setQueryHistoryByConnection((prev) => ({
          ...prev,
          [selectedConnection.id]: [
            sql,
            ...(prev[selectedConnection.id] ?? []),
          ].slice(0, 12),
        }))
      } catch (error) {
        appendMessage(error instanceof Error ? error.message : String(error))
        onQueryTabChange?.('messages')
        setConnectionStatuses((prev) => ({
          ...prev,
          [selectedConnection.id]: 'error',
        }))
        // If we were in transaction mode, the backend rolled back — clear state
        if (transactionMode && activeTransactionId) {
          setActiveTransactionId(null)
          setTransactionSteps([])
        }
      } finally {
        setIsRunningQuery(false)
      }
    },
    [
      selectedConnection,
      activeState.sql,
      activeQueryId,
      queryDatabase,
      querySchema,
      appendMessage,
      updateState,
      setConnectionStatuses,
      transactionMode,
      activeTransactionId,
      onQueryTabChange,
      editorRef,
    ],
  )

  const resetQueryData = useCallback(() => {
    setQueryStates({})
    setActiveQueryIdRaw('')
    counterRef.current = 0
    setQueryDatabase('')
    setQuerySchema('')
    setQueryHistoryByConnection({})
  }, [])

  const toggleTransactionMode = useCallback(async () => {
    if (transactionMode) {
      setTransactionMode(false)
      setActiveTransactionId(null)
      setTransactionSteps([])
    } else if (selectedConnection) {
      // Starting transaction mode — begin a new transaction
      try {
        const basePayload = await getConnPayloadWithPassword(
          selectedConnection,
          querySchema,
        )
        const payload = queryDatabase
          ? { ...basePayload, database: queryDatabase }
          : basePayload
        const handle = await sqlBeginTransaction(payload)
        setActiveTransactionId(handle.transactionId)
        setTransactionMode(true)
        setTransactionSteps([])
        appendMessage('Transaction started.')
      } catch (err) {
        appendMessage(err instanceof Error ? err.message : String(err))
      }
    }
  }, [
    transactionMode,
    selectedConnection,
    querySchema,
    queryDatabase,
    appendMessage,
  ])

  const handleCommitTransaction = useCallback(async () => {
    if (!activeTransactionId) return
    try {
      const basePayload = await getConnPayloadWithPassword(
        selectedConnection!,
        querySchema,
      )
      const payload = queryDatabase
        ? { ...basePayload, database: queryDatabase }
        : basePayload
      const result = await sqlCommitTransaction(payload, activeTransactionId)
      appendMessage(
        result.committed
          ? `Transaction committed in ${result.elapsedMs} ms`
          : 'Commit failed.',
      )
      setActiveTransactionId(null)
      setTransactionSteps([])
      setTransactionMode(false)
    } catch (err) {
      appendMessage(err instanceof Error ? err.message : String(err))
    }
  }, [
    activeTransactionId,
    selectedConnection,
    querySchema,
    queryDatabase,
    appendMessage,
  ])

  const handleRollbackTransaction = useCallback(async () => {
    if (!activeTransactionId) return
    try {
      const basePayload = await getConnPayloadWithPassword(
        selectedConnection!,
        querySchema,
      )
      const payload = queryDatabase
        ? { ...basePayload, database: queryDatabase }
        : basePayload
      const result = await sqlRollbackTransaction(payload, activeTransactionId)
      appendMessage(`Transaction rolled back in ${result.elapsedMs} ms`)
      setActiveTransactionId(null)
      setTransactionSteps([])
      setTransactionMode(false)
    } catch (err) {
      appendMessage(err instanceof Error ? err.message : String(err))
    }
  }, [
    activeTransactionId,
    selectedConnection,
    querySchema,
    queryDatabase,
    appendMessage,
  ])

  const registerEditor = useCallback(
    (editor: monacoEditor.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor
    },
    [],
  )

  return {
    querySql: activeState.sql,
    queryDatabase,
    querySchema,
    activeQueryId,
    onQueryDatabaseChange: setQueryDatabase,
    onQuerySchemaChange: setQuerySchema,
    isRunningQuery,
    queryResult: activeState.result,
    queryMessages: activeState.messages,
    queryHistoryByConnection,
    updateActiveQuery,
    setActiveQueryId,
    createQueryId,
    handleRunQuery,
    registerEditor,
    resetQueryData,
    // Transaction mode
    transactionMode,
    activeTransactionId,
    transactionSteps,
    toggleTransactionMode,
    handleCommitTransaction,
    handleRollbackTransaction,
  }
}
