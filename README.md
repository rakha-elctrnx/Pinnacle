# Pinnacle

> **Data Explorer for Developers** — a local-first desktop application for browsing, querying, and editing your databases and data infrastructure.

<div align="center">

![Release](https://img.shields.io/badge/Pinnacle-v1.0.0-blue?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2.11-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-1.77%2B-brown?style=flat-square)
![Local-first](https://img.shields.io/badge/telemetry-none-green?style=flat-square)

</div>

---

## ✨ About

**Pinnacle** is a desktop data explorer built with [Tauri v2](https://tauri.app/), [React 19](https://react.dev/), and [Rust](https://www.rust-lang.org/). It gives one interface to relational databases, document stores, search engines, and caches — connections, credentials, and query results stay on your machine.

- **Local-first.** No telemetry, no analytics, no external services. Traffic only ever leaves your machine toward the databases you explicitly connect to.
- **OS keychain credentials.** Passwords, SSH passwords, and key passphrases live in the native OS keyring — never in the frontend, never in plaintext config.
- **Real editing, not just reading.** Inline grid edits are staged, diffed, and committed as one atomic batch; schema changes go through a DDL plan you can inspect first.
- **All logic in Rust.** The frontend renders and manages UI state; every connection, query, introspection, and export runs in the backend.

## 🚀 Supported Connectors

| Connector         | Driver (backend)                  | What you can do                                                                   |
| ----------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| **PostgreSQL**    | `sqlx` 0.8 (`PgPool`)             | Query + cancel, multi-statement, introspection, DDL, transactions, inline editing |
| **MySQL**         | `sqlx` 0.8 (`MySqlPool`)          | Query, introspection, DDL, transactions, inline editing, export                   |
| **SQLite**        | `sqlx` 0.8 (`SqlitePool`)         | Local file DB, query, `PRAGMA` schema introspection, DDL                          |
| **MongoDB**       | `mongodb` 3.8 driver              | CRUD, aggregation + `explain`, schema sampling, index manager, validation, export |
| **Redis**         | `redis` 1.0.4 (multiplexed async) | Database/keyspace browser, `SCAN` keys, per-type inspectors, raw command console  |
| **Elasticsearch** | `reqwest` 0.12 over REST          | Cluster health/stats, index lifecycle, document search/edit, mappings, Dev Tools  |

All six ship with a full Tauri command surface and a dedicated UI workspace. RabbitMQ support was removed.

### Cross-connector capabilities

- **SSH tunnels** for SQL and Redis connections (`russh` 0.54 local port forwarding) with password, private-key, or agent auth; TLS options for direct connections.
- **Connection manager** with folders/groups, typeahead filter, and live status dots; configurable per-connection statement timeouts.
- **Multi-tab workspace** — each connection opens its own tabs, layouts, and console history.
- **Exports** to `TXT`, `CSV`, `JSON`, `SQL`, `XLSX` with row-count/size estimation before the write starts.
- **ER diagram** for SQL schemas, auto-laid out with `@xyflow/react` + `dagre`.
- **Visual table designer** in its own window: edit columns, indexes, and foreign keys, then preview the generated `ALTER`/`CREATE` diff before executing.
- **Monaco everywhere**: SQL editor with a custom completion provider and validator, view editor, row-detail JSON, Redis console, MongoDB document editor, Elasticsearch REST console.

## 🛠 Tech Stack

**Frontend** — React 19.2 · TypeScript ~6.0 (strict) · Vite 8 · Tailwind CSS v4 (`@tailwindcss/vite`) · Zustand 5 · TanStack Query 5 · TanStack Table 8 · Monaco Editor 4.7 · React Flow 12 + dagre · React Router 7 · lucide-react

**Backend (Tauri v2 / Rust, edition 2021)** — `sqlx` 0.8 (postgres, mysql, sqlite, chrono, bigdecimal, uuid; `runtime-tokio-rustls`) · `mongodb` 3.8 · `redis` 1.0.4 · `reqwest` 0.12 · `russh` 0.54 · `keyring` 3 · `rust_xlsxwriter` 0.95 + `csv` 1.3 · `tokio` 1 · `thiserror` 2

**Storage** — connection metadata in `pinnacle-connections.json` inside the app data directory; secrets in the OS keyring (`keyring` 3) under service `pinnacle-connection=<id>`.

**Quality** — ESLint 10 flat config · Prettier · Vitest 4 + Testing Library (jsdom) · `cargo clippy -D warnings`

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) LTS + [pnpm](https://pnpm.io/) 10 (`packageManager` is pinned to `pnpm@10.25.0`)
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77.2
- [Tauri v2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS (on Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `patchelf`)

### Install & run

```bash
git clone https://github.com/rakha0x/Pinnacle.git
cd Pinnacle

pnpm install          # installs JS deps; Rust deps build on first run
pnpm tauri:dev        # full desktop app (Vite + Rust, hot reload)
```

Frontend-only development (no Tauri shell — `invoke` calls will fail):

```bash
pnpm dev              # Vite on http://localhost:5173 (strictPort, HMR 5174)
```

### Scripts and Make targets

| Command            | What it does                                      |
| ------------------ | ------------------------------------------------- |
| `pnpm dev`         | Vite dev server only                              |
| `pnpm tauri:dev`   | Full app in dev mode (`TAURI_APP_PATH=./backend`) |
| `pnpm build`       | `tsc -b` + `vite build` → `dist/`                 |
| `pnpm tauri:build` | Production desktop bundle                         |
| `pnpm typecheck`   | `tsc -b`                                          |
| `pnpm lint`        | ESLint over the workspace                         |
| `pnpm format`      | Prettier `--write .`                              |
| `pnpm test`        | Vitest run (frontend unit tests)                  |

The `Makefile` wraps the same surface plus Cargo tasks:

| Target          | Runs                               |
| --------------- | ---------------------------------- |
| `make dev`      | `npm run tauri:dev`                |
| `make dev-fe`   | `npm run dev`                      |
| `make dev-be`   | `cargo watch -x run` in `backend/` |
| `make build`    | `npm run tauri:build`              |
| `make build-fe` | `npm run build`                    |
| `make build-be` | `cargo build --release`            |
| `make check`    | `lint` + `typecheck`               |
| `make clippy`   | `cargo clippy -- -D warnings`      |
| `make test-be`  | `cargo test`                       |
| `make preview`  | `vite preview`                     |
| `make clean`    | removes `dist/` + `cargo clean`    |

`make help` lists every target.

### Test datasources

`docker/` is a seeded playground so you can exercise every connector without touching real data:

```bash
cd docker && docker compose up -d
```

| Service              | Port  | Credentials                  | Seed data                                                     |
| -------------------- | ----- | ---------------------------- | ------------------------------------------------------------- |
| `postgres` 16        | 5432  | `pinnacle` / `pinnacle_pass` | `pinnacle_db` — 20-table e-commerce schema, JSONB, partitions |
| `mongodb` 7.0        | 27017 | `pinnacle` / `pinnacle_pass` | 6 collections incl. `2dsphere` indexes                        |
| `redis` 7            | 6379  | none                         | keys across string/hash/list/set/zset                         |
| `elasticsearch` 8.14 | 9200  | security disabled            | 4 indices with mappings + sample docs                         |

See [`docker/README.md`](./docker/README.md) for the full dataset and sample queries. `docker compose down -v` wipes the volumes.

## 📁 Project Structure

```
pinnacle/
├── frontend/                 # React + TypeScript UI
│   ├── app/                  # router, providers, theme wiring
│   ├── features/
│   │   ├── _shared/          # app shell, sidebar tree, connection modal, UI kit, stores
│   │   ├── sql/              # Postgres / MySQL / SQLite workspace
│   │   ├── mongodb/          # collection workspace
│   │   ├── redis/            # keyspace browser + console
│   │   └── elasticsearch/    # cluster, indices, documents, REST console
│   └── index.css             # Tailwind v4 entrypoint + theme tokens
├── backend/                  # Tauri v2 Rust app (TAURI_APP_PATH=./backend)
│   ├── src/
│   │   ├── application/      # thin #[tauri::command] handlers per service
│   │   ├── core/             # AppError (thiserror) + IPC error sanitisation
│   │   ├── domain/           # connection, query, export, mongodb, redis models
│   │   └── infrastructure/   # connectors: sql/postgresql/sqlite/mongodb/redis/
│   │                         #             elastic, ssh, ssl, ddl, export, pool,
│   │                         #             transaction, keyring, store
│   ├── capabilities/         # window permission grants
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docker/                   # seeded Postgres/Mongo/Redis/Elasticsearch
├── .github/workflows/        # release build matrix
├── Makefile
└── package.json
```

### Data flow

```
React component → feature hook (TanStack Query) → features/<svc>/clients/<svc>.ts (invoke)
                 → Tauri command (application/commands) → infrastructure/connectors/<driver>
```

Each feature owns its slice end to end: `clients/` wraps `invoke<T>('command_name', payload)` and exports the payload/result types, `hooks/` wraps queries and mutations, `store/` holds Zustand state, `types/` mirrors the Rust serde structs. Adding a backend capability means touching all four layers plus registering the command in `application/commands/mod.rs` and the `invoke_handler!` list in `src/lib.rs`.

**Credential model:** `save_connection` persists metadata to `pinnacle-connections.json` and puts each secret in the OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service) — service `pinnacle-connection=<id>` for the database password, `…=<id>-ssh` for an SSH password, `…=<id>-ssh-passphrase` for a key file, with `<id>` as the account. The frontend only ever asks for a secret at connect time. Errors crossing the IPC boundary are sanitised so connection strings and passwords cannot leak into logs or UI.

## 🧪 Verification

```bash
pnpm typecheck && pnpm lint && pnpm test   # TS, ESLint, 25 Vitest files
make clippy && make test-be                # Rust lints + tests
```

Frontend tests cover the SQL explorer tree, `useExplorerData` (caching, ordering, connection-switch races), staged-edit state and commit keys, filter/sort logic, identifier escaping, clipboard formatting, grid selection, toolbar/pagination components, sidebar keyboard + drag behaviour, context menus, and the Redis/Mongo/Elastic client wrappers.

## 🚢 Releases

`.github/workflows/release.yml` builds on `v*` tags (or manual dispatch) with `tauri-action` across macOS ARM64, macOS Intel, Windows, and Linux x86_64, then opens a **draft** GitHub release with the bundled installers. Unsigned macOS builds need `xattr -cr /Applications/Pinnacle.app` on first launch. There is no pull-request CI workflow yet — lint/typecheck/test are run locally via the commands above.

## 🤝 Contributing

Contributions are welcome — bug reports, new connectors, UI work, docs.

1. Fork and branch: `git checkout -b feature/my-awesome-feature`
2. Make sure `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `make clippy` pass
3. Follow existing conventions: `import type` for type-only imports, semantic theme tokens instead of raw color utilities (enforced by ESLint on `frontend/features/**/*.tsx`), thin command handlers that delegate to connectors
4. Keep frontend payload/result types in sync with the Rust serde structs
5. Open a pull request; link the issue it closes

Please do **not** move query execution, credential handling, or file/export work into the frontend — that is the architectural invariant this project is built on.

### Reporting issues

[Open an issue](https://github.com/rakha0x/Pinnacle/issues) with a description, reproduction steps, connector + version, and your environment (OS, Node, Rust). Redact connection strings and credentials from any pasted error.

## 📄 License

No `LICENSE` file exists in the repository yet, so all rights are reserved by default. If Pinnacle is meant to be MIT-licensed, add a `LICENSE` file at the root and update this section.

## 🙏 Acknowledgements

[Tauri](https://tauri.app/) · [sqlx](https://github.com/launchbadge/sqlx) · [Monaco Editor](https://microsoft.github.io/monaco-editor/) · [TanStack Table & Query](https://tanstack.com/) · [React Flow](https://reactflow.dev/) · [Tailwind CSS](https://tailwindcss.com/) · [Zustand](https://zustand.docs.pmnd.rs/) — and the open-source community that makes projects like this possible.

---

<div align="center">

Made with ☕ by the Pinnacle contributors

**[⭐ Star this repo](https://github.com/rakha0x/Pinnacle)** if you find it useful!

</div>
