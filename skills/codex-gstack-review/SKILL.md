# codex-gstack-review

Use this skill for code review in this repo shape.

## Workflow

1. Run `$HOME/.codex/gstack-macos/bin/gstack-workflow-review --repo /path/to/target-repo`.
2. If `planPath` is present, read `docs/gstack/<initiative-id>/plan.md` and review the branch against the saved implementation checklist and acceptance criteria.
3. If `fallbackMessage` is present, say you are falling back to branch-only review.
4. Run the repo checks after the plan-aware review pass.

## Review focus

- regressions
- security boundaries
- repo-local behavior
- forbidden host integrations
- browser auth and path validation
- current `plan.md` implementation checklist and acceptance criteria when an active initiative exists

## Commands

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-review --repo /path/to/target-repo
npm run lint
npm run test
npm run security
```
