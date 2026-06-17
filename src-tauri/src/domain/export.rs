//! Domain types for SQL table data export.
//!
//! These structs model the export lifecycle: request payload, format-specific
//! options, preflight estimates, and the final result returned to the frontend.

use serde::{Deserialize, Serialize};

// ── Format ───────────────────────────────────────────────────────

/// Supported export formats for SQL table data.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TableExportFormat {
    Txt,
    Csv,
    Json,
    Sql,
    Xlsx,
}

impl TableExportFormat {
    /// Canonical lowercase extension for filenames.
    #[allow(dead_code)]
    pub fn extension(&self) -> &'static str {
        match self {
            Self::Txt => "txt",
            Self::Csv => "csv",
            Self::Json => "json",
            Self::Sql => "sql",
            Self::Xlsx => "xlsx",
        }
    }
}

impl std::fmt::Display for TableExportFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Txt => write!(f, "TXT"),
            Self::Csv => write!(f, "CSV"),
            Self::Json => write!(f, "JSON"),
            Self::Sql => write!(f, "SQL"),
            Self::Xlsx => write!(f, "XLSX"),
        }
    }
}

// ── SQL mode ─────────────────────────────────────────────────────

/// SQL export mode.  v1 only supports `DataOnly` (INSERT statements).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SqlExportMode {
    DataOnly,
    SchemaOnly,
    SchemaAndData,
}

impl Default for SqlExportMode {
    fn default() -> Self {
        Self::DataOnly
    }
}

// ── Text encoding ────────────────────────────────────────────────

/// Encoding hint for text-based formats.  v1 always writes UTF-8 but the
/// frontend can pass this value so the option is recorded for future use.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TextEncoding {
    Utf8,
    Utf16,
    Ascii,
}

impl Default for TextEncoding {
    fn default() -> Self {
        Self::Utf8
    }
}

// ── Export options ───────────────────────────────────────────────

/// Format-specific options the caller can pass alongside the format choice.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableExportOptions {
    /// Include column headers in text/CSV output (default true).
    #[serde(default = "default_true")]
    pub include_headers: bool,

    /// Delimiter for TXT format (default: `\t` for tab-delimited).
    #[serde(default)]
    pub delimiter: Option<String>,

    /// Text encoding hint (default UTF-8).
    #[serde(default)]
    pub encoding: TextEncoding,

    /// SQL export mode (default DataOnly → INSERT statements).
    #[serde(default)]
    pub sql_mode: SqlExportMode,
}

fn default_true() -> bool {
    true
}

impl Default for TableExportOptions {
    fn default() -> Self {
        Self {
            include_headers: true,
            delimiter: None,
            encoding: TextEncoding::Utf8,
            sql_mode: SqlExportMode::DataOnly,
        }
    }
}

// ── Export payload ───────────────────────────────────────────────

/// Request payload for executing a table export.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableExportPayload {
    /// Database connection details.
    pub connection: crate::domain::query::ConnectionPayload,

    /// Fully-qualified target table info.
    pub table_name: String,

    /// Target format.
    pub format: TableExportFormat,

    /// Format-specific options.
    #[serde(default)]
    pub options: TableExportOptions,

    /// Absolute path for the output file (from native save dialog).
    pub save_path: String,
}

// ── Preflight estimate ───────────────────────────────────────────

/// Row-count and size estimate returned by the preflight command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableExportEstimate {
    /// Estimated or exact row count.
    pub row_count: u64,

    /// Estimated file size in bytes (rough heuristic).
    pub estimated_size_bytes: u64,

    /// Whether the estimate suggests a large export that should run in the
    /// background.
    pub is_large: bool,
}

// ── Export result ────────────────────────────────────────────────

/// Outcome returned after an export completes (foreground or background).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableExportResult {
    /// Whether the export succeeded.
    pub success: bool,

    /// Absolute path to the written file (on success).
    pub file_path: Option<String>,

    /// Total rows written.
    pub row_count: u64,

    /// Wall-clock elapsed milliseconds.
    pub elapsed_ms: u128,

    /// Whether the export ran in the background.
    pub background: bool,

    /// Error message on failure.
    pub error: Option<String>,
}

// ── Progress event (emitted via Tauri during background export) ──

/// Progress payload emitted as a Tauri event during background export.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TableExportProgress {
    /// Current rows exported so far.
    pub rows_exported: u64,

    /// Total estimated rows (0 if unknown).
    pub total_rows: u64,

    /// Whether the export is complete.
    pub done: bool,

    /// Error message if the export failed mid-stream.
    pub error: Option<String>,
}
