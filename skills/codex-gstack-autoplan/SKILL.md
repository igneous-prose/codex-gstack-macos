# codex-gstack-autoplan

Use this skill to turn raw intent or an existing brief into a reviewed implementation plan.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-autoplan --repo /path/to/target-repo [--initiative-id <initiative-id>] [--input "<user intent>"]
```

## Workflow

1. Start from `docs/gstack/<initiative-id>/brief.md` when it already exists.
2. If no brief exists, create one first from the raw user intent.
3. Run the review pipeline in order:
   - `codex-gstack-plan-ceo-review`
   - `codex-gstack-plan-design-review` only when the work is user-facing
   - `codex-gstack-plan-eng-review`
4. Save the final plan to `docs/gstack/<initiative-id>/plan.md`.
5. Update `.codex-gstack/workflow/latest.json`.
6. Stop after persistence and offer the explicit implement-next handoff.

## Plan Requirements

- Clear summary of the wedge
- Review chain used
- Acceptance criteria
- Verification path
- Implement-next instruction that points back to the saved plan

## Rules

- Ask for confirmation before launching the full multi-step review chain
- Do not auto-implement after saving the plan
- Keep the plan concrete enough that another engineer or agent can execute it directly
