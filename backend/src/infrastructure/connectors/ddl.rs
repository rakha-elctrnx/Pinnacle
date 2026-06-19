//! DDL generation for PostgreSQL and MySQL table designer.
//!
//! Given a current (snapshot) schema and a pending (edited) schema, this module
//! produces an ordered list of DDL statements that transform the database to
//! match the pending state.  For CREATE TABLE flows `current` is `None`.

use std::collections::HashSet;

use crate::{
    core::{error::AppError, result::AppResult},
    domain::query::{
        DdlPlan, DdlStatement, ForeignKeyConstraint, IndexDefinition, TableColumn,
        TableSchemaInfo,
    },
};

// ── Identifier quoting ───────────────────────────────────────────

fn quote_pg(id: &str) -> String {
    format!("\"{}\"", id.replace('"', "\"\""))
}

fn quote_mysql(id: &str) -> String {
    format!("`{}`", id.replace('`', "``"))
}

fn quote_ident(driver: &str, id: &str) -> String {
    match driver {
        "mysql" => quote_mysql(id),
        _ => quote_pg(id),
    }
}

/// Fully-qualified table reference: `"schema"."table"` or `` `schema`.`table` ``.
fn qualified_table(driver: &str, schema: &str, table: &str) -> String {
    if schema.is_empty() {
        quote_ident(driver, table)
    } else {
        format!(
            "{}.{}",
            quote_ident(driver, schema),
            quote_ident(driver, table)
        )
    }
}

// ── Validation ───────────────────────────────────────────────────

fn validate_pending(pending: &TableSchemaInfo) -> AppResult<()> {
    if pending.table_name.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "table name must not be empty".to_string(),
        ));
    }
    if pending.columns.is_empty() {
        return Err(AppError::InvalidInput(
            "table must have at least one column".to_string(),
        ));
    }
    for col in &pending.columns {
        if col.name.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "column name must not be empty".to_string(),
            ));
        }
        if col.data_type.trim().is_empty() {
            return Err(AppError::InvalidInput(format!(
                "data type for column '{}' must not be empty",
                col.name
            )));
        }
    }
    for fk in &pending.foreign_keys {
        if fk.referenced_table.trim().is_empty() {
            return Err(AppError::InvalidInput(format!(
                "foreign key '{}' must reference a table",
                fk.name
            )));
        }
        if fk.columns.is_empty() || fk.referenced_columns.is_empty() {
            return Err(AppError::InvalidInput(format!(
                "foreign key '{}' must have columns and referenced columns",
                fk.name
            )));
        }
        if fk.columns.len() != fk.referenced_columns.len() {
            return Err(AppError::InvalidInput(format!(
                "foreign key '{}' column count mismatch",
                fk.name
            )));
        }
    }
    Ok(())
}

// ── Public entry point ───────────────────────────────────────────

/// Generate a `DdlPlan` that transforms `current` into `pending`.
///
/// When `current` is `None` a full CREATE TABLE is emitted.
pub fn generate_ddl(
    driver: &str,
    current: Option<&TableSchemaInfo>,
    pending: &TableSchemaInfo,
) -> AppResult<DdlPlan> {
    validate_pending(pending)?;

    match current {
        None => generate_create_table(driver, pending),
        Some(cur) => generate_alter_table(driver, cur, pending),
    }
}

// ── CREATE TABLE ─────────────────────────────────────────────────

fn generate_create_table(driver: &str, pending: &TableSchemaInfo) -> AppResult<DdlPlan> {
    let qt = |id: &str| quote_ident(driver, id);
    let fq = qualified_table(driver, &pending.schema, &pending.table_name);

    let mut stmts: Vec<DdlStatement> = Vec::new();
    let mut order: u32 = 0;
    let warnings: Vec<String> = Vec::new();

    // -- Column definitions
    let col_defs: Vec<String> = pending
        .columns
        .iter()
        .map(|c| column_definition(driver, c))
        .collect();

    let mut create_body = col_defs.join(",\n  ");

    // Inline primary key for CREATE TABLE
    if let Some(pk) = &pending.primary_key {
        let pk_cols: Vec<String> = pk.columns.iter().map(|c| qt(c)).collect();
        create_body.push_str(&format!(
            ",\n  CONSTRAINT {} PRIMARY KEY ({})",
            qt(&pk.name),
            pk_cols.join(", ")
        ));
    }

    let sql = format!("CREATE TABLE {} (\n  {}\n);", fq, create_body);
    order += 1;
    stmts.push(DdlStatement {
        order,
        sql,
        description: format!("Create table {}", pending.table_name),
        is_destructive: false,
    });

    // -- Unique constraints (as ALTER TABLE ADD CONSTRAINT)
    for uc in &pending.unique_constraints {
        order += 1;
        let cols: Vec<String> = uc.columns.iter().map(|c| qt(c)).collect();
        stmts.push(DdlStatement {
            order,
            sql: format!(
                "ALTER TABLE {} ADD CONSTRAINT {} UNIQUE ({});",
                fq,
                qt(&uc.name),
                cols.join(", ")
            ),
            description: format!("Add unique constraint {}", uc.name),
            is_destructive: false,
        });
    }

    // -- Indexes (skip those that back a unique constraint – already covered)
    let uc_names: HashSet<&str> = pending
        .unique_constraints
        .iter()
        .map(|u| u.name.as_str())
        .collect();
    for idx in &pending.indexes {
        if uc_names.contains(idx.name.as_str()) {
            continue;
        }
        order += 1;
        stmts.push(DdlStatement {
            order,
            sql: create_index_sql(driver, &pending.schema, &pending.table_name, idx),
            description: format!("Create index {}", idx.name),
            is_destructive: false,
        });
    }

    // -- Foreign keys (as ALTER TABLE ADD CONSTRAINT)
    for fk in &pending.foreign_keys {
        order += 1;
        stmts.push(DdlStatement {
            order,
            sql: add_foreign_key_sql(driver, &pending.schema, &pending.table_name, fk),
            description: format!("Add foreign key {}", fk.name),
            is_destructive: false,
        });
    }

    Ok(DdlPlan {
        statements: stmts,
        is_destructive: false,
        warnings,
    })
}

// ── ALTER TABLE (diff) ───────────────────────────────────────────

fn generate_alter_table(
    driver: &str,
    current: &TableSchemaInfo,
    pending: &TableSchemaInfo,
) -> AppResult<DdlPlan> {
    let fq = qualified_table(driver, &pending.schema, &pending.table_name);
    let qt = |id: &str| quote_ident(driver, id);

    let mut stmts: Vec<DdlStatement> = Vec::new();
    let mut order: u32 = 0;
    let mut warnings: Vec<String> = Vec::new();
    let mut is_destructive = false;

    let cur_col_map: std::collections::HashMap<&str, &TableColumn> =
        current.columns.iter().map(|c| (c.name.as_str(), c)).collect();
    let pend_col_map: std::collections::HashMap<&str, &TableColumn> =
        pending.columns.iter().map(|c| (c.name.as_str(), c)).collect();

    let cur_col_names: HashSet<&str> = cur_col_map.keys().copied().collect();
    let pend_col_names: HashSet<&str> = pend_col_map.keys().copied().collect();

    // ── 1. DROP FOREIGN KEY ──────────────────────────────────────
    let cur_fk_names: HashSet<&str> = current
        .foreign_keys
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    let pend_fk_names: HashSet<&str> = pending
        .foreign_keys
        .iter()
        .map(|f| f.name.as_str())
        .collect();
    for fk in &current.foreign_keys {
        if !pend_fk_names.contains(fk.name.as_str()) {
            order += 1;
            is_destructive = true;
            stmts.push(DdlStatement {
                order,
                sql: drop_constraint_sql(driver, &fq, &fk.name),
                description: format!("Drop foreign key {}", fk.name),
                is_destructive: true,
            });
        }
    }

    // ── 2. DROP INDEXES ──────────────────────────────────────────
    let cur_idx_names: HashSet<&str> = current.indexes.iter().map(|i| i.name.as_str()).collect();
    let pend_idx_names: HashSet<&str> = pending.indexes.iter().map(|i| i.name.as_str()).collect();
    for idx in &current.indexes {
        if !pend_idx_names.contains(idx.name.as_str()) {
            order += 1;
            stmts.push(DdlStatement {
                order,
                sql: drop_index_sql(driver, &pending.schema, &pending.table_name, &idx.name),
                description: format!("Drop index {}", idx.name),
                is_destructive: false,
            });
        }
    }

    // ── 3. DROP UNIQUE CONSTRAINTS ───────────────────────────────
    let cur_uc_names: HashSet<&str> = current
        .unique_constraints
        .iter()
        .map(|u| u.name.as_str())
        .collect();
    let pend_uc_names: HashSet<&str> = pending
        .unique_constraints
        .iter()
        .map(|u| u.name.as_str())
        .collect();
    for uc in &current.unique_constraints {
        if !pend_uc_names.contains(uc.name.as_str()) {
            order += 1;
            is_destructive = true;
            stmts.push(DdlStatement {
                order,
                sql: drop_constraint_sql(driver, &fq, &uc.name),
                description: format!("Drop unique constraint {}", uc.name),
                is_destructive: true,
            });
        }
    }

    // ── 4. DROP PRIMARY KEY ──────────────────────────────────────
    let pk_changed = match (&current.primary_key, &pending.primary_key) {
        (None, None) => false,
        (Some(_), None) => true,
        (None, Some(_)) => false, // will be added later
        (Some(a), Some(b)) => a.columns != b.columns || a.name != b.name,
    };
    if pk_changed && current.primary_key.is_some() {
        let pk = current.primary_key.as_ref().unwrap();
        order += 1;
        is_destructive = true;
        stmts.push(DdlStatement {
            order,
            sql: drop_pk_sql(driver, &fq, &pk.name),
            description: format!("Drop primary key {}", pk.name),
            is_destructive: true,
        });
    }

    // ── 5. DROP COLUMNS ──────────────────────────────────────────
    for col_name in cur_col_names.difference(&pend_col_names) {
        order += 1;
        is_destructive = true;
        warnings.push(format!("Dropping column '{}' may cause data loss", col_name));
        stmts.push(DdlStatement {
            order,
            sql: format!("ALTER TABLE {} DROP COLUMN {};", fq, qt(col_name)),
            description: format!("Drop column {}", col_name),
            is_destructive: true,
        });
    }

    // ── 6. ADD COLUMNS ───────────────────────────────────────────
    for col_name in pend_col_names.difference(&cur_col_names) {
        let col = pend_col_map.get(col_name).unwrap();
        order += 1;
        if !col.is_nullable && col.default_value.is_none() && !col.is_auto_increment {
            warnings.push(format!(
                "Adding NOT NULL column '{}' without a default to an existing table will fail if the table has rows",
                col_name
            ));
        }
        stmts.push(DdlStatement {
            order,
            sql: format!(
                "ALTER TABLE {} ADD COLUMN {};",
                fq,
                column_definition(driver, col)
            ),
            description: format!("Add column {}", col_name),
            is_destructive: false,
        });
    }

    // ── 7. MODIFY / ALTER COLUMNS ────────────────────────────────
    for col_name in pend_col_names.intersection(&cur_col_names) {
        let cur_col = cur_col_map.get(col_name).unwrap();
        let pend_col = pend_col_map.get(col_name).unwrap();
        if columns_differ(cur_col, pend_col) {
            order += 1;
            let col_sql = alter_column_sql(driver, &fq, cur_col, pend_col);
            let destructive = cur_col.data_type != pend_col.data_type
                || (cur_col.is_nullable && !pend_col.is_nullable);
            if destructive {
                is_destructive = true;
                warnings.push(format!(
                    "Modifying column '{}' may cause data loss or conversion errors",
                    col_name
                ));
            }
            stmts.push(DdlStatement {
                order,
                sql: col_sql,
                description: format!("Modify column {}", col_name),
                is_destructive: destructive,
            });
        }
    }

    // ── 8. ADD PRIMARY KEY ───────────────────────────────────────
    if pk_changed && pending.primary_key.is_some() {
        let pk = pending.primary_key.as_ref().unwrap();
        order += 1;
        let pk_cols: Vec<String> = pk.columns.iter().map(|c| qt(c)).collect();
        stmts.push(DdlStatement {
            order,
            sql: format!(
                "ALTER TABLE {} ADD CONSTRAINT {} PRIMARY KEY ({});",
                fq,
                qt(&pk.name),
                pk_cols.join(", ")
            ),
            description: format!("Add primary key {}", pk.name),
            is_destructive: false,
        });
    }

    // ── 9. ADD UNIQUE CONSTRAINTS ────────────────────────────────
    for uc in &pending.unique_constraints {
        if !cur_uc_names.contains(uc.name.as_str()) {
            order += 1;
            let cols: Vec<String> = uc.columns.iter().map(|c| qt(c)).collect();
            stmts.push(DdlStatement {
                order,
                sql: format!(
                    "ALTER TABLE {} ADD CONSTRAINT {} UNIQUE ({});",
                    fq,
                    qt(&uc.name),
                    cols.join(", ")
                ),
                description: format!("Add unique constraint {}", uc.name),
                is_destructive: false,
            });
        }
    }

    // ── 10. CREATE INDEXES ───────────────────────────────────────
    for idx in &pending.indexes {
        if !cur_idx_names.contains(idx.name.as_str()) {
            order += 1;
            stmts.push(DdlStatement {
                order,
                sql: create_index_sql(driver, &pending.schema, &pending.table_name, idx),
                description: format!("Create index {}", idx.name),
                is_destructive: false,
            });
        }
    }

    // ── 11. ADD FOREIGN KEYS ─────────────────────────────────────
    for fk in &pending.foreign_keys {
        if !cur_fk_names.contains(fk.name.as_str()) {
            order += 1;
            stmts.push(DdlStatement {
                order,
                sql: add_foreign_key_sql(driver, &pending.schema, &pending.table_name, fk),
                description: format!("Add foreign key {}", fk.name),
                is_destructive: false,
            });
        }
    }

    Ok(DdlPlan {
        statements: stmts,
        is_destructive,
        warnings,
    })
}

// ── SQL fragment helpers ─────────────────────────────────────────

/// Column definition fragment for CREATE TABLE / ADD COLUMN.
fn column_definition(driver: &str, col: &TableColumn) -> String {
    let qt = |id: &str| quote_ident(driver, id);
    let mut parts = vec![qt(&col.name), col.data_type.clone()];

    if !col.is_nullable {
        parts.push("NOT NULL".to_string());
    }
    if let Some(def) = &col.default_value {
        parts.push(format!("DEFAULT {}", def));
    }
    if col.is_auto_increment {
        match driver {
            "mysql" => {
                parts.push("AUTO_INCREMENT".to_string());
            }
            _ => {
                // PostgreSQL: replace type with serial variant if type is integer/bigint
                let lower = col.data_type.to_lowercase();
                if lower == "integer" || lower == "int" || lower == "int4" {
                    // Already added data_type; swap it for serial
                    parts[1] = "SERIAL".to_string();
                    // Remove NOT NULL – SERIAL implies NOT NULL
                    parts.retain(|p| p != "NOT NULL");
                } else if lower == "bigint" || lower == "int8" {
                    parts[1] = "BIGSERIAL".to_string();
                    parts.retain(|p| p != "NOT NULL");
                }
            }
        }
    }
    parts.join(" ")
}

/// Check whether two column definitions differ in a way that requires ALTER.
fn columns_differ(a: &TableColumn, b: &TableColumn) -> bool {
    a.data_type != b.data_type
        || a.is_nullable != b.is_nullable
        || a.default_value != b.default_value
        || a.is_auto_increment != b.is_auto_increment
}

/// Generate ALTER COLUMN SQL depending on driver.
fn alter_column_sql(
    driver: &str,
    fq_table: &str,
    _current: &TableColumn,
    pending: &TableColumn,
) -> String {
    let qt = |id: &str| quote_ident(driver, id);
    match driver {
        "mysql" => {
            // MySQL supports full ALTER COLUMN in one statement
            let mut parts = vec![qt(&pending.name), pending.data_type.clone()];
            if !pending.is_nullable {
                parts.push("NOT NULL".to_string());
            }
            if let Some(def) = &pending.default_value {
                parts.push(format!("DEFAULT {}", def));
            }
            if pending.is_auto_increment {
                parts.push("AUTO_INCREMENT".to_string());
            }
            format!(
                "ALTER TABLE {} MODIFY COLUMN {};",
                fq_table,
                parts.join(" ")
            )
        }
        _ => {
            // PostgreSQL: need separate statements for type, nullability, default.
            // We combine into one ALTER TABLE with multiple sub-clauses.
            let mut clauses: Vec<String> = Vec::new();

            clauses.push(format!(
                "ALTER COLUMN {} SET DATA TYPE {}",
                qt(&pending.name),
                pending.data_type
            ));

            if pending.is_nullable {
                clauses.push(format!("ALTER COLUMN {} DROP NOT NULL", qt(&pending.name)));
            } else {
                clauses.push(format!("ALTER COLUMN {} SET NOT NULL", qt(&pending.name)));
            }

            match &pending.default_value {
                Some(def) => {
                    clauses.push(format!(
                        "ALTER COLUMN {} SET DEFAULT {}",
                        qt(&pending.name),
                        def
                    ));
                }
                None => {
                    clauses.push(format!("ALTER COLUMN {} DROP DEFAULT", qt(&pending.name)));
                }
            }

            format!("ALTER TABLE {} {};", fq_table, clauses.join(", "))
        }
    }
}

fn drop_constraint_sql(driver: &str, fq_table: &str, constraint_name: &str) -> String {
    match driver {
        "mysql" => {
            format!(
                "ALTER TABLE {} DROP CONSTRAINT {};",
                fq_table,
                quote_mysql(constraint_name)
            )
        }
        _ => {
            format!(
                "ALTER TABLE {} DROP CONSTRAINT {};",
                fq_table,
                quote_pg(constraint_name)
            )
        }
    }
}

fn drop_pk_sql(driver: &str, fq_table: &str, pk_name: &str) -> String {
    match driver {
        "mysql" => {
            // MySQL: PRIMARY KEY has no named constraint to drop
            format!("ALTER TABLE {} DROP PRIMARY KEY;", fq_table)
        }
        _ => {
            format!(
                "ALTER TABLE {} DROP CONSTRAINT {};",
                fq_table,
                quote_pg(pk_name)
            )
        }
    }
}

fn drop_index_sql(driver: &str, schema: &str, table: &str, index_name: &str) -> String {
    match driver {
        "mysql" => {
            format!(
                "DROP INDEX {} ON {};",
                quote_mysql(index_name),
                qualified_table(driver, schema, table)
            )
        }
        _ => {
            // PostgreSQL: index lives in schema namespace; qualify if schema present
            if schema.is_empty() {
                format!("DROP INDEX {};", quote_pg(index_name))
            } else {
                format!(
                    "DROP INDEX {}.{};",
                    quote_pg(schema),
                    quote_pg(index_name)
                )
            }
        }
    }
}

fn create_index_sql(
    driver: &str,
    schema: &str,
    table: &str,
    idx: &IndexDefinition,
) -> String {
    let qt = |id: &str| quote_ident(driver, id);
    let cols: Vec<String> = idx.columns.iter().map(|c| qt(c)).collect();
    let unique = if idx.is_unique { "UNIQUE " } else { "" };

    match driver {
        "mysql" => {
            format!(
                "CREATE {}INDEX {} ON {} ({});",
                unique,
                qt(&idx.name),
                qualified_table(driver, schema, table),
                cols.join(", ")
            )
        }
        _ => {
            let using = if idx.index_type.is_empty() || idx.index_type == "btree" {
                String::new()
            } else {
                format!("USING {} ", idx.index_type)
            };
            format!(
                "CREATE {}INDEX {} ON {} {}({});",
                unique,
                qt(&idx.name),
                qualified_table(driver, schema, table),
                using,
                cols.join(", ")
            )
        }
    }
}

fn add_foreign_key_sql(
    driver: &str,
    schema: &str,
    table: &str,
    fk: &ForeignKeyConstraint,
) -> String {
    let qt = |id: &str| quote_ident(driver, id);
    let cols: Vec<String> = fk.columns.iter().map(|c| qt(c)).collect();
    let ref_cols: Vec<String> = fk.referenced_columns.iter().map(|c| qt(c)).collect();
    let ref_table = qualified_table(driver, &fk.referenced_schema, &fk.referenced_table);

    format!(
        "ALTER TABLE {} ADD CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({}) ON UPDATE {} ON DELETE {};",
        qualified_table(driver, schema, table),
        qt(&fk.name),
        cols.join(", "),
        ref_table,
        ref_cols.join(", "),
        fk.on_update,
        fk.on_delete,
    )
}

// ── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::query::{PrimaryKeyConstraint, UniqueConstraint};

    fn sample_column(name: &str, dtype: &str, nullable: bool) -> TableColumn {
        TableColumn {
            name: name.to_string(),
            data_type: dtype.to_string(),
            is_nullable: nullable,
            default_value: None,
            is_auto_increment: false,
            comment: None,
        }
    }

    fn sample_pending() -> TableSchemaInfo {
        TableSchemaInfo {
            table_name: "users".to_string(),
            schema: "public".to_string(),
            columns: vec![
                sample_column("id", "INTEGER", false),
                sample_column("name", "VARCHAR(255)", false),
                sample_column("email", "VARCHAR(255)", true),
            ],
            primary_key: Some(PrimaryKeyConstraint {
                name: "pk_users".to_string(),
                columns: vec!["id".to_string()],
            }),
            unique_constraints: vec![UniqueConstraint {
                name: "uq_users_email".to_string(),
                columns: vec!["email".to_string()],
            }],
            foreign_keys: vec![],
            indexes: vec![IndexDefinition {
                name: "idx_users_name".to_string(),
                columns: vec!["name".to_string()],
                is_unique: false,
                index_type: "btree".to_string(),
            }],
        }
    }

    #[test]
    fn create_table_pg() {
        let pending = sample_pending();
        let plan = generate_ddl("postgresql", None, &pending).unwrap();
        assert!(!plan.statements.is_empty());
        assert!(plan.statements[0].sql.contains("CREATE TABLE"));
        assert!(plan.statements[0].sql.contains("\"users\""));
        assert!(plan.statements[0].sql.contains("PRIMARY KEY"));
        // Should have: CREATE TABLE, ADD UNIQUE, CREATE INDEX
        assert!(plan.statements.len() >= 2);
    }

    #[test]
    fn create_table_mysql() {
        let pending = sample_pending();
        let plan = generate_ddl("mysql", None, &pending).unwrap();
        assert!(!plan.statements.is_empty());
        assert!(plan.statements[0].sql.contains("CREATE TABLE"));
        assert!(plan.statements[0].sql.contains("`users`"));
    }

    #[test]
    fn alter_table_add_drop_column() {
        let current = sample_pending();
        let mut pending = sample_pending();
        // Remove "email", add "age"
        pending.columns.retain(|c| c.name != "email");
        pending.columns.push(sample_column("age", "INTEGER", true));
        pending.unique_constraints.clear();

        let plan = generate_ddl("postgresql", Some(&current), &pending).unwrap();
        let sqls: Vec<&str> = plan.statements.iter().map(|s| s.sql.as_str()).collect();

        // Should contain DROP COLUMN and ADD COLUMN
        assert!(sqls.iter().any(|s| s.contains("DROP COLUMN")));
        assert!(sqls.iter().any(|s| s.contains("ADD COLUMN")));
    }

    #[test]
    fn alter_table_ordering() {
        let current = sample_pending();
        let mut pending = sample_pending();
        pending.columns.push(sample_column("age", "INTEGER", true));
        pending.indexes.clear(); // drop existing index

        let plan = generate_ddl("postgresql", Some(&current), &pending).unwrap();

        // DROP INDEX should come before ADD COLUMN
        let drop_idx_pos = plan
            .statements
            .iter()
            .position(|s| s.sql.contains("DROP INDEX"));
        let add_col_pos = plan
            .statements
            .iter()
            .position(|s| s.sql.contains("ADD COLUMN"));

        if let (Some(di), Some(ac)) = (drop_idx_pos, add_col_pos) {
            assert!(di < ac, "DROP INDEX must come before ADD COLUMN");
        }
    }

    #[test]
    fn empty_table_name_rejected() {
        let mut pending = sample_pending();
        pending.table_name = "".to_string();
        assert!(generate_ddl("postgresql", None, &pending).is_err());
    }

    #[test]
    fn empty_columns_rejected() {
        let mut pending = sample_pending();
        pending.columns.clear();
        assert!(generate_ddl("postgresql", None, &pending).is_err());
    }

    #[test]
    fn mysql_drop_primary_key() {
        let current = sample_pending();
        let mut pending = sample_pending();
        pending.primary_key = None;

        let plan = generate_ddl("mysql", Some(&current), &pending).unwrap();
        let has_drop_pk = plan
            .statements
            .iter()
            .any(|s| s.sql.contains("DROP PRIMARY KEY"));
        assert!(has_drop_pk, "MySQL should use DROP PRIMARY KEY");
    }

    #[test]
    fn pg_drop_primary_key_by_name() {
        let current = sample_pending();
        let mut pending = sample_pending();
        pending.primary_key = None;

        let plan = generate_ddl("postgresql", Some(&current), &pending).unwrap();
        let has_drop_pk = plan
            .statements
            .iter()
            .any(|s| s.sql.contains("DROP CONSTRAINT") && s.sql.contains("pk_users"));
        assert!(
            has_drop_pk,
            "PostgreSQL should use DROP CONSTRAINT for PK"
        );
    }

    #[test]
    fn warnings_on_destructive_changes() {
        let current = sample_pending();
        let mut pending = sample_pending();
        pending.columns.clear();
        pending.columns.push(sample_column("id", "INTEGER", false));

        let plan = generate_ddl("postgresql", Some(&current), &pending).unwrap();
        assert!(
            plan.is_destructive,
            "Dropping columns should mark plan as destructive"
        );
        assert!(
            !plan.warnings.is_empty(),
            "Should have warnings about data loss"
        );
    }
}
