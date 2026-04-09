# Codex Project Instructions

Install host: `codex`
Team mode: `__TEAM_MODE__`

Use the installed gstack router for workflow-stage requests:

- `codex-gstack-router` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-dispatch`
- `codex-gstack-office-hours` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours` and writes `docs/gstack/<initiative-id>/brief.md`
- `codex-gstack-autoplan` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-autoplan` and writes `docs/gstack/<initiative-id>/plan.md`
- `codex-gstack-retro` runs `$HOME/.codex/gstack-macos/bin/gstack-workflow-retro` and updates project-local learnings
- `codex-gstack-review` must run `$HOME/.codex/gstack-macos/bin/gstack-workflow-review` before lint/test/security
- `codex-gstack-qa` must run `$HOME/.codex/gstack-macos/bin/gstack-workflow-qa` before install/doctor/test fallback checks
- `codex-gstack-ship` should run `$HOME/.codex/gstack-macos/bin/gstack-workflow-ship` before release/PR handoff

Repository bootstrap uses `scripts/bootstrap-repo.sh required|optional`.
