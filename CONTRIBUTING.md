# Contributing

## Local Development

```bash
bash scripts/bootstrap-macos.sh
npm run lint
npm run typecheck
npm run test
npm run security
```

## Git Workflow

- Branch from `main` using a short-lived `codex/*` branch for each cohesive change.
- Open a PR back to `main` for review; do not stack unrelated work into the same PR.
- Keep code, tests, and docs aligned in the same change when browser/network boundaries move.

## Rules

- Keep the product Codex-only and macOS-only.
- Do not add global Codex config edits or hook installers.
- Do not add telemetry, tunnels, or remote browser sharing.
- Keep cookie handling explicit and off the default path.
