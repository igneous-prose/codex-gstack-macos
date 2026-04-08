# Security Policy

## Scope

This project supports only local use on Apple Silicon macOS with Codex CLI and Codex app.

## Security Boundaries

- Browser daemon binds to `127.0.0.1` only.
- Every browser command endpoint requires a bearer token except `/health`.
- Browser output writes are limited to the target repo root and `/tmp`.
- Runtime state is local-only under `.codex-gstack/`.
- Cookie import is explicit, user-invoked, and disabled by default.
- Cookie imports must not persist plaintext exports into repo state.
- The repo ships no telemetry, no remote sharing, and no global hook installation.

## Reporting

Report security issues privately through the GitHub repository security workflow if enabled. Do not open public issues that contain local cookie material, auth tokens, or filesystem paths you do not intend to disclose.

