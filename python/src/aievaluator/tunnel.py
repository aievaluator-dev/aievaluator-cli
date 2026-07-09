"""
Tunnel local agents to the internet so the cloud engine can reach them.

Uses cloudflared (trycloudflare.com, no signup) as primary,
falls back to ngrok, bore, or localtunnel.
"""

import subprocess
import signal
import time
import re
import shutil
import os
import platform


def is_local_url(url: str) -> bool:
    """Check if a URL points to localhost or a private network."""
    return any(x in url for x in ["localhost", "127.0.0.1", "0.0.0.0", "192.168.", "10."])


def extract_port(url: str) -> int | None:
    """Extract port number from a URL like http://localhost:8047/path."""
    m = re.search(r":(\d+)", url)
    return int(m.group(1)) if m else None


class TunnelError(Exception):
    """Could not start a tunnel."""


class Tunnel:
    """Manage a public tunnel to a local port.
    
    Usage as context manager:
        with Tunnel(8047) as public_url:
            print(f"Agent available at {public_url}")
    
    Usage manual:
        t = Tunnel(8047)
        url = t.start()
        ...
        t.stop()
    """

    def __init__(self, local_port: int):
        self.local_port = local_port
        self._process: subprocess.Popen | None = None
        self.public_url: str | None = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *args):
        self.stop()
        return False

    def start(self) -> str:
        """Start tunnel and return the public URL."""
        for name, cmd_builder in _TUNNEL_PROVIDERS:
            bin_path = shutil.which(name)
            if bin_path is None:
                continue
            try:
                self.public_url = self._try_tunnel(name, bin_path, cmd_builder)
                if self.public_url:
                    return self.public_url
            except Exception:
                continue

        raise TunnelError(
            "No tunnel tool found. Install one:\n"
            "  macOS:  brew install cloudflared\n"
            "  Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared\n"
            "  Or:     brew install ngrok && ngrok config add-authtoken <token>"
        )

    def stop(self):
        """Stop the tunnel process."""
        if self._process and self._process.poll() is None:
            try:
                if platform.system() == "Windows":
                    self._process.terminate()
                else:
                    os.killpg(os.getpgid(self._process.pid), signal.SIGTERM)
            except Exception:
                try:
                    self._process.kill()
                except Exception:
                    pass
            self._process.wait(timeout=5)
            self._process = None

    def _try_tunnel(self, name: str, bin_path: str, cmd_builder) -> str | None:
        """Try to start a tunnel with the given provider. Returns public URL or None."""
        cmd = cmd_builder(bin_path, self.local_port)

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            preexec_fn=os.setsid if platform.system() != "Windows" else None,
        )

        # Wait for the URL to appear in stdout (timeout after 15s)
        deadline = time.time() + 15
        url = None
        while time.time() < deadline:
            line = self._process.stdout.readline()
            if not line:
                if self._process.poll() is not None:
                    # Process exited
                    break
                time.sleep(0.1)
                continue
            url = _extract_url(name, line)
            if url:
                return url

        # Timeout — kill process
        self.stop()
        return None


# ── Provider-specific command builders ──────────────────────────────

def _cloudflared_cmd(bin_path: str, port: int) -> list[str]:
    return [bin_path, "tunnel", "--url", f"http://localhost:{port}"]


def _ngrok_cmd(bin_path: str, port: int) -> list[str]:
    return [bin_path, "http", str(port), "--log=stdout"]


def _bore_cmd(bin_path: str, port: int) -> list[str]:
    return [bin_path, "local", str(port), "--to", "bore.pub"]


def _localtunnel_cmd(bin_path: str, port: int) -> list[str]:
    return [bin_path, "--port", str(port)]


# ── URL extractors ──────────────────────────────────────────────────

_CLOUDFLARED_RE = re.compile(r"https://[a-zA-Z0-9.-]+\.trycloudflare\.com")
_NGROK_RE = re.compile(r"url=https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io)")
_BORE_RE = re.compile(r"listening at (bore\.pub:\d+)")
_LOCALTUNNEL_RE = re.compile(r"your url is: (https://[a-zA-Z0-9.-]+\.loca\.lt)")


def _extract_url(provider: str, line: str) -> str | None:
    """Extract public URL from a provider's stdout line."""
    if provider == "cloudflared":
        m = _CLOUDFLARED_RE.search(line)
        return m.group(0) if m else None
    elif provider == "ngrok":
        m = _NGROK_RE.search(line)
        if m:
            return m.group(0).replace("url=", "")
        return None
    elif provider == "bore":
        m = _BORE_RE.search(line)
        return f"http://{m.group(1)}" if m else None
    elif provider == "localtunnel":
        m = _LOCALTUNNEL_RE.search(line)
        return m.group(1) if m else None
    return None


# ── Provider priority (no signup first) ─────────────────────────────

_TUNNEL_PROVIDERS = [
    ("cloudflared", _cloudflared_cmd),   # Free, no signup
    ("ngrok", _ngrok_cmd),               # Free tier, needs auth token
    ("bore", _bore_cmd),                 # Open source, needs bore server
    ("lt", _localtunnel_cmd),            # Free, npm-based
]
