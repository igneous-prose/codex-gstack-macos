# codex-gstack-plan

Use this skill to keep the Codex-first planning flow pointed at the current brief and plan artifacts.

## Workflow

1. Prefer `codex-gstack-office-hours` when the request starts as raw user intent.
2. Prefer `codex-gstack-autoplan` when the user wants a reviewed implementation plan.
3. Keep the resulting brief and plan under `docs/gstack/<initiative-id>/`.
4. Stay plan-first unless the user explicitly asks to implement next.

## Commands

```bash
npm run doctor -- /path/to/target-repo
```
