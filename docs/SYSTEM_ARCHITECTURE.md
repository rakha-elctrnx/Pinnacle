# Pinnacle - System Architecture

## 2) Frontend Architecture

- React 19 + TypeScript + Vite
- React Router untuk navigasi utama
- Zustand untuk local UI/domain state
- TanStack Query untuk async state dari command backend
- Monaco + AG Grid siap diintegrasikan pada iterasi fitur SQL Editor dan Result Viewer

Flow:

1. UI event di page/component
2. Dispatch ke store (Zustand) untuk state lokal
3. Untuk operasi data/DB, panggil Tauri command via tauriClient
4. Tauri backend memproses koneksi/query
5. Response kembali ke frontend dan dirender

## 3) Backend Architecture

Rust backend dibagi menjadi:

- core: AppError + AppResult
- domain: payload/response model
- infrastructure: adapter SQL PostgreSQL/MySQL
- application: Tauri commands

Prinsip:

- bisnis koneksi/query di backend Rust
- frontend hanya representasi state/UI
- tidak ada logging kredensial di frontend

## 4) Database Connection Abstraction Layer

Abstraksi ada di:

- src-tauri/src/infrastructure/connectors/sql.rs

Interface behavior:

- test_connection(payload)
- execute_sql(payload, sql)

Strategy:

- switch berdasarkan driver (postgresql/mysql)
- build connect options per driver
- execute command async via sqlx

## 5) State Management Design

- connectionStore:
  - connection profiles
  - search
  - upsert/remove/toggle favorite

## 6) Routing Structure

Routes:

- / -> DataExplorerPage (default)
- /data-explorer -> DataExplorerPage
- /settings -> SettingsPage

Semua route masuk melalui AppShell (top navigation layout).

## 7) Component Hierarchy

- App
  - AppProviders
    - RouterProvider
      - AppShell
        - DataExplorerPage
        - SettingsPage

## 8) Tauri Command Design

Commands aktif:

- test_connection(payload)
  - validasi driver
  - uji koneksi PostgreSQL/MySQL
- execute_sql(payload)
  - eksekusi SQL (MVP scaffold saat ini fokus metadata rows_affected)

Planned commands (next iteration):

- save_connection_profile(profile)
- list_connection_profiles()
- delete_connection_profile(id)
- encrypt_secret(plain)
- decrypt_secret(ref)
- export_query_result_csv(result)
- export_query_result_json(result)

## Security Model Alignment

- Local-first: koneksi langsung dari mesin user
- No telemetry default (belum ditambahkan telemetry)
- Frontend tidak memproses enkripsi kredensial langsung
- Command design sudah menyiapkan jalur integrasi Stronghold