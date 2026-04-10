<!-- codex-gstack:start -->
## codex-gstack

This repo uses the Codex-first gstack workflow. Team bootstrap mode: __MODE__.

Route freeform workflow requests through `codex-gstack-router`, which should run `__WORKFLOW_BIN__gstack-workflow-dispatch --repo <target-repo> --input "<user request>"`.
Use `codex-gstack-office-hours`, which should run `__WORKFLOW_BIN__gstack-workflow-office-hours --repo <target-repo> --input "<reframed user intent>"`.
Use `codex-gstack-autoplan`, which should run `__WORKFLOW_BIN__gstack-workflow-autoplan --repo <target-repo> [--initiative-id <id>] [--input "<user intent>"]`.
Use `__WORKFLOW_BIN__gstack-workflow-review --repo <target-repo>` before `codex-gstack-review` so review has the active plan context.
Use `__WORKFLOW_BIN__gstack-workflow-qa --repo <target-repo>` before `codex-gstack-qa` so QA has the active plan context.
Use `__WORKFLOW_BIN__gstack-workflow-ship --repo <target-repo>` before `codex-gstack-ship` so ship handoff sees the active plan context.

Available workflow skills: `codex-gstack-router`, `codex-gstack-office-hours`, `codex-gstack-autoplan`, `codex-gstack-plan-ceo-review`, `codex-gstack-plan-design-review`, `codex-gstack-plan-eng-review`, `codex-gstack-retro`, `codex-gstack-review`, `codex-gstack-qa`, `codex-gstack-ship`, `codex-gstack-browse`, `codex-gstack-document-release`, `codex-gstack-security-review`, `codex-gstack-plan`.

Workflow artifacts live under `docs/gstack/<initiative-id>/`.
Machine state lives under `.codex-gstack/workflow/`.
<!-- codex-gstack:end -->
