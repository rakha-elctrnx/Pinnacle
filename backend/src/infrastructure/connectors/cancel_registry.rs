use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::{oneshot, Mutex};

use crate::core::{error::AppError, result::AppResult};

/// Registry for active query cancellation signals.
///
/// Each running query registers a oneshot sender keyed by a client-supplied
/// `query_id`. When `cancel_query` is called, the registry fires the signal;
/// a monitor task running `pg_cancel_backend` then terminates the query.
#[derive(Default)]
struct CancelRegistry {
    inner: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

static CANCEL_REGISTRY: LazyLock<CancelRegistry> = LazyLock::new(CancelRegistry::default);

/// Register a cancellation channel for an active query.
///
/// Returns a oneshot receiver that fires when `cancel_query` is called for
/// this `query_id`. The caller spawns a monitor task holding this receiver.
pub async fn register_cancel(query_id: String) -> oneshot::Receiver<()> {
    let (tx, rx) = oneshot::channel();
    let mut map = CANCEL_REGISTRY.inner.lock().await;
    map.insert(query_id, tx);
    rx
}

/// Unregister a query when execution completes (success or error).
pub async fn unregister_cancel(query_id: &str) {
    let mut map = CANCEL_REGISTRY.inner.lock().await;
    map.remove(query_id);
}

/// Fire the cancellation signal for a running query.
///
/// If `query_id` is not registered (already completed or never started),
/// returns `InvalidInput`. Otherwise, sends the cancel signal and removes
/// the entry.
pub async fn fire_cancel(query_id: &str) -> AppResult<()> {
    let mut map = CANCEL_REGISTRY.inner.lock().await;
    if let Some(tx) = map.remove(query_id) {
        // Ignore send errors — receiver might have already dropped if the
        // query finished naturally before cancel fired.
        let _ = tx.send(());
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "Query '{}' is not running or has already completed",
            query_id
        )))
    }
}
