# codex-gstack-plan-eng-review

Use this skill to lock architecture, data flow, edge cases, and tests before implementation.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-plan-eng-review --repo /path/to/target-repo [--initiative-id <initiative-id>]
```

## Review Focus

- Data flow and integration points
- Failure modes and rollback shape
- Persistence, parsing, messaging, or security-sensitive behavior
- Acceptance criteria and test coverage expectations
- What could regress if the plan is implemented carelessly

## Output

- Update the Engineering Review section in `docs/gstack/<initiative-id>/plan.md`
- Make the plan execution-ready and explicit about verification
