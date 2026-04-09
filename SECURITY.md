# Security Policy

## Scope

This project supports only local use on Apple Silicon macOS with Codex CLI and Codex app.

## Security Boundaries

- Browser daemon binds to `127.0.0.1` only.
- Every browser command endpoint requires a bearer token except `/health`.
- Browser output writes are limited to the target repo root and `/tmp`.
- Runtime state is local-only under `.codex-gstack/` and should remain owner-readable only.
- `.codex-gstack`, `.codex-gstack/browser`, and `.codex-gstack/logs` are treated as sensitive local state.
- Cookie import is explicit, user-invoked, and disabled by default.
- Cookie imports must not persist plaintext exports into repo state.
- Browser navigation is limited to `http://` and `https://` URLs.
- Browser network policy blocks literal and hostname-resolved private, loopback, and local-scope targets by default.
- Hostname validation fails closed when DNS policy resolution cannot be completed.
- Redirected request targets are revalidated against the same network policy during capture.
- `browser:status` redacts the daemon token; token disclosure requires an explicit local command.
- The repo ships no telemetry, no remote sharing, and no global hook installation.

## Reporting

Report security issues privately through the GitHub repository security workflow if enabled. Do not open public issues that contain local cookie material, auth tokens, or filesystem paths you do not intend to disclose.
