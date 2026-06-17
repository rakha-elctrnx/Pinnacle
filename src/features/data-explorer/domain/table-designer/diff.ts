/**
 * SQL Table Designer — Diff Utility
 *
 * Compares an original (baseline) schema model with a pending (edited)
 * model and produces a human-readable diff summary. Used by the DDL
 * preview panel and change tracking.
 */

import type {
  TableSchemaModel,
  ColumnDefinition,
  PrimaryKeyDefinition,
  UniqueConstraintDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  SchemaDiffSummary,
  SchemaChangeItem,
} from './index'

/**
 * Compute a diff between the original and pending schema models.
 * Returns an empty diff when both models are equivalent.
 */
export function computeSchemaDiff(
  original: TableSchemaModel,
  pending: TableSchemaModel,
): SchemaDiffSummary {
  const changes: SchemaChangeItem[] = []

  diffColumns(original.columns, pending.columns, changes)
  diffPrimaryKey(original.primaryKey, pending.primaryKey, changes)
  diffUniqueConstraints(
    original.uniqueConstraints,
    pending.uniqueConstraints,
    changes,
  )
  diffForeignKeys(original.foreignKeys, pending.foreignKeys, changes)
  diffIndexes(original.indexes, pending.indexes, changes)

  const destructiveCount = changes.filter((c) => c.isDestructive).length

  return {
    hasChanges: changes.length > 0,
    destructiveCount,
    changes,
  }
}

// ── Column Diff ────────────────────────────────────────────────────

function diffColumns(
  original: ColumnDefinition[],
  pending: ColumnDefinition[],
  changes: SchemaChangeItem[],
): void {
  const origMap = new Map(original.map((c) => [c.name.toLowerCase(), c]))
  const pendMap = new Map(pending.map((c) => [c.name.toLowerCase(), c]))

  // Added columns
  for (const [name, col] of pendMap) {
    if (!origMap.has(name)) {
      changes.push({
        type: 'add',
        target: 'column',
        name: col.name,
        description: `Add column "${col.name}"`,
        isDestructive: false,
        details: [`Type: ${col.dataType}`, `Nullable: ${col.isNullable}`],
      })
    }
  }

  // Removed columns
  for (const [name, col] of origMap) {
    if (!pendMap.has(name)) {
      changes.push({
        type: 'remove',
        target: 'column',
        name: col.name,
        description: `Drop column "${col.name}"`,
        isDestructive: true,
        details: ['This action is irreversible and will delete all data in this column.'],
      })
    }
  }

  // Modified columns
  for (const [name, pendCol] of pendMap) {
    const origCol = origMap.get(name)
    if (!origCol) continue

    const details = getColumnChangeDetails(origCol, pendCol)
    if (details.length > 0) {
      changes.push({
        type: 'modify',
        target: 'column',
        name: pendCol.name,
        description: `Modify column "${pendCol.name}"`,
        isDestructive: false,
        details,
      })
    }
  }
}

function getColumnChangeDetails(
  orig: ColumnDefinition,
  pend: ColumnDefinition,
): string[] {
  const details: string[] = []

  if (orig.dataType !== pend.dataType) {
    details.push(`Data type: ${orig.dataType} → ${pend.dataType}`)
  }
  if (orig.length !== pend.length) {
    details.push(`Length: ${orig.length ?? 'none'} → ${pend.length ?? 'none'}`)
  }
  if (orig.precision !== pend.precision) {
    details.push(
      `Precision: ${orig.precision ?? 'none'} → ${pend.precision ?? 'none'}`,
    )
  }
  if (orig.scale !== pend.scale) {
    details.push(`Scale: ${orig.scale ?? 'none'} → ${pend.scale ?? 'none'}`)
  }
  if (orig.isNullable !== pend.isNullable) {
    details.push(
      `Nullable: ${orig.isNullable} → ${pend.isNullable}`,
    )
  }
  if (orig.defaultValue !== pend.defaultValue) {
    details.push(
      `Default: ${orig.defaultValue ?? 'none'} → ${pend.defaultValue ?? 'none'}`,
    )
  }
  if (orig.isAutoIncrement !== pend.isAutoIncrement) {
    details.push(`Auto-increment: ${orig.isAutoIncrement} → ${pend.isAutoIncrement}`)
  }
  if (orig.comment !== pend.comment) {
    details.push(
      `Comment: ${orig.comment ?? 'none'} → ${pend.comment ?? 'none'}`,
    )
  }

  return details
}

// ── Primary Key Diff ───────────────────────────────────────────────

function diffPrimaryKey(
  orig: PrimaryKeyDefinition | null,
  pend: PrimaryKeyDefinition | null,
  changes: SchemaChangeItem[],
): void {
  if (!orig && pend) {
    changes.push({
      type: 'add',
      target: 'primaryKey',
      name: pend.name ?? '(unnamed)',
      description: `Add primary key on (${pend.columns.join(', ')})`,
      isDestructive: false,
      details: [],
    })
    return
  }

  if (orig && !pend) {
    changes.push({
      type: 'remove',
      target: 'primaryKey',
      name: orig.name ?? '(unnamed)',
      description: `Drop primary key`,
      isDestructive: true,
      details: ['Removing the primary key may affect data integrity.'],
    })
    return
  }

  if (orig && pend) {
    const details = getConstraintChangeDetails(
      orig.name,
      pend.name,
      orig.columns,
      pend.columns,
    )
    if (details.length > 0) {
      changes.push({
        type: 'modify',
        target: 'primaryKey',
        name: pend.name ?? '(unnamed)',
        description: `Modify primary key`,
        isDestructive: false,
        details,
      })
    }
  }
}

// ── Unique Constraints Diff ────────────────────────────────────────

function diffUniqueConstraints(
  orig: UniqueConstraintDefinition[],
  pend: UniqueConstraintDefinition[],
  changes: SchemaChangeItem[],
): void {
  const origMap = new Map(orig.map((u) => [u.id, u]))
  const pendMap = new Map(pend.map((u) => [u.id, u]))

  for (const [id, uq] of pendMap) {
    if (!origMap.has(id)) {
      changes.push({
        type: 'add',
        target: 'uniqueConstraint',
        name: uq.name ?? uq.id,
        description: `Add unique constraint on (${uq.columns.join(', ')})`,
        isDestructive: false,
        details: [],
      })
    }
  }

  for (const [id, uq] of origMap) {
    if (!pendMap.has(id)) {
      changes.push({
        type: 'remove',
        target: 'uniqueConstraint',
        name: uq.name ?? uq.id,
        description: `Drop unique constraint "${uq.name ?? uq.id}"`,
        isDestructive: false,
        details: [],
      })
    }
  }

  for (const [id, pendUq] of pendMap) {
    const origUq = origMap.get(id)
    if (!origUq) continue

    const details = getConstraintChangeDetails(
      origUq.name,
      pendUq.name,
      origUq.columns,
      pendUq.columns,
    )
    if (details.length > 0) {
      changes.push({
        type: 'modify',
        target: 'uniqueConstraint',
        name: pendUq.name ?? pendUq.id,
        description: `Modify unique constraint "${pendUq.name ?? pendUq.id}"`,
        isDestructive: false,
        details,
      })
    }
  }
}

// ── Foreign Keys Diff ──────────────────────────────────────────────

function diffForeignKeys(
  orig: ForeignKeyDefinition[],
  pend: ForeignKeyDefinition[],
  changes: SchemaChangeItem[],
): void {
  const origMap = new Map(orig.map((fk) => [fk.id, fk]))
  const pendMap = new Map(pend.map((fk) => [fk.id, fk]))

  for (const [id, fk] of pendMap) {
    if (!origMap.has(id)) {
      changes.push({
        type: 'add',
        target: 'foreignKey',
        name: fk.name ?? fk.id,
        description: `Add foreign key "${fk.name ?? fk.id}" → ${fk.referencedTable}`,
        isDestructive: false,
        details: [
          `Columns: (${fk.columns.join(', ')})`,
          `References: ${fk.referencedSchema}.${fk.referencedTable}(${fk.referencedColumns.join(', ')})`,
        ],
      })
    }
  }

  for (const [id, fk] of origMap) {
    if (!pendMap.has(id)) {
      changes.push({
        type: 'remove',
        target: 'foreignKey',
        name: fk.name ?? fk.id,
        description: `Drop foreign key "${fk.name ?? fk.id}"`,
        isDestructive: false,
        details: [],
      })
    }
  }

  for (const [id, pendFk] of pendMap) {
    const origFk = origMap.get(id)
    if (!origFk) continue

    const details: string[] = []

    if (origFk.name !== pendFk.name) {
      details.push(`Name: ${origFk.name ?? 'auto'} → ${pendFk.name ?? 'auto'}`)
    }
    if (arrayEqual(origFk.columns, pendFk.columns)) {
      // same
    } else {
      details.push(
        `Columns: (${origFk.columns.join(', ')}) → (${pendFk.columns.join(', ')})`,
      )
    }
    if (origFk.referencedTable !== pendFk.referencedTable) {
      details.push(
        `Referenced table: ${origFk.referencedTable} → ${pendFk.referencedTable}`,
      )
    }
    if (!arrayEqual(origFk.referencedColumns, pendFk.referencedColumns)) {
      details.push(
        `Referenced columns: (${origFk.referencedColumns.join(', ')}) → (${pendFk.referencedColumns.join(', ')})`,
      )
    }
    if (origFk.onUpdate !== pendFk.onUpdate) {
      details.push(`ON UPDATE: ${origFk.onUpdate} → ${pendFk.onUpdate}`)
    }
    if (origFk.onDelete !== pendFk.onDelete) {
      details.push(`ON DELETE: ${origFk.onDelete} → ${pendFk.onDelete}`)
    }

    if (details.length > 0) {
      changes.push({
        type: 'modify',
        target: 'foreignKey',
        name: pendFk.name ?? pendFk.id,
        description: `Modify foreign key "${pendFk.name ?? pendFk.id}"`,
        isDestructive: false,
        details,
      })
    }
  }
}

// ── Indexes Diff ───────────────────────────────────────────────────

function diffIndexes(
  orig: IndexDefinition[],
  pend: IndexDefinition[],
  changes: SchemaChangeItem[],
): void {
  const origMap = new Map(orig.map((idx) => [idx.id, idx]))
  const pendMap = new Map(pend.map((idx) => [idx.id, idx]))

  for (const [id, idx] of pendMap) {
    if (!origMap.has(id)) {
      changes.push({
        type: 'add',
        target: 'index',
        name: idx.name ?? idx.id,
        description: `Create index on (${idx.columns.join(', ')})`,
        isDestructive: false,
        details: [
          `Type: ${idx.indexType}`,
          `Unique: ${idx.isUnique}`,
        ],
      })
    }
  }

  for (const [id, idx] of origMap) {
    if (!pendMap.has(id)) {
      changes.push({
        type: 'remove',
        target: 'index',
        name: idx.name ?? idx.id,
        description: `Drop index "${idx.name ?? idx.id}"`,
        isDestructive: false,
        details: [],
      })
    }
  }

  for (const [id, pendIdx] of pendMap) {
    const origIdx = origMap.get(id)
    if (!origIdx) continue

    const details: string[] = []

    if (origIdx.name !== pendIdx.name) {
      details.push(`Name: ${origIdx.name ?? 'auto'} → ${pendIdx.name ?? 'auto'}`)
    }
    if (!arrayEqual(origIdx.columns, pendIdx.columns)) {
      details.push(
        `Columns: (${origIdx.columns.join(', ')}) → (${pendIdx.columns.join(', ')})`,
      )
    }
    if (origIdx.isUnique !== pendIdx.isUnique) {
      details.push(`Unique: ${origIdx.isUnique} → ${pendIdx.isUnique}`)
    }
    if (origIdx.indexType !== pendIdx.indexType) {
      details.push(`Type: ${origIdx.indexType} → ${pendIdx.indexType}`)
    }

    if (details.length > 0) {
      changes.push({
        type: 'modify',
        target: 'index',
        name: pendIdx.name ?? pendIdx.id,
        description: `Modify index "${pendIdx.name ?? pendIdx.id}"`,
        isDestructive: false,
        details,
      })
    }
  }
}

// ── Shared Helpers ─────────────────────────────────────────────────

function getConstraintChangeDetails(
  origName: string | null,
  pendName: string | null,
  origColumns: string[],
  pendColumns: string[],
): string[] {
  const details: string[] = []

  if (origName !== pendName) {
    details.push(`Name: ${origName ?? 'auto'} → ${pendName ?? 'auto'}`)
  }
  if (!arrayEqual(origColumns, pendColumns)) {
    details.push(
      `Columns: (${origColumns.join(', ')}) → (${pendColumns.join(', ')})`,
    )
  }

  return details
}

function arrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, i) => val === b[i])
}
