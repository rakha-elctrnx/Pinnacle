mod application;
mod core;
mod domain;
mod infrastructure;

use tauri::Manager;

// ELASTICSEARCH COMMANDS
use application::commands::elastic_commands::{
    elastic_create_index, elastic_delete_document, elastic_delete_index, elastic_execute_query,
    elastic_get_cluster_health, elastic_get_cluster_info, elastic_get_cluster_stats,
    elastic_get_index_mapping, elastic_get_index_settings, elastic_get_node_stats,
    elastic_get_nodes_info, elastic_index_document, elastic_list_aliases,
    elastic_list_indices, elastic_list_pipelines, elastic_list_shards,
    elastic_list_templates, elastic_open_index, elastic_close_index,
    elastic_refresh_index, elastic_search_documents,
    elastic_test_connection,
};
// SQL COMMANDS
use application::commands::query_commands::{
    commit_table_changes, disconnect_connection, execute_sql, get_connection_health,
    sql_begin_transaction, sql_commit_transaction, sql_drop_table, sql_execute_ddl,
    sql_execute_in_transaction, sql_generate_ddl, sql_get_all_columns,
    sql_get_all_foreign_keys, sql_get_table_schema, sql_rollback_transaction,
    test_connection,
};
// EXPORT COMMANDS
use application::commands::export_commands::{estimate_table_export, execute_table_export};

// REDIS COMMANDS
use application::commands::redis_commands::{
    redis_execute_command, redis_show_all_databases, redis_test_connection,
};

// CONNECTION COMMANDS
use application::commands::connection_commands::{
    delete_connection, get_connection, get_connection_password, get_key_passphrase,
    get_ssh_password, has_connection_password, list_connections, save_connection,
    update_connection,
};

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

            // Ensure child windows stay hidden on launch.
            // macOS may show child windows automatically when a parent is visible.
            if let Some(conn_window) = app.get_webview_window("new-connection") {
                let _ = conn_window.hide();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Raise new-connection above main whenever main is clicked/focused.
            if window.label() == "main" {
                if let tauri::WindowEvent::Focused(true) = event {
                    if let Some(child) = window.app_handle().get_webview_window("new-connection") {
                        if child.is_visible().unwrap_or(false) {
                            let _ = child.show();
                            let _ = child.set_focus();
                        }
                    }
                }
                // Drop all SQL connection pools when the main window is destroyed
                // (app quit). Pools are also dropped via `disconnect_connection`
                // when the user explicitly disconnects a single connection.
                if let tauri::WindowEvent::Destroyed = event {
                    tauri::async_runtime::block_on(async {
                        crate::infrastructure::connectors::pool::disconnect_all().await;
                    });
                }
            }
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // CONNECTION COMMANDS
            save_connection,
            list_connections,
            get_connection,
            get_connection_password,
            get_ssh_password,
            get_key_passphrase,
            has_connection_password,
            delete_connection,
            update_connection,
            // SQL COMMANDS
            test_connection,
            execute_sql,
            commit_table_changes,
            sql_get_table_schema,
            sql_generate_ddl,
            sql_execute_ddl,
            sql_drop_table,
            sql_begin_transaction,
            sql_execute_in_transaction,
            sql_commit_transaction,
            sql_rollback_transaction,
            disconnect_connection,
            get_connection_health,
            sql_get_all_foreign_keys,
            sql_get_all_columns,
            // ELASTICSEARCH COMMANDS
            elastic_test_connection,
            elastic_execute_query,
            elastic_get_cluster_info,
            elastic_get_cluster_health,
            elastic_get_cluster_stats,
            elastic_get_node_stats,
            elastic_list_indices,
            elastic_create_index,
            elastic_delete_index,
            elastic_get_index_mapping,
            elastic_get_index_settings,
            elastic_search_documents,
            elastic_index_document,
            elastic_delete_document,
            elastic_list_templates,
            elastic_list_pipelines,
            elastic_list_aliases,
            elastic_list_shards,
            elastic_get_nodes_info,
            elastic_open_index,
            elastic_close_index,
            elastic_refresh_index,
            // EXPORT COMMANDS
            estimate_table_export,
            execute_table_export,
            // REDIS COMMANDS
            redis_test_connection,
            redis_show_all_databases,
            redis_execute_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
