# Pinnacle

> **Data Explorer for Developers** — a modern, open-source desktop application for browsing, querying, and managing your databases and data infrastructure.

<div align="center">

![Pinnacle](https://img.shields.io/badge/Pinnacle-v0.1.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red?style=flat-square)
![Tauri](https://img.shields.io/badge/Tauri-2.x-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-blue?style=flat-square)
![Rust](https://img.shields.io/badge/Rust-1.77+-brown?style=flat-square)

</div>

---

## ✨ About

**Pinnacle** is an open-source desktop data explorer built with [Tauri](https://tauri.app/), [React](https://react.dev/), and [Rust](https://www.rust-lang.org/). It provides a unified, intuitive interface for developers who work with multiple data stores on a daily basis — from relational databases to document stores, search engines, caches, and message brokers.

Whether you're a backend engineer debugging a production query, a DBA inspecting schema changes, or a developer exploring a new data source — Pinnacle aims to be the single tool you reach for.

## 🚀 Supported Connectors

| Connector      | Status        |
| -------------- | ------------- |
| **PostgreSQL** | ✅ Supported  |
| **MySQL**      | ✅ Supported  |
| **MongoDB**    | 🚧 In progress |
| **Redis**      | 🚧 In progress |
| **Elasticsearch** | 🚧 In progress |
| **RabbitMQ**   | 🚧 Planned  |

## 🛠 Tech Stack

- **Frontend:** React 19 + TypeScript + Vite + MUI + AG Grid + Monaco Editor + React Flow
- **Backend:** Rust + Tauri 2 + SQLx + Tokio
- **State:** Zustand + TanStack Query
- **Build:** Vite (frontend) + Cargo (backend) + Tauri bundler

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77.2
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) v2

### Installation

```bash
# Clone the repository
git clone https://github.com/rakha-elctrnx/Pinnacle.git
cd pinnacle

# Install frontend dependencies
npm install

# Run in development mode (frontend + backend)
make dev
```

### Available Commands

| Command           | Description                                      |
| ----------------- | ------------------------------------------------ |
| `make dev`        | Run the full Tauri app in dev mode               |
| `make dev-fe`     | Run only the Vite frontend dev server            |
| `make build`      | Build the full application for production        |
| `make build-fe`   | Build only the frontend                          |
| `make build-be`   | Build only the backend                           |
| `make lint`       | Run ESLint on the frontend                       |
| `make typecheck`  | Run TypeScript type checking                     |
| `make format`     | Format code with Prettier + Cargo fmt            |
| `make check`      | Run all checks (lint + typecheck + cargo check)  |
| `make clean`      | Clean build artifacts                            |

Run `make help` to see all available commands.

## 📁 Project Structure

```
pinnacle/
├── backend/               # Rust / Tauri backend
│   ├── src/
│   │   ├── application/   # Use-case commands (CQRS-style)
│   │   ├── core/          # Error handling, shared result types
│   │   ├── domain/        # Domain models (query, export, redis, etc.)
│   │   └── infrastructure/# DB connectors and external integrations
│   ├── Cargo.toml
│   └── tauri.conf.json
├── frontend/              # React + TypeScript frontend
│   ├── app/               # Routing, providers, theming
│   ├── features/          # Feature modules (sql, elasticsearch, redis, …)
│   └── assets/            # Static assets
├── docs/                  # Documentation & ADRs
├── tasks/                 # Task tracking & milestone templates
├── Makefile               # Unified dev/build commands
└── package.json
```

The project follows a **feature-sliced architecture** on the frontend and a **layered (domain-driven) architecture** on the backend. See [`docs/decisions/`](./docs/decisions/) for Architecture Decision Records.

## 🤝 Contributing

Pinnacle is an **open-source project** and contributions are welcome! Whether it's a bug report, a new feature idea, documentation improvement, or a pull request — every contribution matters.

### How to Contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```
3. **Make your changes** and commit them with clear messages
4. **Push** to your fork and open a **Pull Request**

Please make sure to:
- Run `make check` before submitting a PR
- Follow the existing code style and conventions
- Add tests where applicable
- Update documentation if needed

### Reporting Issues

Found a bug or have a suggestion? Please [open an issue](https://github.com/yourusername/pinnacle/issues) with:
- A clear description of the problem or idea
- Steps to reproduce (for bugs)
- Your environment details (OS, Node version, Rust version)

## 📄 License

This project is open source and available under the [MIT License](./LICENSE).

## 🙏 Acknowledgements

- [Tauri](https://tauri.app/) — for making lightweight, secure desktop apps possible
- [AG Grid](https://www.ag-grid.com/) — for powerful data grid components
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — for the in-app code editor
- [React Flow](https://reactflow.dev/) — for diagram and flow visualizations
- The entire open-source community that makes projects like this possible ❤️

---

<div align="center">

Made with ☕ by the Pinnacle contributors

**[⭐ Star this repo](https://github.com/yourusername/pinnacle)** if you find it useful!

</div>
