using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;

namespace AiEvaluator;

/// <summary>
/// Tunnel local agents to the internet so the cloud engine can reach them.
/// Uses cloudflared (trycloudflare.com, no signup) as primary,
/// falls back to ngrok, bore, or localtunnel.
/// </summary>
public class TunnelException : Exception
{
    public TunnelException(string message) : base(message) { }
}

public class Tunnel : IDisposable
{
    private Process? _process;
    public string? PublicUrl { get; private set; }

    private static readonly Dictionary<string, (Func<string, int, string[]> Command, Func<string, string?> ExtractUrl)> Providers = new()
    {
        ["cloudflared"] = (
            (bin, port) => new[] { bin, "tunnel", "--url", $"http://localhost:{port}" },
            line => Regex.Match(line, @"https://[a-zA-Z0-9.-]+\.trycloudflare\.com").Value is { Length: > 0 } m ? m : null
        ),
        ["ngrok"] = (
            (bin, port) => new[] { bin, "http", port.ToString(), "--log=stdout" },
            line =>
            {
                var m = Regex.Match(line, @"url=https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io)");
                return m.Success ? m.Value.Replace("url=", "") : null;
            }
        ),
        ["bore"] = (
            (bin, port) => new[] { bin, "local", port.ToString(), "--to", "bore.pub" },
            line =>
            {
                var m = Regex.Match(line, @"listening at (bore\.pub:\d+)");
                return m.Success ? $"http://{m.Groups[1].Value}" : null;
            }
        ),
        ["lt"] = (
            (bin, port) => new[] { bin, "--port", port.ToString() },
            line =>
            {
                var m = Regex.Match(line, @"your url is: (https://[a-zA-Z0-9.-]+\.loca\.lt)");
                return m.Success ? m.Groups[1].Value : null;
            }
        ),
    };

    public static bool IsLocalUrl(string url)
    {
        return url.Contains("localhost") ||
               url.Contains("127.0.0.1") ||
               url.Contains("0.0.0.0") ||
               url.Contains("192.168.") ||
               url.Contains("10.");
    }

    public static int? ExtractPort(string url)
    {
        var m = Regex.Match(url, @":(\d+)");
        return m.Success && int.TryParse(m.Groups[1].Value, out var port) ? port : null;
    }

    /// <summary>
    /// Start a tunnel to the given local port. Returns the public URL.
    /// </summary>
    public string Start(int localPort)
    {
        var errors = new List<string>();
        foreach (var (binary, (command, extractUrl)) in Providers)
        {
            var binPath = FindInPath(binary);
            if (binPath == null) continue;

            try
            {
                var url = TryProvider(binPath, localPort, command, extractUrl);
                if (url != null)
                {
                    PublicUrl = url;
                    return url;
                }
            }
            catch (Exception ex)
            {
                errors.Add($"{binary}: {ex.Message}");
                Stop();
            }
        }

        throw new TunnelException(
            "No tunnel tool found. Install one:\n" +
            "  macOS:  brew install cloudflared\n" +
            "  Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared\n" +
            "  Or:     brew install ngrok && ngrok config add-authtoken <token>");
    }

    private string? TryProvider(
        string binPath, int localPort,
        Func<string, int, string[]> commandBuilder,
        Func<string, string?> extractUrl)
    {
        var args = commandBuilder(binPath, localPort);
        var psi = new ProcessStartInfo
        {
            FileName = args[0],
            RedirectStandardOutput = true,
            RedirectStandardError = false,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var arg in args.Skip(1))
            psi.ArgumentList.Add(arg);

        var process = new Process { StartInfo = psi };
        var urlFound = new TaskCompletionSource<string?>();
        var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));

        process.OutputDataReceived += (_, e) =>
        {
            if (e.Data != null)
            {
                var url = extractUrl(e.Data);
                if (url != null)
                    urlFound.TrySetResult(url);
            }
        };

        process.Start();
        process.BeginOutputReadLine();
        _process = process;

        var completed = Task.WhenAny(urlFound.Task, Task.Delay(Timeout.Infinite, cts.Token)).Result;
        if (completed == urlFound.Task && urlFound.Task.IsCompletedSuccessfully)
        {
            cts.Cancel(); // Don't timeout
            return urlFound.Task.Result;
        }

        Stop();
        return null;
    }

    /// <summary>
    /// Stop the tunnel process.
    /// </summary>
    public void Stop()
    {
        if (_process is { HasExited: false })
        {
            try
            {
                if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
                    _process.Kill();
                else
                    _process.Kill(true); // SIGTERM on Unix
                _process.WaitForExit(5000);
                if (!_process.HasExited)
                    _process.Kill();
            }
            catch
            {
                // Process already gone
            }
        }
        _process = null;
    }

    public void Dispose()
    {
        Stop();
        GC.SuppressFinalize(this);
    }

    private static string? FindInPath(string name)
    {
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        var separator = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? ';' : ':';
        var extensions = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? new[] { ".exe", ".cmd", ".bat", "" }
            : new[] { "" };

        foreach (var dir in pathEnv.Split(separator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var ext in extensions)
            {
                var fullPath = Path.Combine(dir, name + ext);
                if (File.Exists(fullPath))
                    return fullPath;
            }
        }
        return null;
    }
}
