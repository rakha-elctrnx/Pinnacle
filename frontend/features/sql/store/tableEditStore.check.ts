// ponytail: tiny self-check for useTableEditStore undo/redo — delete after a real test framework is added.
// Run: npx tsx frontend/features/sql/store/tableEditStore.check.ts
//
import {
  useTableEditStore,
  canUndo,
  canRedo,
  pendingChangeCount,
} from './tableEditStore'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.error('FAIL:', msg)
  } else {
    console.log('ok  :', msg)
  }
}

const s = useTableEditStore.getState

// reset
s().clearAll()
assert(!canUndo(s()), 'no undo after clearAll')
assert(!canRedo(s()), 'no redo after clearAll')

// ── edit: stage, then undo restores original ───────────────────────
s().stageEdit('tbl-1', 'name', 'alice', 'bob')
assert(pendingChangeCount(s()) === 1, 'one pending edit staged')
assert(canUndo(s()), 'undo available after stage')
s().undo()
assert(pendingChangeCount(s()) === 0, 'undo clears staged edit')
assert(canRedo(s()), 'redo available after undo')
s().redo()
assert(pendingChangeCount(s()) === 1, 'redo re-stages edit')

// undo again + clear redo by staging fresh
s().undo()
s().stageEdit('tbl-1', 'name', 'alice', 'carol')
assert(!canRedo(s()), 'new edit clears redo stack')

// ── insert: stage, then undo removes draft ─────────────────────────
s().clearAll()
const id = s().stageInsert({ name: '' })
assert(s().pendingInserts.length === 1, 'insert staged')
assert(canUndo(s()), 'undo available after insert')
s().undo()
assert(s().pendingInserts.length === 0, 'undo removes staged insert')
assert(s().pendingInserts.every((d) => d.__rowId !== id), 'undo removes the right draft')
s().redo()
assert(s().pendingInserts.length === 1, 'redo re-adds insert')

// ── delete: stage, then undo unstages ──────────────────────────────
s().clearAll()
s().stageDelete('tbl-5')
assert(s().pendingDeletes.includes('tbl-5'), 'delete staged')
s().undo()
assert(!s().pendingDeletes.includes('tbl-5'), 'undo unstages delete')
s().redo()
assert(s().pendingDeletes.includes('tbl-5'), 'redo re-stages delete')

// ── stack cap of 20 ────────────────────────────────────────────────
s().clearAll()
for (let i = 0; i < 25; i++) {
  s().stageEdit(`tbl-${i}`, 'c', i, i + 100)
}
assert(s().undoStack.length === 20, `undo stack capped at 20 (got ${s().undoStack.length})`)

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
} else {
  console.log('\nAll checks passed')
}
