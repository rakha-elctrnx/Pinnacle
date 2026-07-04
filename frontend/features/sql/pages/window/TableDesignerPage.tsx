import { useEffect, useState, useCallback } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ConnectionPayload } from '../../../_shared/services/tauriClient'
import { useDesignerStore } from '../../store/designerStore'
import type { DesignerTab } from '../../store/designerStore'
import { CustomTitlebar } from '../../../_shared/components/layout/CustomTitlebar'
import {
  Layers,
  Diff,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  Columns3,
  KeyRound,
  Shield,
  Link2,
  ListOrdered,
} from 'lucide-react'
import { ColumnEditor } from '../../components/table-designer/ColumnEditor'
import { PrimaryKeyEditor } from '../../components/table-designer/PrimaryKeyEditor'
import { UniqueConstraintEditor } from '../../components/table-designer/UniqueConstraintEditor'
import { ForeignKeyEditor } from '../../components/table-designer/ForeignKeyEditor'
import { IndexEditor } from '../../components/table-designer/IndexEditor'
import { SchemaDiffPanel } from '../../components/table-designer/SchemaDiffPanel'
import { SqlPreviewPanel } from '../../components/table-designer/SqlPreviewPanel'
import { ExecutionResultPanel } from '../../components/table-designer/ExecutionResultPanel'

interface TableDesignerOpenPayload {
  mode: 'create' | 'edit'
  schema: string
  database: string
  connectionPayload: ConnectionPayload
  tableName?: string
  theme: 'light' | 'dark'
}

const TABS: { id: DesignerTab; label: string; icon: typeof Layers }[] = [
  { id: 'structure', label: 'Structure', icon: Layers },
  { id: 'diff', label: 'Schema Diff', icon: Diff },
  { id: 'sql', label: 'SQL Preview', icon: FileCode2 },
  { id: 'result', label: 'Result', icon: CheckCircle2 },
]

export function TableDesignerPage() {
  const [isReady, setIsReady] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // ── Theme sync ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true
    const unlistenPromise = listen<{ theme: 'light' | 'dark' }>('theme-changed', (event) => {
      if (!mounted) return
      document.documentElement.setAttribute('data-theme', event.payload.theme)
    })
    return () => {
      mounted = false
      unlistenPromise.then((fn) => fn())
    }
  }, [])

  // ── Listen for open event & signal readiness ──────────────────────────────────
  useEffect(() => {
    let mounted = true
    let unlistenOpen: (() => void) | null = null
    let unlistenFocus: (() => void) | null = null

    const setup = async () => {
      const win = getCurrentWindow()
      
      // Listen for open event from main window
      const unlistenOpenFn = await listen<TableDesignerOpenPayload>('table-designer-open', (event) => {
        if (!mounted) return
        const { mode, schema, database, connectionPayload, tableName, theme } = event.payload

        // Apply theme from main window
        document.documentElement.setAttribute('data-theme', theme)

        const store = useDesignerStore.getState()
        if (mode === 'create') {
          store.openForCreate(schema, database, connectionPayload)
        } else if (mode === 'edit' && tableName) {
          store.loadAndOpenForEdit(connectionPayload, tableName, database, schema)
        }

        setIsReady(true)
      })

      // Emit ready signal when window gains focus (handles reopen after hide)
      const unlistenFocusFn = await win.onFocusChanged((event) => {
        if (event.payload && mounted) {
          emitTo('main', 'table-designer-ready', {})
        }
      })

      // Also emit ready immediately on mount for first open
      await emitTo('main', 'table-designer-ready', {})

      unlistenOpen = unlistenOpenFn
      unlistenFocus = unlistenFocusFn
    }

    setup()
    return () => {
      mounted = false
      unlistenOpen?.()
      unlistenFocus?.()
    }
  }, [])

  // ── Intercept native close ─────────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow()
    const unlistenPromise = win.onCloseRequested(async (event) => {
      event.preventDefault()
      const { isDirty, executionResult } = useDesignerStore.getState()
      if (isDirty && !executionResult?.success) {
        setShowCloseConfirm(true)
      } else {
        await emitTo('main', 'table-designer-close', {})
        try { await win.hide() } catch { /* ok */ }
      }
    })
    return () => { unlistenPromise.then((u) => u()) }
  }, [])

  const handleClose = useCallback(async () => {
    const { isDirty, executionResult } = useDesignerStore.getState()
    if (isDirty && !executionResult?.success) {
      setShowCloseConfirm(true)
    } else {
      await emitTo('main', 'table-designer-close', {})
      try { await getCurrentWindow().hide() } catch { /* ok */ }
      setIsReady(false)
    }
  }, [])

  const handleDiscard = useCallback(async () => {
    setShowCloseConfirm(false)
    await emitTo('main', 'table-designer-close', {})
    try { await getCurrentWindow().hide() } catch { /* ok */ }
    setIsReady(false)
  }, [])

  const handleSave = useCallback(async () => {
    const store = useDesignerStore.getState()
    const validationErrors = store.validate()
    if (validationErrors.length > 0) return

    if (!store.ddlPlan) {
      await store.generateDdlPreview()
    }

    await store.executeDdl()
    store.setActiveTab('result')

    const result = useDesignerStore.getState().executionResult
    if (result?.success) {
      const tableName = useDesignerStore.getState().pendingModel?.tableName
      await emitTo('main', 'table-designer-saved', { tableName })
    }
  }, [])

  const handlePreview = useCallback(async () => {
    const store = useDesignerStore.getState()
    const validationErrors = store.validate()
    if (validationErrors.length > 0) return

    await store.generateDdlPreview()
    store.setActiveTab('diff')
  }, [])

  // ── Store selectors ────────────────────────────────────────
  const isOpen = useDesignerStore((s) => s.isOpen)
  const isCreating = useDesignerStore((s) => s.isCreating)
  const isLoadingSchema = useDesignerStore((s) => s.isLoadingSchema)
  const loadError = useDesignerStore((s) => s.loadError)
  const activeTab = useDesignerStore((s) => s.activeTab)
  const pendingModel = useDesignerStore((s) => s.pendingModel)
  const errors = useDesignerStore((s) => s.errors)
  const isDirty = useDesignerStore((s) => s.isDirty)
  const isGeneratingDdl = useDesignerStore((s) => s.isGeneratingDdl)
  const isExecuting = useDesignerStore((s) => s.isExecuting)
  const ddlPlan = useDesignerStore((s) => s.ddlPlan)
  const executionResult = useDesignerStore((s) => s.executionResult)
  const setActiveTab = useDesignerStore((s) => s.setActiveTab)
  const updateTableName = useDesignerStore((s) => s.updateTableName)
  const close = useDesignerStore((s) => s.close)

  if (!isReady) return null

  // Loading state
  if (isLoadingSchema) {
    return (
      <div className="h-screen w-screen flex flex-col bg-bg-base">
        <CustomTitlebar title="Table Designer" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="text-sm text-text-muted">Loading table schema...</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (loadError) {
    return (
      <div className="h-screen w-screen flex flex-col bg-bg-base">
        <CustomTitlebar title="Table Designer" />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Failed to load table schema</h3>
              <p className="mt-1 max-w-md text-sm text-text-muted">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="mt-2 rounded-lg bg-bg-muted px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-bg-hover"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isOpen || !pendingModel) return null

  const hasErrors = errors.length > 0
  const diff = useDesignerStore.getState().getDiff()

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg-base text-text-muted text-sm">
        Loading Table Designer...
      </div>
    )
  }
  return (
    <div className="h-screen w-screen flex flex-col bg-bg-base text-text-primary">
      <CustomTitlebar title={isCreating ? 'New Table' : `Edit: ${pendingModel.tableName}`} />


      {/* ── Tab Bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-border-default bg-bg-subtle/50 px-5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = id === activeTab
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:border-border-strong hover:text-text-secondary'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          )
        })}

        {activeTab === 'structure' && (
          <div className="ml-auto">
            <input
              type="text"
              value={pendingModel.tableName}
              onChange={(e) => updateTableName(e.target.value)}
              placeholder="table_name"
              className={`rounded-md border bg-bg-base px-2 py-1 text-xs font-medium outline-none transition focus:ring-2 ${
                errors.some((e) => e.code === 'TABLE_NAME_REQUIRED')
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                  : 'border-border-default focus:border-primary focus:ring-primary/20'
              }`}
            />
          </div>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'structure' && <StructurePanel />}
        {activeTab === 'diff' && <SchemaDiffPanel diff={diff} />}
        {activeTab === 'sql' && (
          <SqlPreviewPanel ddlPlan={ddlPlan} isGenerating={isGeneratingDdl} />
        )}
        {activeTab === 'result' && (
          <ExecutionResultPanel
            result={executionResult}
            isExecuting={isExecuting}
            onRetry={handleSave}
            onClose={close}
          />
        )}
      </div>

      {/* ── Validation Errors Banner ────────────────────────── */}
      {hasErrors && (
        <div className="border-t border-red-200 bg-red-50 px-5 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="shrink-0 text-red-500" />
            <p className="text-xs text-red-700">
              {errors.length} validation error{errors.length !== 1 ? 's' : ''} found. Fix them before previewing or saving.
            </p>
          </div>
        </div>
      )}

      {/* ── Footer Actions ──────────────────────────────────── */}
      <footer className="flex items-center justify-between border-t border-border-default bg-bg-subtle/50 px-5 py-3">
        <div>
          {isDirty && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Unsaved changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-border-default px-4 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={hasErrors || isGeneratingDdl || isExecuting}
            className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            {isGeneratingDdl ? 'Generating...' : 'Preview Changes'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={hasErrors || isExecuting || isGeneratingDdl}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-text-inverse transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {isExecuting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </footer>

      {/* ── Close Confirmation Dialog ─────────────────────────── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-60 grid place-items-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded-xl bg-bg-base p-5 shadow-xl ring-1 ring-black/5">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-text-primary">
                Discard Unsaved Changes?
              </h3>
            </div>
            <p className="text-xs text-text-secondary mb-4">
              You have unsaved changes. Closing will discard all modifications.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-hover"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Structure Panel ────────────────────────────────────────────────

type StructureSection = 'columns' | 'primary-key' | 'unique' | 'foreign-key' | 'indexes'

const STRUCTURE_SECTIONS: { id: StructureSection; label: string; icon: typeof Columns3 }[] = [
  { id: 'columns', label: 'Columns', icon: Columns3 },
  { id: 'primary-key', label: 'Primary Key', icon: KeyRound },
  { id: 'unique', label: 'Unique', icon: Shield },
  { id: 'foreign-key', label: 'Foreign Keys', icon: Link2 },
  { id: 'indexes', label: 'Indexes', icon: ListOrdered },
]

function StructurePanel() {
  const [activeSection, setActiveSection] = useState<StructureSection>('columns')

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <nav className="w-48 shrink-0 border-r border-border-default bg-bg-subtle/30 p-2">
        <ul className="space-y-0.5">
          {STRUCTURE_SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeSection
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setActiveSection(id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-auto p-5">
        {activeSection === 'columns' && <ColumnEditor />}
        {activeSection === 'primary-key' && <PrimaryKeyEditor />}
        {activeSection === 'unique' && <UniqueConstraintEditor />}
        {activeSection === 'foreign-key' && <ForeignKeyEditor />}
        {activeSection === 'indexes' && <IndexEditor />}
      </div>
    </div>
  )
}
