// Package tunnel exposes local agents to the internet.
// Uses cloudflared (trycloudflare.com, no signup) as primary,
// falls back to ngrok, bore, or localtunnel.
package tunnel

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"time"
)

// IsLocalURL checks if a URL points to localhost or a private network.
func IsLocalURL(url string) bool {
	return regexp.MustCompile(`(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)`).MatchString(url)
}

// ExtractPort extracts a port number from a URL like http://localhost:8047/path.
func ExtractPort(url string) int {
	re := regexp.MustCompile(`:(\d+)`)
	m := re.FindStringSubmatch(url)
	if len(m) < 2 {
		return 0
	}
	var port int
	fmt.Sscanf(m[1], "%d", &port)
	return port
}

// TunnelError is returned when a tunnel cannot be started.
type TunnelError struct {
	Message string
}

func (e *TunnelError) Error() string {
	return e.Message
}

// ── URL extractors ─────────────────────────────────────────────────

var cloudflaredRe = regexp.MustCompile(`https://[a-zA-Z0-9.-]+\.trycloudflare\.com`)
var ngrokRe = regexp.MustCompile(`url=https://[a-zA-Z0-9.-]+\.ngrok(?:-free)?\.(?:app|io)`)
var boreRe = regexp.MustCompile(`listening at (bore\.pub:\d+)`)
var localtunnelRe = regexp.MustCompile(`your url is: (https://[a-zA-Z0-9.-]+\.loca\.lt)`)

type provider struct {
	binary      string
	command     func(bin string, port int) []string
	extractURL  func(line string) string
}

var providers = []provider{
	{
		binary: "cloudflared",
		command: func(bin string, port int) []string {
			return []string{bin, "tunnel", "--url", fmt.Sprintf("http://localhost:%d", port)}
		},
		extractURL: func(line string) string {
			return cloudflaredRe.FindString(line)
		},
	},
	{
		binary: "ngrok",
		command: func(bin string, port int) []string {
			return []string{bin, "http", fmt.Sprintf("%d", port), "--log=stdout"}
		},
		extractURL: func(line string) string {
			m := ngrokRe.FindString(line)
			if m == "" {
				return ""
			}
			return regexp.MustCompile(`url=`).ReplaceAllString(m, "")
		},
	},
	{
		binary: "bore",
		command: func(bin string, port int) []string {
			return []string{bin, "local", fmt.Sprintf("%d", port), "--to", "bore.pub"}
		},
		extractURL: func(line string) string {
			m := boreRe.FindStringSubmatch(line)
			if len(m) < 2 {
				return ""
			}
			return "http://" + m[1]
		},
	},
	{
		binary: "lt",
		command: func(bin string, port int) []string {
			return []string{bin, "--port", fmt.Sprintf("%d", port)}
		},
		extractURL: func(line string) string {
			m := localtunnelRe.FindStringSubmatch(line)
			if len(m) < 2 {
				return ""
			}
			return m[1]
		},
	},
}

// Tunnel manages a public tunnel to a local port.
type Tunnel struct {
	cmd       *exec.Cmd
	PublicURL string
}

// Start starts a tunnel and returns the public URL.
func New() *Tunnel {
	return &Tunnel{}
}

// Start starts a tunnel and returns the public URL.
func (t *Tunnel) Start(localPort int) (string, error) {
	for _, p := range providers {
		binPath, err := exec.LookPath(p.binary)
		if err != nil {
			continue
		}

		url, err := t.tryProvider(binPath, localPort, p)
		if err != nil {
			t.Stop()
			continue
		}
		if url != "" {
			t.PublicURL = url
			return url, nil
		}
	}

	return "", &TunnelError{
		Message: "No tunnel tool found. Install one:\n" +
			"  macOS:  brew install cloudflared\n" +
			"  Linux:  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared\n" +
			"  Or:     brew install ngrok && ngrok config add-authtoken <token>",
	}
}

func (t *Tunnel) tryProvider(binPath string, localPort int, p provider) (string, error) {
	args := p.command(binPath, localPort)
	cmd := exec.Command(args[0], args[1:]...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to capture stdout: %w", err)
	}
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start tunnel: %w", err)
	}
	t.cmd = cmd

	// Read lines with 15-second timeout
	scanner := bufio.NewScanner(stdout)
	urlCh := make(chan string, 1)
	errCh := make(chan error, 1)

	go func() {
		for scanner.Scan() {
			line := scanner.Text()
			if url := p.extractURL(line); url != "" {
				urlCh <- url
				return
			}
		}
		if err := scanner.Err(); err != nil {
			errCh <- err
		}
	}()

	select {
	case url := <-urlCh:
		return url, nil
	case err := <-errCh:
		return "", err
	case <-time.After(15 * time.Second):
		return "", &TunnelError{Message: "Tunnel did not provide a public URL within 15 seconds"}
	}
}

// Stop terminates the tunnel process.
func (t *Tunnel) Stop() {
	if t.cmd != nil && t.cmd.Process != nil {
		t.cmd.Process.Signal(os.Interrupt)
		done := make(chan struct{})
		go func() {
			t.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.cmd.Process.Kill()
		}
		t.cmd = nil
	}
}
