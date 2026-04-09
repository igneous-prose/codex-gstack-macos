# codex-gstack-office-hours

Use this skill as the canonical “talk naturally / dump thoughts” entrypoint.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours --repo /path/to/target-repo --input "<reframed user intent>"
```

## Workflow

1. Let the user describe the idea in raw, unstructured language.
2. Reframe the problem before talking about implementation.
3. Extract users, pain, wedge, constraints, and success criteria.
4. Read project-local learnings from `.codex-gstack/workflow/learnings.json` when present.
5. Create `docs/gstack/<initiative-id>/brief.md`.
6. Update `.codex-gstack/workflow/latest.json` so downstream planning skills can pick up the latest brief.

## Required Brief Sections

- User Intent
- Problem Framing
- Success Criteria
- Constraints
- Remembered Learnings
- Next Step

## Rules

- Stay plan-first; do not implement code from this skill
- Prefer the smallest useful wedge that can ship and teach something real
- Point the user to `codex-gstack-autoplan` after the brief is saved
