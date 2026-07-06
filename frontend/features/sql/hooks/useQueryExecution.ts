import { useCallback, useRef, useState } from 'react'
import { executeSql } from '../clients/sql'
import type { ConnectionProfile } from '../../_shared/types/domain'
import type { QueryResult, ConnectionStatus } from '../../_shared/types/shared'
import { isSqlConnectionType, getConnPayloadWithPassword } from '../../_shared/utils'

interface UseQueryExecutionParams {
  selectedConnection: ConnectionProfile | null
  selectedSchema: string
  selectedDatabase: string
  setConnectionStatuses: React.Dispatch<React.SetStateAction<Record<string, ConnectionStatus>>>
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
  resetQueryData: () => void
}

const DEFAULT_SQL = 'SELECT 1;'

function defaultQueryState(): QueryState {
  return { sql: DEFAULT_SQL, result: null, messages: ['Ready.'] }
}

const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','AND','OR','NOT','IN','IS','NULL','INSERT','INTO',
  'VALUES','UPDATE','SET','DELETE','CREATE','DROP','ALTER','TABLE','INDEX',
  'VIEW','AS','ON','JOIN','LEFT','RIGHT','INNER','OUTER','FULL','CROSS',
  'NATURAL','USING','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','UNION',
  'ALL','DISTINCT','EXISTS','BETWEEN','LIKE','ILIKE','CASE','WHEN','THEN',
  'ELSE','END','ASC','DESC','NULLS','FIRST','LAST','TRUE','FALSE','COUNT',
  'SUM','AVG','MIN','MAX','COALESCE','CAST','PRIMARY','KEY','FOREIGN',
  'REFERENCES','CONSTRAINT','UNIQUE','CHECK','DEFAULT','SERIAL','BIGSERIAL',
  'TEXT','INTEGER','INT','BIGINT','SMALLINT','BOOLEAN','VARCHAR','CHAR',
  'DECIMAL','NUMERIC','FLOAT','DOUBLE','PRECISION','DATE','TIME','TIMESTAMP',
  'INTERVAL','WITH','RECURSIVE','EXPLAIN','ANALYZE','VERBOSE','RETURNING',
  'IF','CASCADE','RESTRICT','ADD','COLUMN','RENAME','TO','SCHEMA','DATABASE',
  'GRANT','REVOKE','BEGIN','COMMIT','ROLLBACK','TRANSACTION','TRUNCATE',
  'COPY','TEMPORARY','TEMP','UNLOGGED','MATERIALIZED','REFRESH',
  'CONCURRENTLY','TYPE','ENUM','TRIGGER','FUNCTION','PROCEDURE','RETURNS',
  'LANGUAGE','REPLACE','EXECUTE','CALL','DO','RAISE','NOTICE','EXCEPTION',
  'PERFORM','RECORD','VOID','SETOF','ROW','ROWS','FETCH','NEXT','PRIOR',
  'ABSOLUTE','RELATIVE','FORWARD','BACKWARD','SCROLL','NO','CURSOR','FOR',
  'DECLARE','OPEN','CLOSE','MOVE','FOUND','NEW','OLD','INSTEAD','RULE',
  'ALSO','EACH','BEFORE','AFTER','STATEMENT','DEFERRABLE','DEFERRED',
  'IMMEDIATE','INITIALLY','ONLY','PARTITION','RANGE','LIST','HASH',
  'INCLUDE','STORAGE','PLAIN','EXTERNAL','EXTENDED','MAIN','GENERATED',
  'ALWAYS','IDENTITY','OVERRIDING','SYSTEM','VALUE','SEQUENCE','OWNED',
  'NONE','LOGGED','INHERIT','INHERITS','OF','SOME','ANY','ARRAY','LATERAL',
  'ORDINALITY','TABLESAMPLE','BERNOULLI','SIMILAR','ESCAPE','WINDOW','OVER',
  'FILTER','WITHIN','GROUPING','SETS','CUBE','AGGREGATE','VARIADIC',
  'PARALLEL','SAFE','UNSAFE','RESTRICTED','COST','SUPPORT','LEAKPROOF',
  'STRICT','CALLED','INPUT','SECURITY','DEFINER','INVOKER','VOLATILE',
  'STABLE','IMMUTABLE',
])

function autoQuoteMixedCaseIdentifiers(sql: string): string {
  let result = ''
  let i = 0
  while (i < sql.length) {
    if (sql[i] === "'") {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue }
        if (sql[j] === "'") { j++; break }
        j++
      }
      result += sql.slice(i, j)
      i = j
      continue
    }
    if (sql[i] === '"') {
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === '"' && sql[j + 1] === '"') { j += 2; continue }
        if (sql[j] === '"') { j++; break }
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
}: UseQueryExecutionParams): UseQueryExecutionReturn {
  const counterRef = useRef(0)
  const [queryStates, setQueryStates] = useState<Record<string, QueryState>>({})
  const [activeQueryId, setActiveQueryIdRaw] = useState('')
  const [isRunningQuery, setIsRunningQuery] = useState(false)
  const [queryHistoryByConnection, setQueryHistoryByConnection] = useState<Record<string, string[]>>({})
  const [queryDatabase, setQueryDatabase] = useState(() => selectedDatabase || (selectedConnection?.database ?? ''))
  const [querySchema, setQuerySchema] = useState(() => selectedSchema)

  const getState = useCallback((id: string): QueryState => {
    return queryStates[id] ?? defaultQueryState()
  }, [queryStates])

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

  const appendMessage = useCallback((message: string) => {
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
  }, [activeQueryId])

  const updateActiveQuery = useCallback((value: string) => {
    updateState(activeQueryId, { sql: value })
  }, [activeQueryId, updateState])

  const handleRunQuery = useCallback(
    async (mode: 'run' | 'run-selected' | 'explain') => {
      if (!selectedConnection || !isSqlConnectionType(selectedConnection.type)) {
        appendMessage('Only PostgreSQL and MySQL support SQL execution in MVP.')
        return
      }

      const currentSql = activeState.sql
      const raw = mode === 'explain' ? `EXPLAIN ${currentSql}` : currentSql
      if (!raw.trim()) {
        appendMessage('No SQL query to execute.')
        return
      }

      const sql = selectedConnection.type === 'postgresql'
        ? autoQuoteMixedCaseIdentifiers(raw)
        : raw

      setIsRunningQuery(true)
      appendMessage(`${mode.toUpperCase()} started`)

      try {
        const basePayload = await getConnPayloadWithPassword(selectedConnection, querySchema)
        const payload = queryDatabase ? { ...basePayload, database: queryDatabase } : basePayload
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
    [selectedConnection, activeState.sql, activeQueryId, queryDatabase, querySchema, appendMessage, updateState, setConnectionStatuses],
  )

  const resetQueryData = useCallback(() => {
    setQueryStates({})
    setActiveQueryIdRaw('')
    counterRef.current = 0
    setQueryDatabase('')
    setQuerySchema('')
    setQueryHistoryByConnection({})
  }, [])

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
    resetQueryData,
  }
}
