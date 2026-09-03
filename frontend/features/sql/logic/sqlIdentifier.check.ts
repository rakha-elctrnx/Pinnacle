// ponytail: tiny self-check for engine-aware SQL identifier quoting — delete after a real test framework is added.
// Run: npx tsx frontend/features/sql/logic/sqlIdentifier.check.ts
//
import {
  quoteIdentifierForEngine,
  qualifyIdentifierForEngine,
} from './sqlIdentifier'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.error('FAIL:', msg)
  } else {
    console.log('ok  :', msg)
  }
}

// ── postgresql: double quotes, embedded quotes doubled ─────────────
assert(
  quoteIdentifierForEngine('postgresql', 'users') === '"users"',
  'pg: lowercase name quoted',
)
assert(
  quoteIdentifierForEngine('postgresql', 'MyTable') === '"MyTable"',
  'pg: uppercase name quoted',
)
assert(
  quoteIdentifierForEngine('postgresql', 'select') === '"select"',
  'pg: reserved word quoted',
)
assert(
  quoteIdentifierForEngine('postgresql', 'Order Items') === '"Order Items"',
  'pg: spaces quoted',
)
assert(
  quoteIdentifierForEngine('postgresql', 'a-b.c') === '"a-b.c"',
  'pg: punctuation quoted',
)
assert(
  quoteIdentifierForEngine('postgresql', 'a"b') === '"a""b"',
  'pg: embedded double quote doubled',
)
assert(
  qualifyIdentifierForEngine('postgresql', 'public', 'users') ===
    '"public"."users"',
  'pg: schema-qualified two segments',
)
assert(
  qualifyIdentifierForEngine('postgresql', undefined, 'users') === '"users"',
  'pg: no qualifier (undefined) single segment',
)
assert(
  qualifyIdentifierForEngine('postgresql', '', 'users') === '"users"',
  'pg: no qualifier (empty string) single segment',
)

// ── mysql: backticks, embedded backticks doubled ───────────────────
assert(
  quoteIdentifierForEngine('mysql', 'users') === '`users`',
  'mysql: lowercase name quoted',
)
assert(
  quoteIdentifierForEngine('mysql', 'MyTable') === '`MyTable`',
  'mysql: uppercase name quoted',
)
assert(
  quoteIdentifierForEngine('mysql', 'select') === '`select`',
  'mysql: reserved word quoted',
)
assert(
  quoteIdentifierForEngine('mysql', 'Order Items') === '`Order Items`',
  'mysql: spaces quoted',
)
assert(
  quoteIdentifierForEngine('mysql', 'a`b') === '`a``b`',
  'mysql: embedded backtick doubled',
)
assert(
  qualifyIdentifierForEngine('mysql', 'mydb', 'users') === '`mydb`.`users`',
  'mysql: database-qualified two segments',
)
assert(
  qualifyIdentifierForEngine('mysql', undefined, 'users') === '`users`',
  'mysql: no qualifier (undefined) single segment',
)
assert(
  qualifyIdentifierForEngine('mysql', '', 'users') === '`users`',
  'mysql: no qualifier (empty string) single segment',
)

// ── sqlite: behaves like postgresql ────────────────────────────────
assert(
  quoteIdentifierForEngine('sqlite', 'users') === '"users"',
  'sqlite: lowercase name quoted',
)
assert(
  quoteIdentifierForEngine('sqlite', 'a"b') === '"a""b"',
  'sqlite: embedded double quote doubled',
)
assert(
  qualifyIdentifierForEngine('sqlite', 'public', 'users') ===
    '"public"."users"',
  'sqlite: schema-qualified two segments',
)
assert(
  qualifyIdentifierForEngine('sqlite', undefined, 'users') === '"users"',
  'sqlite: no qualifier (undefined) single segment',
)
assert(
  qualifyIdentifierForEngine('sqlite', '', 'users') === '"users"',
  'sqlite: no qualifier (empty string) single segment',
)

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
} else {
  console.log('\nAll checks passed')
}
