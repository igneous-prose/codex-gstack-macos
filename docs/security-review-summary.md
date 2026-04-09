# Security Review Summary

This summary reflects the current hardening state of `codex-gstack-macos`.

## Current boundaries

- Browser daemon binds to `127.0.0.1` only and requires a bearer token for command routes.
- Runtime state lives only under `.codex-gstack/` and is treated as owner-only local state.
- Normal daemon status output redacts the token; explicit token disclosure requires a separate local command.
- Browser output writes are restricted to the target repo root and `/tmp`.
- Browser page navigation is restricted to `http://` and `https://` URLs.
- Cookie import remains explicit, manual, and off the default path.
- Cookie helper execution uses pinned macOS system binaries: `/usr/bin/sqlite3` and `/usr/bin/security`.
- The repo still avoids telemetry, global Codex config edits, tunnels, and remote browser sharing.

## Notes

- The earlier GitHub Actions Node 20 deprecation warning is no longer current after the workflow upgrade to `actions/checkout@v6` and `actions/setup-node@v6`.
- Branch protection and some GitHub security features remain subject to GitHub account-plan limits on the private repository.
