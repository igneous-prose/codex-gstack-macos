# Contributing

## Local Development

```bash
bash scripts/bootstrap-macos.sh
npm run lint
npm run typecheck
npm run test
npm run security
```

## Rules

- Keep the product Codex-only and macOS-only.
- Do not add global Codex config edits or hook installers.
- Do not add telemetry, tunnels, or remote browser sharing.
- Keep cookie handling explicit and off the default path.

