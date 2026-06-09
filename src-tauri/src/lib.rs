mod application;
mod core;
mod domain;
mod infrastructure;

use application::commands::query_commands::{execute_sql, test_connection};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![test_connection, execute_sql])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
