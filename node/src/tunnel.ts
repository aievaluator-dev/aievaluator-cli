/**
 * Tunnel local agents to the internet so the cloud engine can reach them.
 *
 * Uses cloudflared (trycloudflare.com, no signup) as primary,
 * falls back to ngrok, bore, or localtunnel.
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface, ReadLineOptions } from 'readline';
import { platform } from 'os';
import { EOL } from 'os';

/** Check if a URL points to localhost or a private network. */
export function isLocalUrl(url: string): boolean {
  return (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('0.0.0.0') ||
    url.includes('192.168.') ||
    url.includes('10.')
  );
}

/** Extract port number from a URL like http://localhost:8047/path. */
export function extractPort(url: string): number | null {
  const m = url.match(/:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export class TunnelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TunnelError';
  }
}

// ── Regex patterns ─────────────────────────────────────────────────

const CLOUDFLARED_RE = /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/;
const NGROK_RE = /url=https:\/\/[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io)/;
const BORE_RE = /listening at (bore\.pub:\d+)/;
const LOCALTUNNEL_RE = /your url is: (https:\/\/[a-zA-Z0-9.-]+\.loca\.lt)/;

// ── Provider definitions ───────────────────────────────────────────

interface Provider {
  binary: string;
  command(bin: string, port: number): string[];
  extractUrl(line: string): string | null;
}

const PROVIDERS: Provider[] = [
  {
    binary: 'cloudflared',
    command: (bin, port) => [bin, 'tunnel', '--url', `http://localhost:${port}`],
    extractUrl: (line) => CLOUDFLARED_RE.exec(line)?.[0] ?? null,
  },
  {
    binary: 'ngrok',
    command: (bin, port) => [bin, 'http', String(port), '--log=stdout'],
    extractUrl: (line) => {
      const m = NGROK_RE.exec(line);
      return m ? m[0].replace('url=', '') : null;
    },
  },
  {
    binary: 'bore',
    command: (bin, port) => [bin, 'local', String(port), '--to', 'bore.pub'],
    extractUrl: (line) => {
      const m = BORE_RE.exec(line);
      return m ? `http://${m[1]}` : null;
    },
  },
  {
    binary: 'lt',
    command: (bin, port) => [bin, '--port', String(port)],
    extractUrl: (line) => {
      const m = LOCALTUNNEL_RE.exec(line);
      return m ? m[1] : null;
    },
  },
];

// ── Which helper (no dependency) ────────────────────────────────────

function whichSync(name: string): string | null {
  // Simple PATH lookup
  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(platform() === 'win32' ? ';' : ':');
  const extensions = platform() === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of dirs) {
    for (const ext of extensions) {
      const fullPath = `${dir}/${name}${ext}`;
      try {
        require('fs').accessSync(fullPath, require('fs').constants.X_OK);
        return fullPath;
      } catch {
        // Not here
      }
    }
  }
  return null;
}

// ── Tunnel class ───────────────────────────────────────────────────

export class Tunnel {
  private process: ChildProcess | null = null;
  publicUrl: string | null = null;

  /**
   * Start a tunnel and return the public URL.
   * Throws TunnelError if no provider is available or timeout.
   */
  start(localPort: number): Promise<string> {
    return this._tryProviders(localPort);
  }

  /** Stop the tunnel process. */
  stop(): void {
    if (this.process && this.process.exitCode === null) {
      try {
        if (platform() === 'win32') {
          this.process.kill();
        } else {
          // Kill the process group on Unix
          const pid = this.process.pid;
          if (pid) {
            process.kill(-pid, 'SIGTERM');
            // Give it 5s then SIGKILL
            setTimeout(() => {
              try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ }
            }, 5000).unref();
          }
        }
      } catch {
        // Process already gone
      }
    }
    this.process = null;
  }

  /** Async dispose (for `await using`). */
  async [Symbol.asyncDispose](): Promise<void> {
    this.stop();
  }

  private async _tryProviders(localPort: number): Promise<string> {
    const errors: string[] = [];

    for (const provider of PROVIDERS) {
      const binPath = whichSync(provider.binary);
      if (!binPath) continue;

      try {
        const url = await this._tryProvider(binPath, localPort, provider);
        if (url) return url;
      } catch (e) {
        errors.push(`${provider.binary}: ${(e as Error).message}`);
        this.stop();
      }
    }

    throw new TunnelError(
      'No tunnel tool found. Install one:\n' +
        '  macOS:  brew install cloudflared\n' +
        '  Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared\n' +
        '  Or:     brew install ngrok && ngrok config add-authtoken <token>',
    );
  }

  private _tryProvider(
    binPath: string,
    localPort: number,
    provider: Provider,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const args = provider.command(binPath, localPort);
      const cmd = args[0];
      const cmdArgs = args.slice(1);

      const child = spawn(cmd, cmdArgs, {
        stdio: ['ignore', 'pipe', 'ignore'],
        detached: platform() !== 'win32',
      });

      this.process = child;

      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.stop();
          reject(new TunnelError('Tunnel did not provide a public URL within 15 seconds'));
        }
      }, 15000);

      const rl = createInterface({ input: child.stdout! });

      rl.on('line', (line: string) => {
        if (settled) return;
        const url = provider.extractUrl(line);
        if (url) {
          settled = true;
          clearTimeout(timeout);
          rl.close();
          this.publicUrl = url;
          resolve(url);
        }
      });

      child.on('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.stop();
          reject(new TunnelError(`Tunnel process exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          this.stop();
          reject(new TunnelError(`Failed to start tunnel: ${err.message}`));
        }
      });
    });
  }
}
