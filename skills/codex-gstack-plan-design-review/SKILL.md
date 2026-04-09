# codex-gstack-plan-design-review

Use this skill for user-facing initiatives that need UX and product quality pressure before implementation.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-plan-design-review --repo /path/to/target-repo [--initiative-id <initiative-id>]
```

## Review Focus

- Interaction clarity
- User-visible polish
- AI slop detection
- Missing UX assumptions
- Whether the plan explains what “good” looks like for the first shipped version

## Rules

- Skip this review when the initiative is backend-only, API-only, CLI-only, or otherwise not user-facing
- Update `docs/gstack/<initiative-id>/plan.md` with a Design Review section instead of creating a second standalone artifact
