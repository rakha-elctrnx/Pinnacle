# Pinnacle - MVP Roadmap

## 9) MVP Implementation Roadmap

Phase A - Foundation (Done in this initialization)

- Project scaffold React + TS + Vite + Tauri v2
- Feature-based frontend structure
- Core routing and layout
- Zustand + TanStack Query setup
- Rust command scaffolding for DB operations

Phase B - Data Explorer MVP

- Connection Manager CRUD
- PostgreSQL SQL editor + execute + result table
- MySQL SQL editor + execute + result table
- Query history per connection
- CSV and JSON export

Phase C - Security and Hardening

- Stronghold encryption for credentials
- Optional master password
- Secure redaction in logs/error messages
- Input validation + consistent error envelope

Phase D - Quality

- Unit tests for parser logic
- Rust unit tests for command validation
- Integration test for DB connect/query flow
- Packaging for macOS/Windows/Linux

## 10) Development Milestones for Version 1.0

Milestone 1 - App Core (Week 1)

- Navigation
- Settings skeleton
- Command bridge baseline

Milestone 2 - Data Explorer MVP (Week 2-3)

- Connection manager
- PostgreSQL + MySQL query execution
- Result table + export CSV/JSON

Milestone 3 - Security + Stabilization (Week 4)

- Stronghold integration
- Master password
- Error and logging hardening
- Beta release candidate

Milestone 4 - Release 1.0 (Week 5)

- Cross-platform packaging
- Performance pass
- Documentation and onboarding
- Version 1.0 ship