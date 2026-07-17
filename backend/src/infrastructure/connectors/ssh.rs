//! SSH local port forwarding tunnel.
//!
//! Opens an ephemeral local TCP listener on 127.0.0.1 and, for each accepted
//! connection, opens a `direct-tcpip` channel on the SSH bastion forwarding to
//! `(db_host, db_port)`. sqlx then connects to the local listener as if it were
//! the database. Dropping [`TunnelHandle`] aborts the accept loop.

use std::sync::Arc;

use russh::client::{self, AuthResult, Handle};
use russh::keys::PrivateKeyWithHashAlg;
use tokio::io::AsyncWriteExt;
use tokio::net::TcpListener;

use crate::core::result::AppResult;
use crate::core::error::AppError;
use crate::domain::query::SshConfig;

/// A live SSH local-forwarding tunnel. Drop to close.
pub struct TunnelHandle {
    local_addr: std::net::SocketAddr,
    join: tokio::task::JoinHandle<()>,
}

impl TunnelHandle {
    pub fn local_host(&self) -> &str {
        "127.0.0.1"
    }
    pub fn local_port(&self) -> u16 {
        self.local_addr.port()
    }
}

impl Drop for TunnelHandle {
    fn drop(&mut self) {
        self.join.abort();
    }
}

/// Minimal client handler — accepts any server host key.
///
/// ponytail: host-key verification is skipped (TOFU accepted). This is the
/// same trust model as a first-connect `ssh` without `StrictHostKeyChecking`.
/// Upgrade path: wire `russh::keys::check_known_hosts` against `~/.ssh/known_hosts`
/// and surface unknown-host failures to the UI when a host-key management UX exists.
struct AcceptAllHandler;

impl client::Handler for AcceptAllHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Open an SSH tunnel from a local ephemeral port to `(db_host, db_port)` via the bastion.
///
/// `ssh_password` / `key_passphrase` are the SSH-layer secrets (NOT the DB password).
/// Returns a [`TunnelHandle`] whose `local_addr` should be used as the sqlx connect host/port.
pub async fn open_tunnel(
    ssh: &SshConfig,
    db_host: &str,
    db_port: u16,
    ssh_password: Option<&str>,
    key_passphrase: Option<&str>,
) -> AppResult<TunnelHandle> {
    if ssh.host.is_empty() {
        return Err(AppError::InvalidInput("SSH host is required".to_string()));
    }
    if ssh.username.is_empty() {
        return Err(AppError::InvalidInput("SSH username is required".to_string()));
    }

    // Ephemeral local listener — sqlx connects here.
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let local_addr = listener.local_addr()?;

    let config = Arc::new(russh::client::Config::default());
    let addr = format!("{}:{}", ssh.host, ssh.port);
    let mut handle: Handle<AcceptAllHandler> =
        client::connect(config, addr, AcceptAllHandler)
            .await
            .map_err(AppError::from)?;

    // Authenticate per the configured method.
    let authed = match ssh.auth_method.as_str() {
        "privateKey" => {
            let path = ssh.private_key_path.as_ref().ok_or_else(|| {
                AppError::InvalidInput(
                    "SSH private key path is required for privateKey auth".to_string(),
                )
            })?;
            let key =
                russh::keys::load_secret_key(path, key_passphrase).map_err(AppError::from)?;
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key), None);
            handle
                .authenticate_publickey(&ssh.username, key_with_alg)
                .await
                .map_err(AppError::from)?
        }
        "agent" => authenticate_via_agent(&mut handle, &ssh.username).await?,
        _ => {
            // "password" (and any unrecognized value — default to password)
            let pwd = ssh_password.ok_or_else(|| {
                AppError::InvalidInput("SSH password is required for password auth".to_string())
            })?;
            handle
                .authenticate_password(&ssh.username, pwd)
                .await
                .map_err(AppError::from)?
        }
    };

    if !authed.success() {
        return Err(AppError::Ssh("SSH authentication failed".to_string()));
    }

    // After auth, `Handle` methods only need `&self` (channel_open_direct_tcpip),
    // so wrap in Arc for cheap per-connection cloning in the accept loop.
    let handle = Arc::new(handle);
    let db_host = db_host.to_string();
    let join = tokio::spawn(async move {
        loop {
            let (local_stream, _peer) = match listener.accept().await {
                Ok(c) => c,
                Err(_) => break,
            };
            let h = Arc::clone(&handle);
            let db_host = db_host.clone();
            tokio::spawn(async move {
                let channel = match h
                    .channel_open_direct_tcpip(db_host, db_port as u32, "127.0.0.1", 0)
                    .await
                {
                    Ok(c) => c,
                    Err(_) => return,
                };
                let chan_stream = channel.into_stream();
                // Bidirectional pipe: local <-> channel. tokio::io::copy is
                // one-directional, so spawn two halves and finish when either ends.
                let (mut lr, mut lw) = tokio::io::split(local_stream);
                let (mut cr, mut cw) = tokio::io::split(chan_stream);
                // Bidirectional pipe: finish when either direction ends.
                tokio::select! {
                    _ = tokio::io::copy(&mut lr, &mut cw) => {}
                    _ = tokio::io::copy(&mut cr, &mut lw) => {}
                }
                // Flush best-effort; both halves close as they drop.
                let _ = lw.shutdown().await;
                let _ = cw.shutdown().await;
            });
        }
    });

    Ok(TunnelHandle {
        local_addr,
        join,
    })
}

/// Try each identity offered by the SSH agent until one authenticates.
async fn authenticate_via_agent(
    handle: &mut Handle<AcceptAllHandler>,
    username: &str,
) -> AppResult<AuthResult> {
    let mut agent = russh::keys::agent::client::AgentClient::connect_env()
        .await
        .map_err(AppError::from)?;
    let identities = agent
        .request_identities()
        .await
        .map_err(AppError::from)?;

    for pubkey in identities {
        // The agent signs via authenticate_publickey_with; hash alg None lets
        // the agent pick (correct for non-RSA; RSA would need best_supported_rsa_hash).
        match handle
            .authenticate_publickey_with(username, pubkey.clone(), None, &mut agent)
            .await
        {
            Ok(r) if r.success() => return Ok(r),
            _ => continue,
        }
    }
    // No identity authenticated.
    Err(AppError::Ssh(
        "SSH agent: no usable identity".to_string(),
    ))
}
