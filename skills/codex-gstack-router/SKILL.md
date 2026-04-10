# codex-gstack-router

Use this skill to route freeform Codex requests into the right gstack workflow stage.

## Command

```bash
$HOME/.codex/gstack-macos/bin/gstack-workflow-dispatch --repo /path/to/target-repo --input "<user request>"
```

## Routing

- Route vague product ideas, rambling thoughts, and exploratory requests to `codex-gstack-office-hours`
- Route explicit planning requests to `codex-gstack-autoplan`
- Route changed branches and implementation audits to `codex-gstack-review`
- Route browser verification and app walkthroughs to `codex-gstack-qa` or `codex-gstack-browse`
- Route release requests through `gstack-workflow-ship` first, then hand off to `codex-gstack-ship`
- Route retrospectives and learnings capture to `codex-gstack-retro`

## Rules

- Do not force simple direct execution work through the planning workflow
- Ask for confirmation before launching a multi-step route such as `codex-gstack-autoplan`
- Run the dispatch command first, inspect the returned JSON, then invoke the suggested workflow command when it is present
- If `suggestedCommand` is `null`, hand off directly to the suggested skill
- Read the latest workflow state from `.codex-gstack/workflow/latest.json` when present
- Keep tracked workflow outputs under `docs/gstack/<initiative-id>/`
