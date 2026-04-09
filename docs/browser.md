# Browser Daemon

The browser daemon is local-only.

- bind host: `127.0.0.1`
- auth: bearer token required for command routes
- runtime state: `.codex-gstack/browser` and `.codex-gstack/logs`
- persisted daemon state excludes the host, port, and bearer token; verified connection details come from the live daemon process metadata instead
- manual port override: pass `--port <port>` to `browser:start` when you need to avoid a derived-port collision; other daemon commands can discover the running daemon automatically and also accept `--port` as an explicit port match check
- runtime permissions: owner-only for `.codex-gstack` directories and daemon state/log files
- writes allowed only under the target repo and `/tmp`
- command routes authenticate before JSON body parsing
- JSON request bodies on command routes are capped at `64 KiB`
- allowed navigation targets: `http://` and `https://` only
- blocked by default: localhost/loopback targets and literal wildcard, private-network, local-scope IP targets, and hostnames that resolve to those targets, including local/private IPv6 literals
- localhost access: allowed only when the page command includes `--allow-localhost`
- hostname policy: if hostname resolution cannot be completed, the request is rejected rather than allowed
- redirect policy: redirected request targets are revalidated against the same network policy during capture

Normal status output redacts the daemon token. Reveal it only through the explicit local `npm run browser:token -- --repo /path/to/target-repo` command.

If the daemon PID is still alive but the CLI cannot verify its live connection metadata, `browser:status` reports `status: "restart-required"`, `daemonState.port: null`, and `connectionVerified: false`, plus the restart message. In that state, rerun `npm run browser:stop -- --repo /path/to/target-repo` and then `npm run browser:start -- --repo /path/to/target-repo`. `browser:status --port <port>` also fails closed until the daemon can be verified again.

The daemon intentionally omits:

- tunnels
- remote sharing
- remote pairing
- cross-agent browser control
- listeners on `0.0.0.0`
