# Codex Project Instructions

Install host: `codex`
Team mode: `__TEAM_MODE__`

Use the installed gstack router for workflow-stage requests:

- `codex-gstack-router` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-route`
- `codex-gstack-office-hours` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours` and writes `docs/gstack/<initiative-id>/brief.md`
- `codex-gstack-autoplan` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-autoplan` and writes `docs/gstack/<initiative-id>/plan.md`
- `codex-gstack-retro` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-retro` and updates project-local learnings
- `codex-gstack-review` and `codex-gstack-qa` must run `$HOME/.codex/gstack-macos/bin/gstack-workflow-status` and read the current `plan.md` before fallback checks

Repository bootstrap uses `scripts/bootstrap-repo.sh required|optional`.
