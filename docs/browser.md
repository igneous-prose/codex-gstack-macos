# Browser Daemon

The browser daemon is local-only.

- bind host: `127.0.0.1`
- auth: bearer token required for command routes
- runtime state: `.codex-gstack/browser` and `.codex-gstack/logs`
- writes allowed only under the target repo and `/tmp`

The daemon intentionally omits:

- tunnels
- remote sharing
- remote pairing
- cross-agent browser control
- listeners on `0.0.0.0`

