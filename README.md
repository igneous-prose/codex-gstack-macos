# codex-gstack-macos

`codex-gstack-macos` is a Codex-only, macOS-only workflow kit for local repo skills and a localhost-only browser daemon.

## Boundaries

- Supported hosts: Codex CLI and Codex app only
- Supported platform: Apple Silicon macOS only
- Repository visibility does not change the runtime exposure: the tool remains local-only even if the repo is public
- Repo-local install first via `.agents/skills/*`
- Runtime state only under `.codex-gstack/` inside the target repo
- No Claude integration
- No global Codex config edits
- No telemetry, ngrok, remote sharing, or background self-update paths
- Cookie import is explicit, manual, and off by default

## Quick Start

```bash
bash scripts/bootstrap-macos.sh
bash scripts/install-repo-local.sh /path/to/target-repo
bash scripts/doctor.sh /path/to/target-repo
```

## Browser Commands

```bash
npm run browser:start -- --repo /path/to/target-repo
npm run browser:status -- --repo /path/to/target-repo
npm run browser:token -- --repo /path/to/target-repo
npm run browser:status -- --repo /path/to/target-repo --port 50123
npm run browser:screenshot -- --repo /path/to/target-repo --url https://example.com --output /tmp/example.png
npm run browser:screenshot -- --repo /path/to/target-repo --port 50123 --url https://example.com --output /tmp/example.png
npm run browser:snapshot -- --repo /path/to/target-repo --url https://example.com --output /tmp/example.html
npm run browser:snapshot -- --repo /path/to/target-repo --url http://localhost:3000 --allow-localhost --output /tmp/local-dev.html
npm run browser:cookies:list -- --browser chrome
npm run browser:cookies:import -- --repo /path/to/target-repo --browser chrome --domain example.com
```

`browser:status` redacts the daemon token. Use `browser:token` only when you intentionally need to reveal it for a local call. The persisted daemon state file no longer stores the connection host, port, or bearer token. If two repos collide on the same derived daemon port, start the daemon with an explicit `--port` value for that repo. Later daemon-interacting commands discover the running daemon automatically, and they also accept `--port` when you want an explicit port match check. Page capture commands accept `http://` and `https://` URLs only, block literal wildcard, private-network, and local-scope IP targets, require `--allow-localhost` for local dev servers, fail closed when hostname policy resolution cannot be completed, and revalidate redirected request targets against the same network policy.

See [docs/install.md](docs/install.md), [docs/browser.md](docs/browser.md), and [docs/cookie-import.md](docs/cookie-import.md).
