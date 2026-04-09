# codex-gstack-macos

`codex-gstack-macos` is a private, Codex-only, macOS-only workflow kit for local repo skills and a localhost-only browser daemon.

## Boundaries

- Supported hosts: Codex CLI and Codex app only
- Supported platform: Apple Silicon macOS only
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
npm run browser:screenshot -- --repo /path/to/target-repo --url https://example.com --output /tmp/example.png
npm run browser:snapshot -- --repo /path/to/target-repo --url https://example.com --output /tmp/example.html
npm run browser:snapshot -- --repo /path/to/target-repo --url http://localhost:3000 --allow-localhost --output /tmp/local-dev.html
npm run browser:cookies:list -- --browser chrome
npm run browser:cookies:import -- --repo /path/to/target-repo --browser chrome --domain example.com
```

`browser:status` redacts the daemon token. Use `browser:token` only when you intentionally need to reveal it for a local call. Page capture commands accept `http://` and `https://` URLs only, block literal wildcard, private-network, and local-scope IP targets, and require `--allow-localhost` for local dev servers.

See [docs/install.md](docs/install.md), [docs/browser.md](docs/browser.md), and [docs/cookie-import.md](docs/cookie-import.md).
