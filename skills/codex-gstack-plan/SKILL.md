# codex-gstack-plan

Use this skill as a compatibility alias for the newer Codex-first planning flow.

## Workflow

1. Prefer `codex-gstack-office-hours` when the request starts as raw user intent.
2. Prefer `codex-gstack-autoplan` when the user wants a reviewed implementation plan.
3. Keep the resulting brief and plan under `docs/gstack/<initiative-id>/`.
4. Stay plan-first unless the user explicitly asks to implement next.

## Commands

```bash
npm run doctor -- /path/to/target-repo
```
