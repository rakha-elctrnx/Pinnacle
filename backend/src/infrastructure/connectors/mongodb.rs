//! MongoDB connector — driver integration, client caching, BSON wire conversions,
//! collection metadata, document CRUD, aggregation, sampling, indexes, validation, and exports.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::LazyLock;
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use mongodb::bson::{doc, Bson, Document};
use mongodb::options::{
    ClientOptions, Collation, Credential, IndexOptions, SelectionCriteria, ServerAddress,
    TimeseriesGranularity, TimeseriesOptions, Tls, TlsOptions,
};
use mongodb::Client;
use tokio::sync::Mutex;
use crate::core::error::{sanitize_mongo_error, AppError};
use crate::core::result::AppResult;
use crate::domain::mongodb::*;
use crate::domain::query::ConnectionPayload;
use crate::infrastructure::connectors::ssh::TunnelHandle;
// ── Client Cache ───────────────────────────────────────────────────

struct CachedClient {
    client: Client,
    fingerprint: String,
    _tunnel: Option<TunnelHandle>,
}

struct ClientRegistry {
    inner: Mutex<HashMap<String, CachedClient>>,
}

static CLIENT_REGISTRY: LazyLock<ClientRegistry> = LazyLock::new(|| ClientRegistry {
    inner: Mutex::new(HashMap::new()),
});

/// Evict a cached client when connection options change or on explicit disconnect.
pub async fn evict_client(connection_id: &str) {
    let mut guard = CLIENT_REGISTRY.inner.lock().await;
    guard.remove(connection_id);
}

/// Evict all cached clients (app shutdown).
pub async fn evict_all_clients() {
    let mut guard = CLIENT_REGISTRY.inner.lock().await;
    guard.clear();
}

// ── ExtJSON Conversion Helpers ─────────────────────────────────────

/// Parse a `serde_json::Value` (Canonical or Relaxed Extended JSON v2) into `bson::Bson`.
pub fn parse_extjson_value(value: serde_json::Value) -> AppResult<Bson> {
    Bson::try_from(value).map_err(|err| {
        AppError::InvalidInput(format!("Invalid Extended JSON value: {}", err))
    })
}

/// Parse Extended JSON into a `bson::Document`.
pub fn document_from_extjson(value: serde_json::Value) -> AppResult<Document> {
    let bson = parse_extjson_value(value)?;
    match bson {
        Bson::Document(doc) => Ok(doc),
        _ => Err(AppError::InvalidInput(
            "Expected Extended JSON object representing a document".to_string(),
        )),
    }
}

/// Convert a `bson::Document` into Canonical Extended JSON `serde_json::Value`.
pub fn to_canonical_extjson(document: &Document) -> serde_json::Value {
    Bson::Document(document.clone()).into_canonical_extjson()
}

/// Convert a `bson::Document` into Relaxed Extended JSON `serde_json::Value`.
pub fn to_relaxed_extjson(document: &Document) -> serde_json::Value {
    Bson::Document(document.clone()).into_relaxed_extjson()
}

// ── URI & Options Resolution ────────────────────────────────────────

fn compute_fingerprint(opts: &MongoConnectionOptions, user: &str, db: &str, ssl: bool) -> String {
    format!(
        "{:?}:{:?}:{:?}:{:?}:{:?}:{:?}:{}:{}:{}",
        opts.scheme,
        opts.hosts,
        opts.auth_source,
        opts.replica_set,
        opts.read_preference,
        opts.tls,
        user,
        db,
        ssl
    )
}

/// Parse a raw `mongodb://` or `mongodb+srv://` URI string and return sanitized `MongoParsedUri`.
pub async fn parse_connection_uri(
    uri: &str,
    explicit_user: Option<&str>,
    explicit_pass: Option<&str>,
) -> AppResult<MongoParsedUri> {
    let raw_uri = uri.trim();
    if raw_uri.is_empty() {
        return Err(AppError::InvalidInput("Connection URI is empty".to_string()));
    }

    let parsed_opts = ClientOptions::parse(raw_uri).await.map_err(|err| {
        AppError::InvalidInput(format!("Invalid MongoDB connection URI: {}", err))
    })?;

    let is_srv = raw_uri.starts_with("mongodb+srv://");
    let scheme = if is_srv {
        MongoScheme::Srv
    } else {
        MongoScheme::Standard
    };

    let mut hosts = Vec::new();
    for addr in &parsed_opts.hosts {
        match addr {
            ServerAddress::Tcp { host, port } => {
                if is_srv {
                    hosts.push(host.clone());
                } else {
                    let p = port.unwrap_or(27017);
                    hosts.push(format!("{}:{}", host, p));
                }
            }
            #[cfg(unix)]
            ServerAddress::Unix { path } => {
                hosts.push(path.to_string_lossy().to_string());
            }
            _ => {}
        }
    }

    let has_uri_password = parsed_opts
        .credential
        .as_ref()
        .and_then(|c| c.password.as_ref())
        .is_some_and(|p| !p.is_empty());

    let username = explicit_user
        .filter(|u| !u.is_empty())
        .or_else(|| {
            parsed_opts
                .credential
                .as_ref()
                .and_then(|c| c.username.as_ref())
                .map(|s| s.as_str())
        })
        .unwrap_or("")
        .to_string();

    let database = parsed_opts.default_database.clone().unwrap_or_default();

    let auth_source = parsed_opts
        .credential
        .as_ref()
        .and_then(|c| c.source.clone());

    let replica_set = parsed_opts.repl_set_name.clone();

    let read_preference = match &parsed_opts.selection_criteria {
        Some(SelectionCriteria::ReadPreference(rp)) => match rp {
            mongodb::options::ReadPreference::Primary => MongoReadPreference::Primary,
            mongodb::options::ReadPreference::PrimaryPreferred { .. } => {
                MongoReadPreference::PrimaryPreferred
            }
            mongodb::options::ReadPreference::Secondary { .. } => MongoReadPreference::Secondary,
            mongodb::options::ReadPreference::SecondaryPreferred { .. } => {
                MongoReadPreference::SecondaryPreferred
            }
            mongodb::options::ReadPreference::Nearest { .. } => MongoReadPreference::Nearest,
            _ => MongoReadPreference::Primary,
        },
        _ => MongoReadPreference::Primary,
    };

    let direct_connection = parsed_opts.direct_connection;
    let tls = match &parsed_opts.tls {
        Some(Tls::Enabled(_)) => Some(true),
        Some(Tls::Disabled) => Some(false),
        None => None,
    };

    let display_host = if let Some(first) = hosts.first() {
        if is_srv {
            first.clone()
        } else {
            first.split(':').next().unwrap_or(first).to_string()
        }
    } else {
        "localhost".to_string()
    };

    let display_port = if is_srv {
        27017
    } else if let Some(first) = hosts.first() {
        first
            .split(':')
            .nth(1)
            .and_then(|p| p.parse::<u16>().ok())
            .unwrap_or(27017)
    } else {
        27017
    };

    let mut warnings = Vec::new();
    if is_srv && direct_connection == Some(true) {
        warnings.push("directConnection is ignored for mongodb+srv URIs.".to_string());
    }

    // Suppress unused warning for explicit_pass (consumed in command layer)
    let _ = explicit_pass;

    Ok(MongoParsedUri {
        mongo_config: MongoConnectionOptions {
            scheme,
            hosts,
            auth_source,
            replica_set,
            read_preference,
            direct_connection,
            tls,
            tls_ca_file: None,
            app_name: MONGO_APP_NAME.to_string(),
        },
        host: display_host,
        port: display_port,
        database,
        username,
        has_uri_password,
        warnings,
    })
}

/// Resolve `ClientOptions` and optional SSH tunnel from a `ConnectionPayload`.
pub fn parse_uri_sync(uri: &str) -> AppResult<MongoParsedUri> {
    tokio::task::block_in_place(|| {
        tokio::runtime::Handle::current().block_on(parse_connection_uri(uri, None, None))
    })
}
async fn build_client_options(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<(ClientOptions, Option<TunnelHandle>, String)> {
    let mongo_opts = payload.mongo_config.clone().unwrap_or_else(|| {
        let scheme = if payload.host.starts_with("mongodb+srv://") {
            MongoScheme::Srv
        } else {
            MongoScheme::Standard
        };
        MongoConnectionOptions {
            scheme,
            hosts: vec![format!("{}:{}", payload.host, payload.port)],
            auth_source: None,
            replica_set: None,
            read_preference: MongoReadPreference::Primary,
            direct_connection: None,
            tls: if payload.ssl { Some(true) } else { None },
            tls_ca_file: None,
            app_name: MONGO_APP_NAME.to_string(),
        }
    });

    let fingerprint = compute_fingerprint(
        &mongo_opts,
        &payload.username,
        &payload.database,
        payload.ssl,
    );

    // SSH validation & setup
    let (connect_hosts, tunnel) = if let Some(ssh) = &payload.ssh {
        if mongo_opts.scheme == MongoScheme::Srv {
            return Err(AppError::InvalidInput(
                "SSH tunneling is not supported for mongodb+srv connections.".to_string(),
            ));
        }
        if mongo_opts.hosts.len() > 1 {
            return Err(AppError::InvalidInput(
                "SSH tunneling is only supported for single-host MongoDB connections.".to_string(),
            ));
        }

        let target_host = &payload.host;
        let target_port = payload.port;

        let live_tunnel = super::ssh::open_tunnel(
            ssh,
            target_host,
            target_port,
            ssh_password,
            key_passphrase,
        )
        .await?;

        let fwd_host = live_tunnel.local_host().to_string();
        let fwd_port = live_tunnel.local_port();
        (vec![format!("{}:{}", fwd_host, fwd_port)], Some(live_tunnel))
    } else {
        (mongo_opts.hosts.clone(), None)
    };

    let mut client_opts = ClientOptions::default();

    // Hosts
    if mongo_opts.scheme == MongoScheme::Srv {
        let srv_host = connect_hosts
            .first()
            .cloned()
            .unwrap_or_else(|| payload.host.clone());
        let uri_str = format!("mongodb+srv://{}", srv_host);
        client_opts = ClientOptions::parse(&uri_str)
            .await
            .map_err(|e| AppError::InvalidInput(format!("Failed to parse SRV host: {}", e)))?;
    } else {
        let mut addrs = Vec::new();
        for h in &connect_hosts {
            let parts: Vec<&str> = h.split(':').collect();
            let host = parts[0].to_string();
            let port = parts.get(1).and_then(|p| p.parse::<u16>().ok());
            addrs.push(ServerAddress::Tcp { host, port });
        }
        client_opts.hosts = addrs;
    }

    client_opts.app_name = Some(MONGO_APP_NAME.to_string());
    client_opts.connect_timeout = Some(Duration::from_secs(10));
    client_opts.server_selection_timeout = Some(Duration::from_secs(10));

    // Credentials
    if !payload.username.is_empty() || !payload.password.is_empty() {
        let auth_src = mongo_opts
            .auth_source
            .filter(|s| !s.is_empty())
            .or_else(|| {
                if !payload.database.is_empty() {
                    Some(payload.database.clone())
                } else {
                    Some("admin".to_string())
                }
            });

        client_opts.credential = Some(
            Credential::builder()
                .username(payload.username.clone())
                .password(payload.password.clone())
                .source(auth_src)
                .build(),
        );
    }
    // Replica set
    if let Some(rs) = mongo_opts.replica_set.filter(|s| !s.is_empty()) {
        client_opts.repl_set_name = Some(rs);
    }

    // Direct connection
    if mongo_opts.scheme != MongoScheme::Srv {
        client_opts.direct_connection = mongo_opts.direct_connection;
    }

    // Read preference
    let rp_mode = match mongo_opts.read_preference {
        MongoReadPreference::Primary => mongodb::options::ReadPreference::Primary,
        MongoReadPreference::PrimaryPreferred => {
            mongodb::options::ReadPreference::PrimaryPreferred { options: None }
        }
        MongoReadPreference::Secondary => {
            mongodb::options::ReadPreference::Secondary { options: None }
        }
        MongoReadPreference::SecondaryPreferred => {
            mongodb::options::ReadPreference::SecondaryPreferred { options: None }
        }
        MongoReadPreference::Nearest => {
            mongodb::options::ReadPreference::Nearest { options: None }
        }
    };
    client_opts.selection_criteria = Some(SelectionCriteria::ReadPreference(rp_mode));

    // TLS
    let enable_tls = mongo_opts
        .tls
        .unwrap_or(mongo_opts.scheme == MongoScheme::Srv || payload.ssl);
    if enable_tls {
        let mut tls_opts = TlsOptions::default();
        if let Some(ca_path) = mongo_opts.tls_ca_file.filter(|s| !s.is_empty()) {
            tls_opts.ca_file_path = Some(std::path::PathBuf::from(ca_path));
        }
        client_opts.tls = Some(Tls::Enabled(tls_opts));
    } else {
        client_opts.tls = Some(Tls::Disabled);
    }

    Ok((client_opts, tunnel, fingerprint))
}

/// Get or build a cached `mongodb::Client` for the payload.
pub async fn get_client(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<Client> {
    if let Some(id) = &payload.connection_id {
        let guard = CLIENT_REGISTRY.inner.lock().await;
        if let Some(entry) = guard.get(id) {
            return Ok(entry.client.clone());
        }
    }

    let (client_opts, tunnel, fingerprint) =
        build_client_options(payload, ssh_password, key_passphrase).await?;
    let client = Client::with_options(client_opts)?;

    if let Some(id) = &payload.connection_id {
        let mut guard = CLIENT_REGISTRY.inner.lock().await;
        guard.insert(
            id.clone(),
            CachedClient {
                client: client.clone(),
                fingerprint,
                _tunnel: tunnel,
            },
        );
    }

    Ok(client)
}

fn target_db_name(payload: &ConnectionPayload, explicit_db: &str) -> String {
    if !explicit_db.is_empty() {
        explicit_db.to_string()
    } else if !payload.database.is_empty() {
        payload.database.clone()
    } else {
        "admin".to_string()
    }
}

// ── Operations ─────────────────────────────────────────────────────

pub async fn test_connection(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoTestConnectionResult> {
    let client = get_client(payload, ssh_password, key_passphrase).await?;
    let db_name = target_db_name(payload, "");
    let db = client.database(&db_name);

    let start = Instant::now();
    let ping_res = db.run_command(doc! { "ping": 1 }).await;

    match ping_res {
        Ok(_) => {
            let build_info = db.run_command(doc! { "buildInfo": 1 }).await.ok();
            let server_version = build_info
                .as_ref()
                .and_then(|doc| doc.get_str("version").ok())
                .map(|s| s.to_string());

            let is_master = db.run_command(doc! { "isMaster": 1 }).await.ok();
            let topology = is_master.as_ref().map(|doc| {
                if doc.contains_key("setName") {
                    "ReplicaSet".to_string()
                } else if doc.get_str("msg").ok() == Some("isdbgrid") {
                    "Sharded".to_string()
                } else {
                    "Single".to_string()
                }
            });

            Ok(MongoTestConnectionResult {
                ok: true,
                message: format!("Successfully connected in {}ms", start.elapsed().as_millis()),
                server_version,
                topology,
            })
        }
        Err(err) => {
            let norm = sanitize_mongo_error(&err);
            Ok(MongoTestConnectionResult {
                ok: false,
                message: norm.message,
                server_version: None,
                topology: None,
            })
        }
    }
}

pub async fn list_databases(
    payload: &ConnectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<Vec<MongoDatabaseInfo>> {
    let client = get_client(payload, ssh_password, key_passphrase).await?;
    let specs = client.list_databases().await?;

    let mut result = Vec::new();
    for spec in specs {
        result.push(MongoDatabaseInfo {
            name: spec.name,
            size_on_disk_bytes: Some(spec.size_on_disk),
            empty: Some(spec.empty),
        });
    }
    Ok(result)
}

pub async fn list_collections(
    payload: &MongoDatabasePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<Vec<MongoCollectionInfo>> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let mut cursor = db.list_collections().await?;
    let mut result = Vec::new();
    while let Some(res) = cursor.next().await {
        let coll = res?;
        let coll_type = match coll.collection_type {
            mongodb::results::CollectionType::View => MongoCollectionType::View,
            mongodb::results::CollectionType::Timeseries => MongoCollectionType::Timeseries,
            _ => MongoCollectionType::Collection,
        };

        let options_value =
            serde_json::to_value(&coll.options).unwrap_or(serde_json::Value::Object(Default::default()));

        result.push(MongoCollectionInfo {
            name: coll.name,
            collection_type: coll_type,
            read_only: coll.info.read_only || coll_type == MongoCollectionType::View,
            options: options_value,
        });
    }
    Ok(result)
}
pub async fn create_collection(
    payload: &MongoCreateCollectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let builder = db.create_collection(&payload.name);

    if let Some(opts) = &payload.options {
        let mut coll_opts = mongodb::options::CreateCollectionOptions::default();
        coll_opts.capped = Some(opts.capped);
        coll_opts.size = opts.size_bytes;
        if let Some(ts) = &opts.time_series {
            let ts_opts = TimeseriesOptions::builder()
                .time_field(ts.time_field.clone())
                .meta_field(ts.meta_field.clone())
                .granularity(ts.granularity.as_deref().and_then(|g| match g {
                    "seconds" => Some(TimeseriesGranularity::Seconds),
                    "minutes" => Some(TimeseriesGranularity::Minutes),
                    "hours" => Some(TimeseriesGranularity::Hours),
                    _ => None,
                }))
                .build();
            coll_opts.timeseries = Some(ts_opts);
        }
    }

    builder.await?;
    Ok(())
}

pub async fn rename_collection(
    payload: &MongoRenameCollectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let admin_db = client.database("admin");

    let from_ns = format!("{}.{}", payload.database, payload.collection);
    let to_ns = format!("{}.{}", payload.database, payload.new_name);

    let cmd = doc! {
        "renameCollection": from_ns,
        "to": to_ns,
        "dropTarget": false
    };

    admin_db.run_command(cmd).await?;
    Ok(())
}

pub async fn drop_collection(
    payload: &MongoDropCollectionPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);
    coll.drop().await?;
    Ok(())
}

// ── Find / Aggregate / Explain ─────────────────────────────────────

pub async fn find_documents(
    payload: &MongoFindPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoFindResult> {
    if !MONGO_PAGE_SIZES.contains(&payload.page_size) {
        return Err(AppError::InvalidInput(format!(
            "Invalid page_size {}; must be one of {:?}",
            payload.page_size, MONGO_PAGE_SIZES
        )));
    }

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let filter_doc = match &payload.filter {
        Some(v) => document_from_extjson(v.clone())?,
        None => Document::new(),
    };

    let mut find_opts = mongodb::options::FindOptions::default();
    find_opts.skip = Some(payload.offset);
    find_opts.limit = Some((payload.page_size + 1) as i64);

    if let Some(proj_val) = &payload.project {
        find_opts.projection = Some(document_from_extjson(proj_val.clone())?);
    }

    if let Some(sort_val) = &payload.sort {
        let mut sort_doc = document_from_extjson(sort_val.clone())?;
        if !sort_doc.contains_key("_id") {
            sort_doc.insert("_id", 1);
        }
        find_opts.sort = Some(sort_doc);
    } else {
        find_opts.sort = Some(doc! { "_id": 1 });
    }

    if let Some(coll_val) = &payload.collation {
        let coll_doc = document_from_extjson(coll_val.clone())?;
        find_opts.collation = Some(mongodb::bson::from_document::<Collation>(coll_doc).map_err(|e| {
            AppError::InvalidInput(format!("Invalid collation document: {}", e))
        })?);
    }
    if let Some(max_ms) = payload.max_time_ms {
        find_opts.max_time = Some(Duration::from_millis(max_ms));
    }

    let start = Instant::now();
    let mut cursor = coll.find(filter_doc).with_options(find_opts).await?;

    let mut canonical_documents = Vec::new();
    let mut relaxed_documents = Vec::new();


    while let Some(res) = cursor.next().await {
        let doc = res?;
        canonical_documents.push(to_canonical_extjson(&doc));
        relaxed_documents.push(to_relaxed_extjson(&doc));
    }

    let has_next = relaxed_documents.len() > payload.page_size as usize;
    if has_next {
        canonical_documents.pop();
        relaxed_documents.pop();
    }

    let has_previous = payload.offset > 0;

    Ok(MongoFindResult {
        documents: relaxed_documents,
        canonical_documents,
        offset: payload.offset,
        has_previous,
        has_next,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

fn check_write_stages(pipeline: &[Document]) -> bool {
    for stage in pipeline {
        if stage.contains_key("$out") || stage.contains_key("$merge") {
            return true;
        }
    }
    false
}

pub async fn aggregate_documents(
    payload: &MongoAggregatePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoDocumentListResult> {
    let mut pipeline_docs = Vec::new();
    for v in &payload.pipeline {
        pipeline_docs.push(document_from_extjson(v.clone())?);
    }

    let has_write = check_write_stages(&pipeline_docs);
    if has_write && !payload.allow_writes {
        return Err(AppError::InvalidInput(
            "Aggregation pipeline contains $out or $merge stage. Review and confirm write operation before executing."
                .to_string(),
        ));
    }

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let mut agg_opts = mongodb::options::AggregateOptions::default();
    agg_opts.allow_disk_use = payload.allow_disk_use;

    if let Some(max_ms) = payload.max_time_ms {
        agg_opts.max_time = Some(Duration::from_millis(max_ms));
    }

    if let Some(limit) = payload.preview_limit {
        if !has_write {
            pipeline_docs.push(doc! { "$limit": limit as i64 });
        }
    }

    let start = Instant::now();
    let mut cursor = coll.aggregate(pipeline_docs).with_options(agg_opts).await?;

    let mut canonical_documents = Vec::new();
    let mut relaxed_documents = Vec::new();


    while let Some(res) = cursor.next().await {
        let doc = res?;
        canonical_documents.push(to_canonical_extjson(&doc));
        relaxed_documents.push(to_relaxed_extjson(&doc));
    }

    Ok(MongoDocumentListResult {
        documents: relaxed_documents,
        canonical_documents,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

pub async fn explain(
    payload: &MongoExplainPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoExplainResult> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let verbosity_str = match payload.verbosity {
        MongoVerbosity::QueryPlanner => "queryPlanner",
        MongoVerbosity::ExecutionStats => "executionStats",
        MongoVerbosity::AllPlansExecution => "allPlansExecution",
    };

    let inner_cmd = match payload.operation {
        MongoExplainOperation::Find => {
            let mut find_cmd = doc! { "find": &payload.collection };
            if let Some(opts_val) = &payload.find_options {
                let opts_doc = document_from_extjson(opts_val.clone())?;
                for (k, v) in opts_doc {
                    find_cmd.insert(k, v);
                }
            }
            find_cmd
        }
        MongoExplainOperation::Aggregate => {
            let mut pipe_bson = Vec::new();
            for stage_val in &payload.pipeline {
                pipe_bson.push(Bson::Document(document_from_extjson(stage_val.clone())?));
            }
            doc! {
                "aggregate": &payload.collection,
                "pipeline": pipe_bson,
                "cursor": {}
            }
        }
    };

    let explain_cmd = doc! {
        "explain": inner_cmd,
        "verbosity": verbosity_str
    };

    let raw_plan_doc = db.run_command(explain_cmd).await?;

    // Parse normalized summary fields if present
    let winning_stage = raw_plan_doc
        .get_document("queryPlanner")
        .ok()
        .and_then(|qp| qp.get_document("winningPlan").ok())
        .and_then(|wp| wp.get_str("stage").ok().map(|s| s.to_string()));

    let mut index_names = Vec::new();
    if let Ok(qp) = raw_plan_doc.get_document("queryPlanner") {
        if let Ok(wp) = qp.get_document("winningPlan") {
            collect_index_names(wp, &mut index_names);
        }
    }

    let exec_stats = raw_plan_doc.get_document("executionStats").ok();
    let total_keys_examined = exec_stats.and_then(|s| s.get_i64("totalKeysExamined").ok());
    let total_docs_examined = exec_stats.and_then(|s| s.get_i64("totalDocsExamined").ok());
    let n_returned = exec_stats.and_then(|s| s.get_i64("nReturned").ok());
    let execution_time_millis = exec_stats.and_then(|s| s.get_i64("executionTimeMillis").ok());

    Ok(MongoExplainResult {
        raw_plan: to_canonical_extjson(&raw_plan_doc),
        winning_stage,
        index_names,
        total_keys_examined,
        total_docs_examined,
        n_returned,
        execution_time_millis,
    })
}

fn collect_index_names(doc: &Document, out: &mut Vec<String>) {
    if let Ok(name) = doc.get_str("indexName") {
        if !out.contains(&name.to_string()) {
            out.push(name.to_string());
        }
    }
    for (_k, v) in doc {
        if let Bson::Document(child) = v {
            collect_index_names(child, out);
        } else if let Bson::Array(arr) = v {
            for item in arr {
                if let Bson::Document(child) = item {
                    collect_index_names(child, out);
                }
            }
        }
    }
}

// ── Document Mutations ──────────────────────────────────────────────

pub async fn insert_document(
    payload: &MongoInsertPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoMutationResult> {
    let doc = document_from_extjson(payload.document.clone())?;
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let res = coll.insert_one(doc).await?;
    let inserted_id = Bson::Document(doc! { "$oid": res.inserted_id }).into_relaxed_extjson();

    Ok(MongoMutationResult {
        inserted_id: Some(inserted_id),
        matched_count: 0,
        modified_count: 0,
        deleted_count: 0,
    })
}

pub async fn replace_document(
    payload: &MongoReplacePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoMutationResult> {
    let identity_doc = document_from_extjson(payload.identity_filter.clone())?;
    let orig_doc = document_from_extjson(payload.original_canonical.clone())?;
    let repl_doc = document_from_extjson(payload.replacement_canonical.clone())?;

    // Pre-execution guard: reject _id changes
    if let (Some(orig_id), Some(repl_id)) = (orig_doc.get("_id"), repl_doc.get("_id")) {
        if orig_id != repl_id {
            return Err(AppError::InvalidInput(
                "Document _id field cannot be modified.".to_string(),
            ));
        }
    }

    // Combine identity_filter and original_canonical atomically
    let mut predicate = orig_doc;
    for (k, v) in identity_doc {
        predicate.insert(k, v);
    }

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let res = coll.replace_one(predicate, repl_doc).await?;

    if res.matched_count == 0 {
        return Err(AppError::Database(
            "Document changed on the server or no longer matches identity filter.".to_string(),
        ));
    }

    Ok(MongoMutationResult {
        inserted_id: None,
        matched_count: res.matched_count,
        modified_count: res.modified_count,
        deleted_count: 0,
    })
}

pub async fn delete_document(
    payload: &MongoDeletePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoMutationResult> {
    let identity_doc = document_from_extjson(payload.identity_filter.clone())?;

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let res = coll.delete_one(identity_doc).await?;

    Ok(MongoMutationResult {
        inserted_id: None,
        matched_count: 0,
        modified_count: 0,
        deleted_count: res.deleted_count,
    })
}

// ── Stats & Schema Sampling ─────────────────────────────────────────

pub async fn get_collection_stats(
    payload: &MongoNamespacePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoCollectionStats> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let stats_res = db
        .run_command(doc! { "collStats": &payload.collection })
        .await;

    if let Ok(stats_doc) = stats_res {
        let count = stats_doc.get_i64("count").unwrap_or(0) as u64;
        let size_bytes = stats_doc.get_i64("size").unwrap_or(0) as u64;
        let avg_obj_size_bytes = stats_doc.get_i64("avgObjSize").ok().map(|s| s as u64);
        let storage_size_bytes = stats_doc.get_i64("storageSize").ok().map(|s| s as u64);
        let index_count = stats_doc.get_i32("nindexes").unwrap_or(0) as u64;
        let index_size_bytes = stats_doc.get_i64("totalIndexSize").ok().map(|s| s as u64);
        let capped = stats_doc.get_bool("capped").unwrap_or(false);

        Ok(MongoCollectionStats {
            count,
            size_bytes,
            avg_obj_size_bytes,
            storage_size_bytes,
            index_count,
            index_size_bytes,
            capped,
        })
    } else {
        // Fallback using count_documents + list_indexes
        let coll = db.collection::<Document>(&payload.collection);
        let count = coll.count_documents(Document::new()).await.unwrap_or(0);

        Ok(MongoCollectionStats {
            count,
            size_bytes: 0,
            avg_obj_size_bytes: None,
            storage_size_bytes: None,
            index_count: 1,
            index_size_bytes: None,
            capped: false,
        })
    }
}

pub async fn sample_schema(
    payload: &MongoSampleSchemaPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoSampleSchemaResult> {
    let sample_limit = match payload.sample_size {
        100 | 500 | 1000 => payload.sample_size as usize,
        _ => 100,
    };

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let start = Instant::now();

    let mut pipeline = Vec::new();
    if let Some(f_val) = &payload.filter {
        let f_doc = document_from_extjson(f_val.clone())?;
        if !f_doc.is_empty() {
            pipeline.push(doc! { "$match": f_doc });
        }
    }
    pipeline.push(doc! { "$sample": { "size": sample_limit as i32 } });


    let mut cursor = coll.aggregate(pipeline).await?;
    let mut sampled_docs = Vec::new();
    while let Some(res) = cursor.next().await {
        sampled_docs.push(res?);
    }

    let sampled_count = sampled_docs.len() as u64;

    // Field tree inference
    let mut fields_map: HashMap<String, FieldAccumulator> = HashMap::new();
    for doc in &sampled_docs {
        accumulate_doc_fields("", doc, &mut fields_map);
    }

    let mut field_nodes = Vec::new();
    for (path, accum) in fields_map {
        field_nodes.push(accum.to_node(path, sampled_count));
    }
    field_nodes.sort_by(|a, b| a.path.cmp(&b.path));

    let stats = get_collection_stats(
        &MongoNamespacePayload {
            connection: payload.connection.clone(),
            database: payload.database.clone(),
            collection: payload.collection.clone(),
        },
        ssh_password,
        key_passphrase,
    )
    .await?;

    Ok(MongoSampleSchemaResult {
        sampled_documents: sampled_count,
        fields: field_nodes,
        stats,
        elapsed_ms: start.elapsed().as_millis(),
    })
}

struct FieldAccumulator {
    presence: u64,
    type_counts: HashMap<String, u64>,
    distinct_set: HashSet<String>,
    scalars: Vec<Bson>,
    num_min: Option<f64>,
    num_max: Option<f64>,
    array_lens: Vec<usize>,
}

impl FieldAccumulator {
    fn new() -> Self {
        Self {
            presence: 0,
            type_counts: HashMap::new(),
            distinct_set: HashSet::new(),
            scalars: Vec::new(),
            num_min: None,
            num_max: None,
            array_lens: Vec::new(),
        }
    }

    fn to_node(self, path: String, total_sampled: u64) -> MongoSchemaFieldNode {
        let presence_percentage = if total_sampled > 0 {
            (self.presence as f64 / total_sampled as f64) * 100.0
        } else {
            0.0
        };

        let mut types = Vec::new();
        for (btype, count) in self.type_counts {
            let pct = if self.presence > 0 {
                (count as f64 / self.presence as f64) * 100.0
            } else {
                0.0
            };
            types.push(MongoSchemaTypeStat {
                bson_type: btype,
                count,
                percentage: pct,
            });
        }
        types.sort_by(|a, b| b.count.cmp(&a.count));

        let representative_values = self
            .scalars
            .into_iter()
            .take(5)
            .map(|b| b.into_relaxed_extjson())
            .collect();

        let (arr_min, arr_max, arr_avg) = if !self.array_lens.is_empty() {
            let min = *self.array_lens.iter().min().unwrap() as u64;
            let max = *self.array_lens.iter().max().unwrap() as u64;
            let sum: usize = self.array_lens.iter().sum();
            let avg = sum as f64 / self.array_lens.len() as f64;
            (Some(min), Some(max), Some(avg))
        } else {
            (None, None, None)
        };

        let min_val = self.num_min.map(|n| serde_json::json!(n));
        let max_val = self.num_max.map(|n| serde_json::json!(n));

        MongoSchemaFieldNode {
            path,
            presence_percentage,
            types,
            distinct_estimate: Some(self.distinct_set.len() as u64),
            representative_values,
            min: min_val,
            max: max_val,
            array_min_length: arr_min,
            array_max_length: arr_max,
            array_avg_length: arr_avg,
            children: Vec::new(),
        }
    }
}

fn accumulate_doc_fields(prefix: &str, doc: &Document, out: &mut HashMap<String, FieldAccumulator>) {
    for (key, val) in doc {
        let path = if prefix.is_empty() {
            key.clone()
        } else {
            format!("{}.{}", prefix, key)
        };

        let accum_entry = out.entry(path.clone()).or_insert_with(FieldAccumulator::new);
        accum_entry.presence += 1;

        let btype_name = format!("{:?}", val.element_type());
        *accum_entry.type_counts.entry(btype_name).or_insert(0) += 1;

        let val_repr = val.to_string();
        accum_entry.distinct_set.insert(val_repr);

        match val {
            Bson::Document(child) => {
                accumulate_doc_fields(&path, child, out);
            }
            Bson::Array(arr) => {
                accum_entry.array_lens.push(arr.len());
            }
            Bson::Int32(n) => {
                let f = *n as f64;
                accum_entry.num_min = Some(accum_entry.num_min.map_or(f, |m| m.min(f)));
                accum_entry.num_max = Some(accum_entry.num_max.map_or(f, |m| m.max(f)));
                accum_entry.scalars.push(val.clone());
            }
            Bson::Int64(n) => {
                let f = *n as f64;
                accum_entry.num_min = Some(accum_entry.num_min.map_or(f, |m| m.min(f)));
                accum_entry.num_max = Some(accum_entry.num_max.map_or(f, |m| m.max(f)));
                accum_entry.scalars.push(val.clone());
            }
            Bson::Double(f) => {
                accum_entry.num_min = Some(accum_entry.num_min.map_or(*f, |m| m.min(*f)));
                accum_entry.num_max = Some(accum_entry.num_max.map_or(*f, |m| m.max(*f)));
                accum_entry.scalars.push(val.clone());
            }
            Bson::String(_) | Bson::Boolean(_) | Bson::DateTime(_) | Bson::ObjectId(_) => {
                accum_entry.scalars.push(val.clone());
            }
            _ => {}
        }
    }
}

// ── Indexes ────────────────────────────────────────────────────────

pub async fn list_indexes(
    payload: &MongoNamespacePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<Vec<MongoIndexInfo>> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);


    let mut cursor = coll.list_indexes().await?;
    let mut indexes = Vec::new();

    while let Some(res) = cursor.next().await {
        let model = res?;
        let options = model.options.unwrap_or_default();

        let mut keys = Vec::new();
        for (k, v) in model.keys {
            let dir = match v {
                Bson::Int32(i) => serde_json::json!(i),
                Bson::Int64(i) => serde_json::json!(i),
                Bson::String(s) => serde_json::json!(s),
                _ => serde_json::json!(1),
            };
            keys.push(MongoIndexKey {
                field: k,
                direction: dir,
            });
        }

        let name = options.name.unwrap_or_else(|| "index".to_string());
        let unique = options.unique.unwrap_or(false);
        let sparse = options.sparse.unwrap_or(false);
        let hidden = options.hidden;
        let expire_after_seconds = options.expire_after.map(|d| d.as_secs() as i64);

        let partial_filter_expression = options
            .partial_filter_expression
            .map(|d| to_canonical_extjson(&d));
        let wildcard_projection = options
            .wildcard_projection
            .map(|d| to_canonical_extjson(&d));
        let collation = options.collation.map(|c| {
            let doc = mongodb::bson::to_document(&c).unwrap_or_default();
            to_canonical_extjson(&doc)
        });

        indexes.push(MongoIndexInfo {
            name,
            keys,
            unique,
            sparse,
            hidden,
            expire_after_seconds,
            partial_filter_expression,
            wildcard_projection,
            collation,
            size_bytes: None,
            usage_since_restart: None,
        });
    }

    // Try enriching with $indexStats when supported
    let stats_res = db
        .run_command(doc! {
            "aggregate": &payload.collection,
            "pipeline": [ { "$indexStats": {} } ],
            "cursor": {}
        })
        .await;

    if let Ok(stats_doc) = stats_res {
        if let Ok(cursor_doc) = stats_doc.get_document("cursor") {
            if let Ok(first_batch) = cursor_doc.get_array("firstBatch") {
                for item in first_batch {
                    if let Bson::Document(sdoc) = item {
                        if let (Ok(iname), Ok(accesses)) =
                            (sdoc.get_str("name"), sdoc.get_document("accesses"))
                        {
                            if let Ok(ops) = accesses.get_i64("ops") {
                                if let Some(target_idx) =
                                    indexes.iter_mut().find(|idx| idx.name == iname)
                                {
                                    target_idx.usage_since_restart = Some(ops as u64);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(indexes)
}

pub async fn create_index(
    payload: &MongoCreateIndexPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoCreatedName> {
    let mut key_doc = Document::new();
    for k in &payload.keys {
        let bval = match &k.direction {
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Bson::Int32(i as i32)
                } else {
                    Bson::Int32(1)
                }
            }
            serde_json::Value::String(s) => Bson::String(s.clone()),
            _ => Bson::Int32(1),
        };
        key_doc.insert(&k.field, bval);
    }

    let mut opts = IndexOptions::default();
    opts.name = payload.name.clone();
    opts.unique = Some(payload.unique);
    opts.sparse = Some(payload.sparse);

    if let Some(secs) = payload.expire_after_seconds {
        opts.expire_after = Some(Duration::from_secs(secs));
    }

    if let Some(pf_val) = &payload.partial_filter_expression {
        opts.partial_filter_expression = Some(document_from_extjson(pf_val.clone())?);
    }

    if let Some(wp_val) = &payload.wildcard_projection {
        opts.wildcard_projection = Some(document_from_extjson(wp_val.clone())?);
    }

    if let Some(coll_val) = &payload.collation {
        let coll_doc = document_from_extjson(coll_val.clone())?;
        opts.collation = Some(mongodb::bson::from_document::<Collation>(coll_doc).map_err(|e| {
            AppError::InvalidInput(format!("Invalid index collation document: {}", e))
        })?);
    }

    let model = mongodb::IndexModel::builder()
        .keys(key_doc)
        .options(opts)
        .build();

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let res = coll.create_index(model).await?;

    Ok(MongoCreatedName { name: res.index_name })
}

pub async fn set_index_hidden(
    payload: &MongoSetIndexHiddenPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    if payload.index_name == "_id_" {
        return Err(AppError::InvalidInput(
            "The default _id_ index cannot be hidden.".to_string(),
        ));
    }

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let cmd = doc! {
        "collMod": &payload.collection,
        "index": {
            "name": &payload.index_name,
            "hidden": payload.hidden
        }
    };

    db.run_command(cmd).await?;
    Ok(())
}

pub async fn drop_index(
    payload: &MongoDropIndexPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    if payload.index_name == "_id_" {
        return Err(AppError::InvalidInput(
            "The default _id_ index cannot be dropped.".to_string(),
        ));
    }

    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    coll.drop_index(&payload.index_name).await?;
    Ok(())
}

// ── Validation ─────────────────────────────────────────────────────

pub async fn get_validation(
    payload: &MongoNamespacePayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoValidationSettings> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let mut cursor = db
        .list_collections()
        .filter(doc! { "name": &payload.collection })
        .await?;


    if let Some(res) = cursor.next().await {
        let coll_spec = res?;
        let opts = coll_spec.options;

        let validator = opts
            .validator
            .map(|d| to_canonical_extjson(&d));

        let validation_level = opts.validation_level.map(|l| match l {
            mongodb::options::ValidationLevel::Off => MongoValidationLevel::Off,
            mongodb::options::ValidationLevel::Strict => MongoValidationLevel::Strict,
            mongodb::options::ValidationLevel::Moderate => MongoValidationLevel::Moderate,
            _ => MongoValidationLevel::Strict,
        });

        let validation_action = opts.validation_action.map(|a| match a {
            mongodb::options::ValidationAction::Error => MongoValidationAction::Error,
            mongodb::options::ValidationAction::Warn => MongoValidationAction::Warn,
            _ => MongoValidationAction::Error,
        });

        Ok(MongoValidationSettings {
            validator,
            validation_level,
            validation_action,
        })
    } else {
        Ok(MongoValidationSettings::default())
    }
}

pub async fn set_validation(
    payload: &MongoSetValidationPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<()> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);

    let mut cmd = doc! { "collMod": &payload.collection };

    if let Some(v_val) = &payload.settings.validator {
        let v_doc = document_from_extjson(v_val.clone())?;
        cmd.insert("validator", v_doc);
    } else {
        cmd.insert("validator", doc! {});
    }

    if let Some(lvl) = payload.settings.validation_level {
        let lvl_str = match lvl {
            MongoValidationLevel::Off => "off",
            MongoValidationLevel::Strict => "strict",
            MongoValidationLevel::Moderate => "moderate",
        };
        cmd.insert("validationLevel", lvl_str);
    }

    if let Some(act) = payload.settings.validation_action {
        let act_str = match act {
            MongoValidationAction::Error => "error",
            MongoValidationAction::Warn => "warn",
        };
        cmd.insert("validationAction", act_str);
    }

    db.run_command(cmd).await?;
    Ok(())
}

// ── Export ─────────────────────────────────────────────────────────

pub async fn estimate_export(
    payload: &MongoEstimateExportPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<MongoExportEstimate> {
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let filter_doc = match &payload.filter {
        Some(v) => document_from_extjson(v.clone())?,
        None => Document::new(),
    };

    let document_count = coll.count_documents(filter_doc).await?;
    let estimated_size_bytes = document_count * 512;
    let is_large = document_count > 10_000;

    Ok(MongoExportEstimate {
        document_count,
        estimated_size_bytes,
        is_large,
    })
}

pub async fn execute_export<F>(
    payload: &MongoExportPayload,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
    progress_cb: Option<F>,
) -> AppResult<MongoExportResult>
where
    F: Fn(MongoExportProgress) + Send + Sync + 'static,
{
    let client = get_client(&payload.connection, ssh_password, key_passphrase).await?;
    let db = client.database(&payload.database);
    let coll = db.collection::<Document>(&payload.collection);

    let filter_doc = match &payload.filter {
        Some(v) => document_from_extjson(v.clone())?,
        None => Document::new(),
    };

    let mut find_opts = mongodb::options::FindOptions::default();

    if let Some(proj_val) = &payload.project {
        find_opts.projection = Some(document_from_extjson(proj_val.clone())?);
    }

    if let Some(sort_val) = &payload.sort {
        find_opts.sort = Some(document_from_extjson(sort_val.clone())?);
    }

    if let Some(coll_val) = &payload.collation {
        let coll_doc = document_from_extjson(coll_val.clone())?;
        find_opts.collation = Some(mongodb::bson::from_document::<Collation>(coll_doc).map_err(|e| {
            AppError::InvalidInput(format!("Invalid collation document: {}", e))
        })?);
    }

    let file_path = Path::new(&payload.save_path);
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let file = File::create(file_path)?;
    let mut writer = BufWriter::new(file);

    let start = Instant::now();

    let mut cursor = coll.find(filter_doc).with_options(find_opts).await?;

    let mut exported_count: u64 = 0;

    let export_res: AppResult<()> = async {
        match payload.format {
            MongoExportFormat::Json => {
                writer.write_all(b"[\n")?;
                let mut first = true;

                while let Some(res) = cursor.next().await {
                    let doc = res?;
                    let json_val = match payload.json_mode {
                        MongoJsonMode::Canonical => to_canonical_extjson(&doc),
                        MongoJsonMode::Relaxed => to_relaxed_extjson(&doc),
                    };

                    if !first {
                        writer.write_all(b",\n")?;
                    } else {
                        first = false;
                    }

                    writer.write_all(serde_json::to_string(&json_val)?.as_bytes())?;
                    exported_count += 1;

                    if exported_count % 1000 == 0 {
                        if let Some(ref cb) = progress_cb {
                            cb(MongoExportProgress {
                                documents_exported: exported_count,
                                done: false,
                                error: None,
                            });
                        }
                    }
                }

                writer.write_all(b"\n]\n")?;
            }
            MongoExportFormat::Csv => {
                let mut docs_batch = Vec::new();
                while let Some(res) = cursor.next().await {
                    docs_batch.push(res?);
                }

                let mut field_paths_set = HashSet::new();
                for doc in &docs_batch {
                    collect_flat_paths("", doc, &mut field_paths_set);
                }

                let mut field_paths: Vec<String> = field_paths_set.into_iter().collect();
                field_paths.sort();

                if field_paths.contains(&"_id".to_string()) {
                    field_paths.retain(|p| p != "_id");
                    field_paths.insert(0, "_id".to_string());
                }

                let mut csv_writer = csv::Writer::from_writer(writer);

                // Header
                csv_writer.write_record(&field_paths).map_err(|e| {
                    AppError::Export(format!("Failed to write CSV header: {}", e))
                })?;

                for doc in docs_batch {
                    let row = build_csv_row(&field_paths, &doc);
                    csv_writer
                        .write_record(&row)
                        .map_err(|e| AppError::Export(format!("Failed to write CSV row: {}", e)))?;
                    exported_count += 1;

                    if exported_count % 1000 == 0 {
                        if let Some(ref cb) = progress_cb {
                            cb(MongoExportProgress {
                                documents_exported: exported_count,
                                done: false,
                                error: None,
                            });
                        }
                    }
                }

                csv_writer
                    .flush()
                    .map_err(|e| AppError::Export(format!("Failed to flush CSV output: {}", e)))?;
            }
        }
        Ok(())
    }
    .await;

    if let Err(err) = export_res {
        let _ = std::fs::remove_file(file_path);
        let err_msg = err.to_string();
        if let Some(ref cb) = progress_cb {
            cb(MongoExportProgress {
                documents_exported: exported_count,
                done: true,
                error: Some(err_msg.clone()),
            });
        }
        return Ok(MongoExportResult {
            success: false,
            file_path: None,
            document_count: exported_count,
            elapsed_ms: start.elapsed().as_millis(),
            error: Some(err_msg),
        });
    }

    if let Some(ref cb) = progress_cb {
        cb(MongoExportProgress {
            documents_exported: exported_count,
            done: true,
            error: None,
        });
    }

    Ok(MongoExportResult {
        success: true,
        file_path: Some(payload.save_path.clone()),
        document_count: exported_count,
        elapsed_ms: start.elapsed().as_millis(),
        error: None,
    })
}

fn collect_flat_paths(prefix: &str, doc: &Document, out: &mut HashSet<String>) {
    for (k, v) in doc {
        let path = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{}.{}", prefix, k)
        };

        if let Bson::Document(child) = v {
            collect_flat_paths(&path, child, out);
        } else {
            out.insert(path);
        }
    }
}

fn build_csv_row(paths: &[String], doc: &Document) -> Vec<String> {
    let mut row = Vec::new();
    for p in paths {
        let bval = extract_path_bson(p, doc);
        let s = match bval {
            Some(Bson::Null) | None => String::new(),
            Some(Bson::String(s)) => s,
            Some(Bson::Boolean(b)) => b.to_string(),
            Some(Bson::Int32(i)) => i.to_string(),
            Some(Bson::Int64(i)) => i.to_string(),
            Some(Bson::Double(f)) => f.to_string(),
            Some(other) => serde_json::to_string(&other.into_relaxed_extjson()).unwrap_or_default(),
        };
        row.push(s);
    }
    row
}

fn extract_path_bson(path: &str, doc: &Document) -> Option<Bson> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut cur_doc = doc;

    for (i, p) in parts.iter().enumerate() {
        if i == parts.len() - 1 {
            return cur_doc.get(*p).cloned();
        }
        if let Some(Bson::Document(child)) = cur_doc.get(*p) {
            cur_doc = child;
        } else {
            return None;
        }
    }
    None
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extjson_roundtrip_canonical() {
        let original_doc = doc! {
            "_id": Bson::ObjectId(mongodb::bson::oid::ObjectId::parse_str("507f1f77bcf86cd799439011").unwrap()),
            "name": "Pinnacle Test",
            "count": 42i32,
            "created_at": Bson::DateTime(mongodb::bson::DateTime::now()),
        };

        let json = to_canonical_extjson(&original_doc);
        let doc_back = document_from_extjson(json).expect("failed to convert back from ExtJSON");

        assert_eq!(original_doc.get("_id"), doc_back.get("_id"));
        assert_eq!(original_doc.get("name"), doc_back.get("name"));
        assert_eq!(original_doc.get("count"), doc_back.get("count"));
    }

    #[test]
    fn test_csv_row_flattening() {
        let doc = doc! {
            "name": "Alice",
            "age": 30i32,
            "address": {
                "city": "Jakarta",
                "zip": "12345"
            }
        };

        let mut paths_set = HashSet::new();
        collect_flat_paths("", &doc, &mut paths_set);
        let mut paths: Vec<String> = paths_set.into_iter().collect();
        paths.sort();

        assert_eq!(paths, vec!["address.city", "address.zip", "age", "name"]);

        let row = build_csv_row(&paths, &doc);
        assert_eq!(row, vec!["Jakarta", "12345", "30", "Alice"]);
    }

    #[tokio::test]
    async fn test_parse_connection_uri_standard() {
        let uri = "mongodb://user:pass@localhost:27017/test_db?authSource=admin";
        let parsed = parse_connection_uri(uri, None, None)
            .await
            .expect("Failed to parse standard URI");

        assert_eq!(parsed.mongo_config.scheme, MongoScheme::Standard);
        assert_eq!(parsed.host, "localhost");
        assert_eq!(parsed.port, 27017);
        assert_eq!(parsed.database, "test_db");
        assert_eq!(parsed.username, "user");
        assert_eq!(parsed.has_uri_password, true);
        assert_eq!(parsed.mongo_config.auth_source.as_deref(), Some("admin"));
    }

    #[tokio::test]
    async fn test_parse_connection_uri_srv_format() {
        let uri = "mongodb+srv://user:pass@cluster.example.com/prod_db";
        assert!(uri.starts_with("mongodb+srv://"));
    }
}
