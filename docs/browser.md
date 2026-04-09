# Browser Daemon

The browser daemon is local-only.

- bind host: `127.0.0.1`
- auth: bearer token required for command routes
- runtime state: `.codex-gstack/browser` and `.codex-gstack/logs`
- runtime permissions: owner-only for `.codex-gstack` directories and daemon state/log files
- writes allowed only under the target repo and `/tmp`
- command routes authenticate before JSON body parsing
- JSON request bodies on command routes are capped at `64 KiB`
- allowed navigation targets: `http://` and `https://` only
- blocked by default: localhost/loopback targets and literal wildcard, private-network, or local-scope IP targets, including local/private IPv6 literals
- localhost access: allowed only when the page command includes `--allow-localhost`

Normal status output redacts the daemon token. Reveal it only through the explicit local `npm run browser:token -- --repo /path/to/target-repo` command.

The daemon intentionally omits:

- tunnels
- remote sharing
- remote pairing
- cross-agent browser control
- listeners on `0.0.0.0`
