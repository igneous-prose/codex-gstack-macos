# codex-gstack-retro

Use this skill to close the loop after a planning or implementation sprint.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-retro --repo /path/to/target-repo --summary "<retro summary>" --learning "pattern::guidance"
```

## Workflow

1. Read the latest workflow state from `.codex-gstack/workflow/latest.json`.
2. Summarize outcomes, friction, and what should change next time.
3. Write `docs/gstack/<initiative-id>/retro.md`.
4. Update `.codex-gstack/workflow/learnings.json` with project-local learnings.
5. Leave the learnings in a form that `codex-gstack-office-hours` and `codex-gstack-autoplan` can reuse.

## Learning Format

- Pattern
- Guidance
- Why it matters in this repo

## Rules

- Keep learnings project-local in v1
- Focus on reusable guidance, not a changelog of every action taken
