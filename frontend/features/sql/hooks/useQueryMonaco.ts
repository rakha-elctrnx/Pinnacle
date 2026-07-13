import { useEffect, useRef } from 'react'
import type { BeforeMount, OnMount } from '@monaco-editor/react'
import * as monacoEditor from 'monaco-editor'
import { registerSqlProviders } from '../components/query/SqlCompletionProvider'
import { validateSql } from '../components/query/SqlValidator'
import type { SchemaColumn } from '../types/sql'

interface UseQueryMonacoParams {
  querySql: string
  schemaColumnsByTable: Record<string, SchemaColumn[]>
  handleRunQuery: (mode: 'run' | 'run-selected' | 'explain') => Promise<void>
  registerEditor: (editor: monacoEditor.editor.IStandaloneCodeEditor) => void
}

export function useQueryMonaco({
  querySql,
  schemaColumnsByTable,
  handleRunQuery,
  registerEditor,
}: UseQueryMonacoParams) {
  const tablesRef = useRef(schemaColumnsByTable)
  useEffect(() => {
    tablesRef.current = schemaColumnsByTable
  }, [schemaColumnsByTable])

  const editorRef = useRef<monacoEditor.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monacoEditor | null>(null)

  const handleRunQueryRef = useRef(handleRunQuery)
  useEffect(() => {
    handleRunQueryRef.current = handleRunQuery
  }, [handleRunQuery])

  useEffect(() => {
    const editor = editorRef.current
    const mono = monacoRef.current
    if (!editor || !mono) return
    const model = editor.getModel()
    if (!model) return
    mono.editor.setModelMarkers(
      model,
      'sql-validator',
      validateSql(querySql, mono),
    )
  }, [querySql])

  const handleBeforeMount: BeforeMount = (monacoInstance) => {
    registerSqlProviders(monacoInstance, tablesRef)
  }

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor
    registerEditor(editor)
    monacoRef.current = monacoInstance as unknown as typeof monacoEditor
    const model = editor.getModel()
    if (model) {
      const mono = monacoInstance as unknown as typeof monacoEditor
      mono.editor.setModelMarkers(
        model,
        'sql-validator',
        validateSql(querySql, mono),
      )
    }
    editor.addAction({
      id: 'run-query',
      label: 'Run Query',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter,
      ],
      run: () => {
        void handleRunQueryRef.current('run')
      },
    })
    editor.addAction({
      id: 'run-selected-query',
      label: 'Run Selected Query',
      keybindings: [
        monacoInstance.KeyMod.CtrlCmd |
          monacoInstance.KeyMod.Shift |
          monacoInstance.KeyCode.Enter,
      ],
      run: () => {
        void handleRunQueryRef.current('run-selected')
      },
    })
  }

  return {
    editorRef,
    monacoRef,
    handleBeforeMount,
    handleMount,
  }
}
