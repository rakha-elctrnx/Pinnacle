mod application;
mod core;
mod domain;
mod infrastructure;

// ELASTICSEARCH COMMANDS
use application::commands::elastic_commands::{
    elastic_create_index, elastic_delete_document, elastic_delete_index, elastic_execute_query,
    elastic_get_cluster_health, elastic_get_cluster_info, elastic_get_cluster_stats,
    elastic_get_index_mapping, elastic_get_index_settings, elastic_get_node_stats,
    elastic_get_nodes_info, elastic_index_document, elastic_list_aliases, elastic_list_indices,
    elastic_list_pipelines, elastic_list_shards, elastic_list_templates, elastic_search_documents,
    elastic_test_connection,
};
// SQL COMMANDS
use application::commands::query_commands::{
    execute_sql, sql_drop_table, sql_execute_ddl, sql_generate_ddl, sql_get_all_columns,
    sql_get_all_foreign_keys, sql_get_table_schema, test_connection,
};
// EXPORT COMMANDS
use application::commands::export_commands::{estimate_table_export, execute_table_export};

// REDIS COMMANDS
use application::commands::redis_commands::{
    redis_execute_command, redis_show_all_databases, redis_test_connection,
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
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            execute_sql,
            sql_get_table_schema,
            sql_generate_ddl,
            sql_execute_ddl,
            sql_drop_table,
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
