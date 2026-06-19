# Pinnacle — AI Coding Instructions

Pinnacle is a **local-first desktop data explorer** for developers. It connects to databases and message brokers, browses their structure, and runs queries — keeping all credentials and connections on the user's machine. Privacy first: no telemetry, no credential transmission.

## Tech Stack

**Frontend:** React 19 + TypeScript (strict) · Vite · Tailwind CSS v4 · Zustand · TanStack Query · React Router v7 · Monaco Editor · AG Grid Community · React Flow (`@xyflow/react`).

**Backend (Tauri v2 / Rust, edition 2021):** `sqlx` (Postgres, MySQL) · `redis-rs` · `lapin` (RabbitMQ) · `reqwest` (Elasticsearch, MongoDB REST) · `tokio` · `thiserror`.

**Package manager:** `pnpm`. **Storage:** Tauri Store + Stronghold (encrypted credentials).

## Commands

- `pnpm dev` — Vite dev server (frontend only)
- `pnpm tauri:dev` — full desktop app (frontend + Rust)
- `pnpm build` — typecheck (`tsc -b`) + Vite build
- `pnpm typecheck` — type-check only
- `pnpm lint` — ESLint
- `pnpm format` — Prettier
- `pnpm tauri:build` — production desktop build

Always run `pnpm typecheck` and `pnpm lint` after changes. For Rust changes, build via `pnpm tauri:dev` or `cargo` in `src-tauri/`.

## Architecture: strict frontend/backend split

**All business logic lives in the Rust backend.** The frontend only renders UI, manages state, handles forms, and presents data.

- **Database connections, query execution, credential encryption/decryption, file & export operations** → Rust only.
- Credentials are encrypted with Tauri Stronghold and **must never appear in frontend logs**.
- Connections are made directly from the user's machine; nothing is sent to external servers.

### Data flow

```
React component → TanStack Query hook → service client (invoke) → Tauri command → Rust connector
```

1. **Service clients** (`src/services/clients/<service>.ts`) wrap `invoke<T>('command_name', { payload })` and define the payload/result TypeScript types.
2. **Query hooks** (`src/hooks/<service>/queries/`) wrap service calls in TanStack Query (`useQuery`/`useMutation`).
3. **Rust commands** (`src-tauri/src/application/commands/<service>_commands.rs`) are registered in `mod.rs` and delegate to `infrastructure/connectors/`.

When adding a backend capability, touch all layers: Rust command → register in `mod.rs` → service client type + `invoke` wrapper → query hook → UI.

## Project structure

**Frontend (`src/`):**
- `features/data-explorer/` — main feature, self-contained: `components/`, `domain/`, `hooks/`, `layouts/`, `pages/`, `context/`, plus `constants.ts`, `types.ts`, `utils.ts`.
- `domain/<service>/<capability>/` — domain logic grouped by service (sql, mongodb, redis, rabbitmq, elasticsearch) and `_shared/`.
- `services/clients/` — Tauri `invoke` wrappers per service.
- `hooks/<service>/queries/` — TanStack Query hooks.
- `state/` — Zustand stores (`connectionStore`, `designerStore`, `shellLayoutStore`).
- `types/` — shared domain types per service.

**Backend (`src-tauri/src/`)** follows Clean Architecture:
- `application/commands/` — Tauri command handlers (thin).
- `domain/` — domain models (`query.rs`, `export.rs`).
- `infrastructure/connectors/` — actual DB/service drivers.
- `core/` — shared `error.rs`, `result.rs`.

## Conventions

**TypeScript:**
- 2-space indent, single quotes, no unnecessary semicolons (Prettier is the source of truth).
- Use `import type { ... }` for type-only imports.
- Zustand stores: `create<State>()(...)`, name the hook `use<Name>Store`, use `persist` middleware with a `pinnacle-*` key for persisted state.
- Service client functions are `async`, typed with `invoke<ResultType>(...)`, and export their payload/result interfaces.
- Prefer feature/domain-local code; promote to `_shared/` only when reused across services.

**Rust:**
- Errors use the `AppError` enum (`core/error.rs`) with `thiserror`; add `From` impls for new error sources.
- Keep command handlers thin — delegate to `infrastructure/connectors/`.
- Register every new command module in `application/commands/mod.rs` and the command in the Tauri builder.

**Design system** (when building UI):
- Primary `#009ddc`; supporting `#61bb47 #fcb827 #f6821f #e03a3e #973d97`.
- macOS-like feel: clean layout, generous spacing, rounded corners (12–16px), **dark mode first**, subtle glassmorphism, smooth transitions, sidebar nav, command palette (Cmd/Ctrl+K).
- Inspirations: TablePlus, Raycast, Arc, Linear.

## Scope & status

- **MVP (v1.0):** PostgreSQL + MySQL — Connection Manager, SQL Editor, Query Execution, Result Viewer, CSV/JSON export.
- Redis, RabbitMQ, Elasticsearch, MongoDB are later releases; some scaffolding already exists per service.

## Guardrails

- Never move business logic, query execution, or credential handling into the frontend.
- Never log or expose credentials/secrets to the frontend.
- No telemetry or outbound calls except direct user-initiated connections to their own databases.
- Keep strong typing across the Tauri boundary: frontend payload/result types must mirror the Rust structs (serde).

## Project workflow

The project uses a tiered workflow. Pick the lightest tier that fits the work:

| Work size | Workflow |
| --- | --- |
| Small / obvious change (< 20 lines, no design question) | Code directly. Run `pnpm typecheck` + `pnpm lint`. Commit. |
| Feature or decision with design/architecture questions | Run the `analyst` skill (or `create-adr` prompt) to produce an ADR in `docs/decisions/` first, then implement. |
| Tracked feature that needs QA / handoff / traceability | Full ritual: `create-task` → `tasks/task-NNN-*.md`, then `execute-task` to implement, then `audit-task` for QA. |

### Where things live

- **`docs/decisions/`** — durable ADRs and workflow reviews (engineering decisions, visible to humans, committed to git). See `docs/decisions/README.md`.
- **`tasks/`** — transient taskboard (`task-NNN-*.md`, `bug-NNN-*.md`) and templates. See `tasks/README.md` for the canonical status model and Definition of Done.
- **`.github/skills/`** — `analyst`, `dev`, `qa` skill definitions.
- **`.github/prompts/`** — shortcuts: `create-adr`, `create-task`, `execute-task`, `audit-task`, `qa-handoff-checklist`.

### Rules

- Before creating a task, check `docs/decisions/` for a relevant ADR and link it.
- Before creating an ADR, check `docs/decisions/` first to avoid duplicates (update the existing one if refining the same direction).
- Before creating a task or bug, scan existing `tasks/task-*.md` / `tasks/bug-*.md` to avoid duplicates.
- Use only the canonical status labels from `tasks/README.md`: `todo`, `in-progress`, `blocked`, `needs-follow-up`, `done`.
- Never mark `done` without recorded validation evidence and Definition-of-Done checks.
- For ambiguous behavior with no existing decision, escalate to `analyst` before coding.
