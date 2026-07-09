//! Tunnel local agents to the internet so the cloud engine can reach them.
//!
//! Uses cloudflared (trycloudflare.com, no signup) as primary,
//! falls back to ngrok, bore, or localtunnel.

use regex::Regex;
use std::fmt;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

/// Check if a URL points to localhost or a private network.
pub fn is_local_url(url: &str) -> bool {
    url.contains("localhost")
        || url.contains("127.0.0.1")
        || url.contains("0.0.0.0")
        || url.contains("192.168.")
        || url.contains("10.")
}

/// Extract port number from a URL like http://localhost:8047/path.
pub fn extract_port(url: &str) -> Option<u16> {
    let re = Regex::new(r":(\d+)").ok()?;
    re.captures(url)
        .and_then(|caps| caps.get(1))
        .and_then(|m| m.as_str().parse::<u16>().ok())
}

// ── Regex patterns for URL extraction ──────────────────────────────

static CLOUDFLARED_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"https://[a-zA-Z0-9.-]+\.trycloudflare\.com").unwrap());

static NGROK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"url=https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io)").unwrap()
});

static BORE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"listening at (bore\.pub:\d+)").unwrap());

static LOCALTUNNEL_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"your url is: (https://[a-zA-Z0-9.-]+\.loca\.lt)").unwrap());

// ── Error type ──────────────────────────────────────────────────────

#[derive(Debug)]
pub struct TunnelError {
    pub message: String,
}

impl fmt::Display for TunnelError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for TunnelError {}

// ── Provider definitions ───────────────────────────────────────────

struct Provider {
    binary: &'static str,
    command: fn(&str, u16) -> Vec<String>,
    extract_url: fn(&str) -> Option<String>,
}

fn cloudflared_cmd(bin: &str, port: u16) -> Vec<String> {
    vec![
        bin.to_string(),
        "tunnel".to_string(),
        "--url".to_string(),
        format!("http://localhost:{}", port),
    ]
}

fn ngrok_cmd(bin: &str, port: u16) -> Vec<String> {
    vec![
        bin.to_string(),
        "http".to_string(),
        port.to_string(),
        "--log=stdout".to_string(),
    ]
}

fn bore_cmd(bin: &str, port: u16) -> Vec<String> {
    vec![
        bin.to_string(),
        "local".to_string(),
        port.to_string(),
        "--to".to_string(),
        "bore.pub".to_string(),
    ]
}

fn localtunnel_cmd(bin: &str, port: u16) -> Vec<String> {
    vec![bin.to_string(), "--port".to_string(), port.to_string()]
}

fn extract_cloudflared(line: &str) -> Option<String> {
    CLOUDFLARED_RE.find(line).map(|m| m.as_str().to_string())
}

fn extract_ngrok(line: &str) -> Option<String> {
    NGROK_RE.find(line).map(|m| m.as_str().replace("url=", ""))
}

fn extract_bore(line: &str) -> Option<String> {
    BORE_RE
        .captures(line)
        .and_then(|caps| caps.get(1))
        .map(|m| format!("http://{}", m.as_str()))
}

fn extract_localtunnel(line: &str) -> Option<String> {
    LOCALTUNNEL_RE
        .captures(line)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

const PROVIDERS: &[Provider] = &[
    Provider {
        binary: "cloudflared",
        command: cloudflared_cmd,
        extract_url: extract_cloudflared,
    },
    Provider {
        binary: "ngrok",
        command: ngrok_cmd,
        extract_url: extract_ngrok,
    },
    Provider {
        binary: "bore",
        command: bore_cmd,
        extract_url: extract_bore,
    },
    Provider {
        binary: "lt",
        command: localtunnel_cmd,
        extract_url: extract_localtunnel,
    },
];

// ── Tunnel ──────────────────────────────────────────────────────────

/// Manage a public tunnel to a local port.
///
/// Implements `Drop` so the tunnel is always cleaned up.
pub struct Tunnel {
    process: Option<Child>,
    pub public_url: Option<String>,
}

impl Tunnel {
    pub fn new() -> Self {
        Tunnel {
            process: None,
            public_url: None,
        }
    }

    /// Start a tunnel and return the public URL.
    pub fn start(&mut self, local_port: u16) -> Result<String, TunnelError> {
        for provider in PROVIDERS {
            if which::which(provider.binary).is_err() {
                continue;
            }

            let bin_path = provider.binary;
            let cmd = (provider.command)(bin_path, local_port);

            match self.try_provider(cmd, provider.extract_url) {
                Ok(url) => {
                    self.public_url = Some(url.clone());
                    return Ok(url);
                }
                Err(_) => {
                    // Try next provider
                    self.stop();
                    continue;
                }
            }
        }

        Err(TunnelError {
            message: format!(
                "No tunnel tool found. Install one:\n\
                 \x20 macOS:  brew install cloudflared\n\
                 \x20 Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared\n\
                 \x20 Or:     brew install ngrok && ngrok config add-authtoken <token>"
            ),
        })
    }

    fn try_provider(
        &mut self,
        cmd: Vec<String>,
        extract_url: fn(&str) -> Option<String>,
    ) -> Result<String, TunnelError> {
        let mut child = Command::new(&cmd[0])
            .args(&cmd[1..])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| TunnelError {
                message: format!("Failed to start tunnel: {}", e),
            })?;

        let stdout = child.stdout.take().ok_or_else(|| TunnelError {
            message: "Failed to capture stdout".to_string(),
        })?;

        let reader = BufReader::new(stdout);
        let deadline = Instant::now() + Duration::from_secs(15);

        let mut url: Option<String> = None;
        for line in reader.lines() {
            if Instant::now() > deadline {
                break;
            }
            match line {
                Ok(l) => {
                    if let Some(found) = extract_url(&l) {
                        url = Some(found);
                        break;
                    }
                }
                Err(_) => break,
            }

            // Check if process already died
            if child.try_wait().ok().flatten().is_some() {
                break;
            }
        }

        self.process = Some(child);

        url.ok_or_else(|| TunnelError {
            message: "Tunnel did not provide a public URL within 15 seconds".to_string(),
        })
    }

    /// Stop the tunnel process.
    pub fn stop(&mut self) {
        if let Some(ref mut child) = self.process {
            let _ = child.kill();
            let _ = child.wait();
        }
        self.process = None;
    }
}

impl Drop for Tunnel {
    fn drop(&mut self) {
        self.stop();
    }
}
