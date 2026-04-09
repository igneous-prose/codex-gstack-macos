# Browser Daemon

The browser daemon is local-only.

- bind host: `127.0.0.1`
- auth: bearer token required for command routes
- runtime state: `.codex-gstack/browser` and `.codex-gstack/logs`
- runtime permissions: owner-only for `.codex-gstack` directories and daemon state/log files
- writes allowed only under the target repo and `/tmp`
- allowed navigation targets: `http://` and `https://` only

Normal status output redacts the daemon token. Reveal it only through the explicit local `npm run browser:token -- --repo /path/to/target-repo` command.

The daemon intentionally omits:

- tunnels
- remote sharing
- remote pairing
- cross-agent browser control
- listeners on `0.0.0.0`
