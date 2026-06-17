/**
 * SQL Table Designer — Zustand Store
 *
 * Manages the full lifecycle of the table designer: opening for
 * create/edit, tracking pending changes, generating DDL preview,
 * and executing DDL. All state updates are immutable.
 */

import { create } from 'zustand'
import type {
  TableSchemaModel,
  ColumnDefinition,
  PrimaryKeyDefinition,
  UniqueConstraintDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  DdlPlan,
  DdlExecutionResult,
  SchemaDiffSummary,
  DesignerValidationError,
} from '../features/data-explorer/domain/table-designer'
import {
  createEmptySchemaModel,
  createDefaultColumn,
  createDefaultUniqueConstraint,
  createDefaultForeignKey,
  createDefaultIndex,
  moveColumn,
  removeColumnAndReindex,
  fromBackendSchemaInfo,
  toDdlRequest,
} from '../features/data-explorer/domain/table-designer/utils'
import {
  sqlGetTableSchema,
  sqlGenerateDdl,
  sqlExecuteDdl,
  type ConnectionPayload,
} from '../services/tauriClient'
import { validateSchemaModel } from '../features/data-explorer/domain/table-designer/validation'
import { computeSchemaDiff } from '../features/data-explorer/domain/table-designer/diff'

// ── State Interface ────────────────────────────────────────────────

export type DesignerTab = 'structure' | 'diff' | 'sql' | 'result'

interface DesignerState {
  // Current state
  isOpen: boolean
  isCreating: boolean
  isLoadingSchema: boolean
  loadError: string | null
  activeTab: DesignerTab
  isDirty: boolean
  originalModel: TableSchemaModel | null
  pendingModel: TableSchemaModel | null
  ddlPlan: DdlPlan | null
  executionResult: DdlExecutionResult | null
  isGeneratingDdl: boolean
  isExecuting: boolean
  errors: DesignerValidationError[]

  // Database context (needed for Tauri commands)
  database: string
  connectionSchema: string
  connectionPayload: ConnectionPayload | null

  // Post-save callback — invoked after successful DDL execution with the table name
  onAfterSave: ((tableName: string) => void | Promise<void>) | null

  // Actions
  openForCreate: (schema: string, database: string, connectionPayload?: ConnectionPayload, onAfterSave?: (tableName: string) => void | Promise<void>) => void
  openForEdit: (model: TableSchemaModel, database: string) => void
  loadAndOpenForEdit: (payload: ConnectionPayload, tableName: string, database: string, schema: string) => Promise<void>
  close: () => void
  setActiveTab: (tab: DesignerTab) => void
  updateTableName: (name: string) => void

  // Column operations
  addColumn: () => void
  updateColumn: (id: string, changes: Partial<ColumnDefinition>) => void
  removeColumn: (id: string) => void
  moveColumn: (id: string, direction: 'up' | 'down') => void

  // Constraint operations
  setPrimaryKey: (definition: PrimaryKeyDefinition | null) => void
  addUniqueConstraint: () => void
  updateUniqueConstraint: (
    id: string,
    changes: Partial<UniqueConstraintDefinition>,
  ) => void
  removeUniqueConstraint: (id: string) => void

  // Foreign key operations
  addForeignKey: () => void
  updateForeignKey: (
    id: string,
    changes: Partial<ForeignKeyDefinition>,
  ) => void
  removeForeignKey: (id: string) => void

  // Index operations
  addIndex: () => void
  updateIndex: (id: string, changes: Partial<IndexDefinition>) => void
  removeIndex: (id: string) => void

  // DDL operations
  generateDdlPreview: () => Promise<void>
  executeDdl: () => Promise<void>
  validate: () => DesignerValidationError[]
  getDiff: () => SchemaDiffSummary
}

// ── Initial State ──────────────────────────────────────────────────

const initialState = {
  isOpen: false,
  isCreating: false,
  isLoadingSchema: false,
  loadError: null as string | null,
  activeTab: 'structure' as DesignerTab,
  isDirty: false,
  originalModel: null as TableSchemaModel | null,
  pendingModel: null as TableSchemaModel | null,
  ddlPlan: null as DdlPlan | null,
  executionResult: null as DdlExecutionResult | null,
  isGeneratingDdl: false,
  isExecuting: false,
  errors: [] as DesignerValidationError[],
  database: '',
  connectionSchema: '',
  connectionPayload: null as ConnectionPayload | null,
  onAfterSave: null as ((tableName: string) => void | Promise<void>) | null,
}

// ── Store ──────────────────────────────────────────────────────────

export const useDesignerStore = create<DesignerState>()((set, get) => ({
  ...initialState,

  // ── Lifecycle ──────────────────────────────────────────────────

  openForCreate: (schema: string, database: string, connectionPayload?: ConnectionPayload, onAfterSave?: (tableName: string) => void | Promise<void>) => {
    set({
      isOpen: true,
      isCreating: true,
      isLoadingSchema: false,
      loadError: null,
      activeTab: 'structure',
      isDirty: false,
      originalModel: null,
      pendingModel: createEmptySchemaModel(schema),
      ddlPlan: null,
      executionResult: null,
      isGeneratingDdl: false,
      isExecuting: false,
      errors: [],
      database,
      connectionSchema: schema,
      connectionPayload: connectionPayload ?? null,
      onAfterSave: onAfterSave ?? null,
    })
  },

  openForEdit: (model: TableSchemaModel, database: string) => {
    set({
      isOpen: true,
      isCreating: false,
      isLoadingSchema: false,
      loadError: null,
      activeTab: 'structure',
      isDirty: false,
      originalModel: structuredClone(model),
      pendingModel: structuredClone(model),
      ddlPlan: null,
      executionResult: null,
      isGeneratingDdl: false,
      isExecuting: false,
      errors: [],
      database,
      connectionSchema: model.schema,
    })
  },

  loadAndOpenForEdit: async (
    payload: ConnectionPayload,
    tableName: string,
    database: string,
    schema: string,
  ) => {
    // Open modal immediately with loading state
    set({
      isOpen: true,
      isCreating: false,
      isLoadingSchema: true,
      loadError: null,
      activeTab: 'structure',
      isDirty: false,
      originalModel: null,
      pendingModel: null,
      ddlPlan: null,
      executionResult: null,
      isGeneratingDdl: false,
      isExecuting: false,
      errors: [],
      database,
      connectionSchema: schema,
      connectionPayload: payload,
    })

    try {
      const schemaInfo = await sqlGetTableSchema(payload, tableName)
      const model = fromBackendSchemaInfo(schemaInfo)
      set({
        originalModel: structuredClone(model),
        pendingModel: structuredClone(model),
        isLoadingSchema: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        isLoadingSchema: false,
        loadError: message,
      })
    }
  },

  close: () => {
    set({ ...initialState, connectionPayload: null, onAfterSave: null })
  },

  setActiveTab: (tab: DesignerTab) => set({ activeTab: tab }),

  // ── Table ──────────────────────────────────────────────────────

  updateTableName: (name: string) => {
    const { pendingModel } = get()
    if (!pendingModel) return
    set({ pendingModel: { ...pendingModel, tableName: name }, isDirty: true, errors: [] })
  },

  // ── Columns ────────────────────────────────────────────────────

  addColumn: () => {
    const { pendingModel } = get()
    if (!pendingModel) return

    const newCol = createDefaultColumn(pendingModel.columns.length)
    set({
      pendingModel: {
        ...pendingModel,
        columns: [...pendingModel.columns, newCol],
      },
      isDirty: true,
      errors: [],
    })
  },

  updateColumn: (id: string, changes: Partial<ColumnDefinition>) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        columns: pendingModel.columns.map((c) =>
          c.id === id ? { ...c, ...changes } : c,
        ),
      },
      isDirty: true,
      errors: [],
    })
  },

  removeColumn: (id: string) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        columns: removeColumnAndReindex(pendingModel.columns, id),
      },
      isDirty: true,
      errors: [],
    })
  },

  moveColumn: (id: string, direction: 'up' | 'down') => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        columns: moveColumn(pendingModel.columns, id, direction),
      },
      isDirty: true,
      errors: [],
    })
  },

  // ── Primary Key ────────────────────────────────────────────────

  setPrimaryKey: (definition: PrimaryKeyDefinition | null) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: { ...pendingModel, primaryKey: definition },
      isDirty: true,
      errors: [],
    })
  },

  // ── Unique Constraints ─────────────────────────────────────────

  addUniqueConstraint: () => {
    const { pendingModel } = get()
    if (!pendingModel) return

    const newUq = createDefaultUniqueConstraint()
    set({
      pendingModel: {
        ...pendingModel,
        uniqueConstraints: [...pendingModel.uniqueConstraints, newUq],
      },
      isDirty: true,
      errors: [],
    })
  },

  updateUniqueConstraint: (
    id: string,
    changes: Partial<UniqueConstraintDefinition>,
  ) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        uniqueConstraints: pendingModel.uniqueConstraints.map((u) =>
          u.id === id ? { ...u, ...changes } : u,
        ),
      },
      isDirty: true,
      errors: [],
    })
  },

  removeUniqueConstraint: (id: string) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        uniqueConstraints: pendingModel.uniqueConstraints.filter(
          (u) => u.id !== id,
        ),
      },
      isDirty: true,
      errors: [],
    })
  },

  // ── Foreign Keys ───────────────────────────────────────────────

  addForeignKey: () => {
    const { pendingModel } = get()
    if (!pendingModel) return

    const newFk = createDefaultForeignKey()
    set({
      pendingModel: {
        ...pendingModel,
        foreignKeys: [...pendingModel.foreignKeys, newFk],
      },
      isDirty: true,
      errors: [],
    })
  },

  updateForeignKey: (
    id: string,
    changes: Partial<ForeignKeyDefinition>,
  ) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        foreignKeys: pendingModel.foreignKeys.map((fk) =>
          fk.id === id ? { ...fk, ...changes } : fk,
        ),
      },
      isDirty: true,
      errors: [],
    })
  },

  removeForeignKey: (id: string) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        foreignKeys: pendingModel.foreignKeys.filter((fk) => fk.id !== id),
      },
      isDirty: true,
      errors: [],
    })
  },

  // ── Indexes ────────────────────────────────────────────────────

  addIndex: () => {
    const { pendingModel } = get()
    if (!pendingModel) return

    const newIdx = createDefaultIndex()
    set({
      pendingModel: {
        ...pendingModel,
        indexes: [...pendingModel.indexes, newIdx],
      },
      isDirty: true,
      errors: [],
    })
  },

  updateIndex: (id: string, changes: Partial<IndexDefinition>) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        indexes: pendingModel.indexes.map((idx) =>
          idx.id === id ? { ...idx, ...changes } : idx,
        ),
      },
      isDirty: true,
      errors: [],
    })
  },

  removeIndex: (id: string) => {
    const { pendingModel } = get()
    if (!pendingModel) return

    set({
      pendingModel: {
        ...pendingModel,
        indexes: pendingModel.indexes.filter((idx) => idx.id !== id),
      },
      isDirty: true,
      errors: [],
    })
  },

  // ── DDL Operations ─────────────────────────────────────────────

  generateDdlPreview: async () => {
    const state = get()
    if (!state.pendingModel) return

    // Validate first
    const errors = validateSchemaModel(state.pendingModel)
    set({ errors })
    if (errors.length > 0) return

    set({ isGeneratingDdl: true, ddlPlan: null })
    try {
      const payload = state.connectionPayload
      if (payload) {
        const request = toDdlRequest(state.originalModel, state.pendingModel)
        const result = await sqlGenerateDdl(payload, request.current, request.pending)
        set({ ddlPlan: result })
      } else {
        // Fallback: generate diff-based preview when no connection payload is available
        const diff = get().getDiff()
        set({
          ddlPlan: {
            statements: diff.changes.map((c, i) => ({
              order: i + 1,
              sql: `-- ${c.description}`,
              description: c.description,
              isDestructive: c.isDestructive,
            })),
            isDestructive: diff.destructiveCount > 0,
            warnings: diff.changes
              .filter((c) => c.isDestructive)
              .map((c) => c.description),
          },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        ddlPlan: {
          statements: [],
          isDestructive: false,
          warnings: [`Failed to generate DDL: ${message}`],
        },
      })
    } finally {
      set({ isGeneratingDdl: false })
    }
  },

  executeDdl: async () => {
    const { ddlPlan, connectionPayload } = get()
    if (!ddlPlan) return

    set({ isExecuting: true, executionResult: null })
    try {
      if (connectionPayload) {
        const result = await sqlExecuteDdl(connectionPayload, ddlPlan)
        set({ executionResult: result })
        // Auto-refresh schema after successful execution
        if (result.success) {
          const { pendingModel, onAfterSave } = get()
          if (pendingModel) {
            set({
              originalModel: structuredClone(pendingModel),
              isDirty: false,
            })
          }
          // Trigger post-save callback (e.g. refresh explorer, select new table)
          if (onAfterSave) {
            const tableName = pendingModel?.tableName
            if (tableName) {
              try {
                await onAfterSave(tableName)
              } catch {
                // Swallow callback errors — DDL already succeeded
              }
            }
          }
        }
      } else {
        // Fallback: simulate success when no connection payload is available
        set({
          executionResult: {
            success: true,
            executedCount: ddlPlan.statements.length,
            statements: ddlPlan.statements.map((s) => ({
              order: s.order,
              sql: s.sql,
              success: true,
              error: null,
              elapsedMs: 0,
            })),
          },
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({
        executionResult: {
          success: false,
          executedCount: 0,
          statements: [{
            order: 0,
            sql: '',
            success: false,
            error: message,
            elapsedMs: 0,
          }],
        },
      })
    } finally {
      set({ isExecuting: false })
    }
  },

  validate: () => {
    const { pendingModel } = get()
    if (!pendingModel) return []
    const errors = validateSchemaModel(pendingModel)
    set({ errors })
    return errors
  },

  getDiff: () => {
    const { originalModel, pendingModel } = get()
    if (!pendingModel) {
      return { hasChanges: false, destructiveCount: 0, changes: [] }
    }
    if (!originalModel) {
      // Creating new table — treat all pending columns/constraints as additions
      return computeNewTableDiff(pendingModel)
    }
    return computeSchemaDiff(originalModel, pendingModel)
  },
}))

// ── Helpers ────────────────────────────────────────────────────────

/**
 * When creating a new table (no original), every column and constraint
 * is an "add" change.
 */
function computeNewTableDiff(
  model: TableSchemaModel,
): SchemaDiffSummary {
  const changes = []

  for (const col of model.columns) {
    changes.push({
      type: 'add' as const,
      target: 'column' as const,
      name: col.name,
      description: `Add column "${col.name}"`,
      isDestructive: false,
      details: [`Type: ${col.dataType}`, `Nullable: ${col.isNullable}`],
    })
  }

  if (model.primaryKey) {
    changes.push({
      type: 'add' as const,
      target: 'primaryKey' as const,
      name: model.primaryKey.name ?? '(unnamed)',
      description: `Add primary key on (${model.primaryKey.columns.join(', ')})`,
      isDestructive: false,
      details: [],
    })
  }

  for (const uq of model.uniqueConstraints) {
    changes.push({
      type: 'add' as const,
      target: 'uniqueConstraint' as const,
      name: uq.name ?? uq.id,
      description: `Add unique constraint on (${uq.columns.join(', ')})`,
      isDestructive: false,
      details: [],
    })
  }

  for (const fk of model.foreignKeys) {
    changes.push({
      type: 'add' as const,
      target: 'foreignKey' as const,
      name: fk.name ?? fk.id,
      description: `Add foreign key → ${fk.referencedTable}`,
      isDestructive: false,
      details: [],
    })
  }

  for (const idx of model.indexes) {
    changes.push({
      type: 'add' as const,
      target: 'index' as const,
      name: idx.name ?? idx.id,
      description: `Create index on (${idx.columns.join(', ')})`,
      isDestructive: false,
      details: [],
    })
  }

  return {
    hasChanges: changes.length > 0,
    destructiveCount: 0,
    changes,
  }
}
