# Task: MIGRATE Elasticsearch Components to New Tokens

## Metadata
- ID: task-008d-migrate-elasticsearch-components
- Status: done
- Owner: copilot
- Created: 2026-06-25
- Updated: 2026-06-25 (done)

## Objective
Migrate all Elasticsearch feature components from raw Tailwind palette classes and old MD3 token classes to the new unified token system.

## Scope
- In scope:
  - `frontend/features/elasticsearch/components/ElasticExplorerWorkspace.tsx`
  - `frontend/features/elasticsearch/layouts/ElasticLayout.tsx`
  - `frontend/features/elasticsearch/pages/ElasticConnectionWelcomePage.tsx`
  - `frontend/features/elasticsearch/pages/DocumentsPage.tsx`
  - `frontend/features/elasticsearch/pages/MappingsPage.tsx`
- Out of scope:
  - Shared components (task-008b)
  - SQL feature (task-008c)
  - Redis/RabbitMQ (task-008e)
  - Token definitions (task-008a)

## Ownership
- Dev owner: copilot (AI)
- Analyst reference: `docs/decisions/adr-20260625-unified-token-theme.md`

## Acceptance Criteria
- [x] `ElasticExplorerWorkspace.tsx` — zero instances of `bg-white`, `text-slate-*`, `border-slate-*`, `bg-gray-*`, `text-red-*`
- [x] `ElasticLayout.tsx` — `bg-red-500`, `text-red-500` replaced with token equivalents
- [x] `ElasticConnectionWelcomePage.tsx` — MD3 classes updated to new token names
- [x] `DocumentsPage.tsx` — MD3 classes updated
- [x] `MappingsPage.tsx` — MD3 classes updated
- [x] Zero `dark:` variant overrides remain in any touched file
- [x] `pnpm typecheck` — no new errors beyond baseline
- [x] `pnpm lint` — no new errors beyond baseline (9 pre-existing errors, 0 in touched files)

## Plan
1. Capture baseline error counts
2. **ElasticExplorerWorkspace.tsx** (worst in this group):
   - `bg-white` → `bg-bg-base`
   - `text-red-500` → `text-danger`
   - `text-slate-500` → `text-text-secondary`
   - `bg-gray-100` → `bg-bg-subtle`
   - `border-slate-200` → `border-border-default`
   - `text-slate-600` → `text-text-secondary`
   - `hover:bg-slate-50` → `hover:bg-bg-subtle`
   - `hover:bg-slate-200/70` → `hover:bg-bg-hover/70`
3. **ElasticLayout.tsx**:
   - `bg-red-500` → `bg-danger`
   - `text-red-500` → `text-danger`
4. **ElasticConnectionWelcomePage.tsx** — MD3 updates:
   - `bg-surface-variant/40` → `bg-bg-muted/40`
   - `text-on-surface-variant` → `text-text-secondary`
   - `text-on-surface` → `text-text-primary`
   - `text-on-surface-variant/70` → `text-text-secondary/70`
5. **DocumentsPage.tsx** — `text-on-surface-variant` → `text-text-secondary`
6. **MappingsPage.tsx** — `text-on-surface-variant` → `text-text-secondary`
7. Run `pnpm typecheck` + `pnpm lint`
8. Commit: `refactor(theme): migrate Elasticsearch components to unified tokens`

## AI Execution Note
> **⚡ Use a sub-agent** to execute this task. The sub-agent should:
> 1. Read all 5 files in scope
> 2. Apply class migration per the mapping above
> 3. Verify zero raw palette hits via grep across `frontend/features/elasticsearch/`
> 4. Run `pnpm typecheck` + `pnpm lint`
> 5. Report results back

## Risks And Dependencies
- **Blocker:** task-008a (token definitions must exist)
- **Parallel with:** task-008b, task-008c, task-008e (no file overlap)
- **Risk:** `ElasticExplorerWorkspace.tsx` has multiple patterns — search, tabs, error state, main content area. Each section needs individual attention.

## Phase Gate Check
- Decision clarity confirmed: yes
- Acceptance criteria testable: yes
- QA evidence complete for done: pending

## Related ADRs Or Workflow Reviews
- `docs/decisions/adr-20260625-unified-token-theme.md`

## Implementation Notes
- `ElasticLayout.tsx` line 210: `bg-red-500` is used for a status dot indicator — `bg-danger` is the correct replacement
- `ElasticLayout.tsx` line 222: `text-red-500` is inline error text — `text-danger` is the correct replacement
- `DocumentsPage.tsx` and `MappingsPage.tsx` only have `text-on-surface-variant` — single-line changes each
- After migration, verify `grep -rnE 'bg-white|bg-slate|text-slate|bg-gray|text-gray|bg-red|text-red|dark:' frontend/features/elasticsearch/` returns zero hits

## QA Evidence
- Validation run: 2026-06-25
- Result: PASS — all acceptance criteria met
- Remaining gaps:
  - `MappingExplorer.tsx` and `ElasticsearchWorkspaceNotice.tsx` still have raw palette classes (`bg-slate-50`, `text-slate-*`, `border-slate-*`) — these are out of scope for this task (MappingExplorer is a large component; ElasticsearchWorkspaceNotice may belong to a shared notice pattern)
  - Full elasticsearch folder grep `grep -rnE 'bg-white|bg-slate|text-slate|bg-gray|text-gray|bg-red|text-red|dark:' frontend/features/elasticsearch/` will still show hits from those 2 files

### Evidence
1. **Raw palette check (touched files):** `grep -rnE 'bg-white|bg-slate|text-slate|bg-gray|text-gray|bg-red|text-red|dark:'` on all 5 files → ZERO HITS
2. **MD3 token check (touched files):** `grep -rnE 'text-on-surface|bg-surface|text-on-primary|bg-primary-container|border-outline|bg-error'` on all 5 files → ZERO HITS
3. **`pnpm typecheck`:** PASS (0 errors)
4. **`pnpm lint`:** 9 pre-existing errors (0 in touched files), no new errors introduced

### Token migration applied
| Old class | New class | Files affected |
|-----------|-----------|----------------|
| `bg-white` | `bg-bg-base` | ElasticExplorerWorkspace (3×) |
| `text-red-500` | `text-danger` | ElasticExplorerWorkspace, ElasticLayout |
| `text-slate-500` | `text-text-secondary` | ElasticExplorerWorkspace |
| `bg-gray-100` | `bg-bg-subtle` | ElasticExplorerWorkspace |
| `border-slate-200` | `border-border-default` | ElasticExplorerWorkspace |
| `text-slate-600` | `text-text-secondary` | ElasticExplorerWorkspace |
| `hover:bg-slate-50` | `hover:bg-bg-subtle` | ElasticExplorerWorkspace |
| `hover:bg-slate-200/70` | `hover:bg-bg-hover/70` | ElasticExplorerWorkspace |
| `bg-emerald-500` | `bg-success` | ElasticLayout |
| `bg-amber-400` | `bg-warning` | ElasticLayout |
| `bg-red-500` (dot) | `bg-danger` | ElasticLayout |
| `text-on-surface-variant` | `text-text-secondary` | ElasticLayout, ElasticConnectionWelcomePage, DocumentsPage, MappingsPage |
| `bg-surface-variant` | `bg-bg-muted` | ElasticLayout |
| `border-outline-variant` | `border-border-default` | ElasticLayout |
| `bg-primary-container` | `bg-primary-subtle` | ElasticLayout |
| `text-on-primary-container` | `text-primary` | ElasticLayout |
| `hover:bg-surface-container-low` | `hover:bg-bg-subtle` | ElasticLayout |
| `hover:bg-error-container/30` | `hover:bg-danger-subtle/30` | ElasticLayout |
| `bg-surface-container-low` | `bg-bg-subtle` | ElasticLayout |
| `bg-surface-variant/40` | `bg-bg-muted/40` | ElasticConnectionWelcomePage |
| `text-on-surface` | `text-text-primary` | ElasticConnectionWelcomePage |

## Related Bugs
- None

## Next Action
Complete. `MappingExplorer.tsx` and `ElasticsearchWorkspaceNotice.tsx` still need migration — may be picked up as a follow-up task.
