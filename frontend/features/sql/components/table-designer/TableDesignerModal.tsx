import { useState, useCallback } from 'react'
import {
  Database,
  X,
  Layers,
  Diff,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { useDesignerStore } from '../../store/designerStore'
import type { DesignerTab } from '../../store/designerStore'
import { ColumnEditor } from './ColumnEditor'
import { PrimaryKeyEditor } from './PrimaryKeyEditor'
import { UniqueConstraintEditor } from './UniqueConstraintEditor'
import { ForeignKeyEditor } from './ForeignKeyEditor'
import { IndexEditor } from './IndexEditor'
import { SchemaDiffPanel } from './SchemaDiffPanel'
import { SqlPreviewPanel } from './SqlPreviewPanel'
import { ExecutionResultPanel } from './ExecutionResultPanel'

const TABS: { id: DesignerTab; label: string; icon: typeof Layers }[] = [
  { id: 'structure', label: 'Structure', icon: Layers },
  { id: 'diff', label: 'Schema Diff', icon: Diff },
  { id: 'sql', label: 'SQL Preview', icon: FileCode2 },
  { id: 'result', label: 'Result', icon: CheckCircle2 },
]

/**
 * TableDesignerModal — top-level shell for the SQL table designer.
 * Renders as a full-screen modal with tabs for Structure / Diff / SQL / Result.
 *
 * Footer actions: Cancel, Preview, Save.
 * Supports both create and edit modes, with dirty-state warning on close.
 */
export function TableDesignerModal() {
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
  const validate = useDesignerStore((s) => s.validate)
  const getDiff = useDesignerStore((s) => s.getDiff)
  const generateDdlPreview = useDesignerStore((s) => s.generateDdlPreview)
  const executeDdl = useDesignerStore((s) => s.executeDdl)
  const close = useDesignerStore((s) => s.close)

  const [showCloseConfirm, setShowCloseConfirm] = useState(false)

  // Attempt close — ask for confirmation when dirty
  const handleClose = useCallback(() => {
    if (isDirty && !executionResult?.success) {
      setShowCloseConfirm(true)
    } else {
      close()
    }
  }, [isDirty, executionResult, close])

  // Preview: validate → generate DDL → switch to diff tab
  const handlePreview = useCallback(async () => {
    const validationErrors = validate()
    if (validationErrors.length > 0) return

    await generateDdlPreview()
    setActiveTab('diff')
  }, [validate, generateDdlPreview, setActiveTab])

  // Save: validate → preview → execute
  const handleSave = useCallback(async () => {
    const validationErrors = validate()
    if (validationErrors.length > 0) return

    if (!ddlPlan) {
      await generateDdlPreview()
    }

    await executeDdl()
    setActiveTab('result')
  }, [validate, ddlPlan, generateDdlPreview, executeDdl, setActiveTab])

  if (!isOpen) return null

  // Show loading state while fetching schema from backend
  if (isLoadingSchema) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-sm">
        <section className="mx-auto flex h-[92vh] w-full max-w-6xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 mt-[4vh]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
            <p className="text-sm text-slate-500">Loading table schema...</p>
          </div>
        </section>
      </div>
    )
  }

  // Show error state if schema fetch failed
  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-sm">
        <section className="mx-auto flex h-[92vh] w-full max-w-6xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 mt-[4vh]">
          <div className="flex flex-col items-center gap-4 px-8 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-500">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Failed to load table schema</h3>
              <p className="mt-1 max-w-md text-sm text-slate-500">{loadError}</p>
            </div>
            <button
              type="button"
              onClick={close}
              className="mt-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (!pendingModel) return null

  const hasErrors = errors.length > 0
  const diff = getDiff()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 backdrop-blur-sm">
      <section className="mx-auto flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 mt-[4vh]">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isCreating ? 'Create New Table' : `Edit Table: ${pendingModel.tableName}`}
              </h2>
              <p className="text-xs text-slate-400">
                {isCreating ? 'Define a new table structure' : 'Modify existing table structure'}
                {isDirty && ' • Unsaved changes'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </header>

        {/* ── Tab Bar ─────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeTab
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            )
          })}

          {/* Table name input (on structure tab) */}
          {activeTab === 'structure' && (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">
                Table Name
              </label>
              <input
                type="text"
                value={pendingModel.tableName}
                onChange={(e) => updateTableName(e.target.value)}
                placeholder="my_table"
                className={`rounded-lg border bg-white px-3 py-1.5 text-sm font-medium outline-none transition focus:ring-2 ${
                  errors.some((e) => e.code === 'TABLE_NAME_REQUIRED')
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                    : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
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
        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
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
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreview}
              disabled={hasErrors || isGeneratingDdl || isExecuting}
              className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              {isGeneratingDdl ? 'Generating...' : 'Preview Changes'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={hasErrors || isExecuting || isGeneratingDdl}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isExecuting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </footer>
      </section>

      {/* ── Close Confirmation Dialog ─────────────────────────── */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-60 grid place-items-center bg-slate-900/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-black/5">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle size={18} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">
                Discard Unsaved Changes?
              </h3>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              You have unsaved changes. Closing will discard all modifications.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false)
                  close()
                }}
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

function StructurePanel() {
  return (
    <div className="space-y-6 p-5">
      <ColumnEditor />
      <div className="border-t border-slate-200 pt-4">
        <PrimaryKeyEditor />
      </div>
      <div className="border-t border-slate-200 pt-4">
        <UniqueConstraintEditor />
      </div>
      <div className="border-t border-slate-200 pt-4">
        <ForeignKeyEditor />
      </div>
      <div className="border-t border-slate-200 pt-4">
        <IndexEditor />
      </div>
    </div>
  )
}
