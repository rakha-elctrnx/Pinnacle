# Pinnacle - Project Structure

## 1) Complete Folder Structure

```text
pinnacle/
  docs/
    DATA_EXPLORER.md
    MVP_ROADMAP.md
    PROJECT_STRUCTURE.md
    SYSTEM_ARCHITECTURE.md
  src/
    app/
      providers.tsx
      router.tsx
    features/
      home/
        HomePage.tsx
      data-explorer/
        pages/
          DataExplorerPage.tsx
        components/
          ConnectionHeader.tsx
          ConnectionSidebar.tsx
          ConnectionWizardModal.tsx
          ContextMenu.tsx
          DetailsPanel.tsx
          db/
            sql/
              QueryEditor.tsx
              SqlExplorerWorkspace.tsx
              TableBrowser.tsx
        hooks/
          useExplorerData.ts
          useQueryExecution.ts
        constants.ts
        types.ts
        utils.ts
      settings/
        SettingsPage.tsx
    layouts/
      AppShell.tsx
    services/
      tauriClient.ts
    state/
      connectionStore.ts
    types/
      domain.ts
    App.tsx
    main.tsx
    index.css
  src-tauri/
    src/
      application/
        commands/
          query_commands.rs
      core/
        error.rs
        result.rs
      domain/
        query.rs
      infrastructure/
        connectors/
          sql.rs
      lib.rs
      main.rs
    Cargo.toml
    tauri.conf.json
  PROJECT.md
  package.json
  vite.config.ts
```

## Notes

- Frontend menggunakan feature-based layout agar modul Data Explorer bisa berkembang independen.
- Backend mengikuti layering sederhana yang siap dinaikkan ke Clean Architecture penuh:
  - application: command handlers
  - domain: models and contracts
  - infrastructure: sql connector implementation
  - core: app errors and result type