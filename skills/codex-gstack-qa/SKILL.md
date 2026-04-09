# codex-gstack-qa

Use this skill to verify the local workflow end to end.

## Workflow

1. Run `$HOME/.codex/gstack-macos/bin/gstack-workflow-qa --repo /path/to/target-repo`.
2. If `planPath` is present, read `docs/gstack/<initiative-id>/plan.md` and validate the current implementation against the saved QA targets and user-facing expectations.
3. If `fallbackMessage` is present, say you are falling back to installation and branch-only verification.
4. Run the repo-local workflow and test checks.

## Checklist

1. Run `$HOME/.codex/gstack-macos/bin/gstack-workflow-qa --repo /path/to/target-repo`
2. Read `docs/gstack/<initiative-id>/plan.md` when available
3. Run `bash scripts/install-repo-local.sh /path/to/target-repo`
4. Run `bash scripts/doctor.sh /path/to/target-repo`
5. Run `npm run test`
6. Verify `.agents/skills`, `.codex-gstack`, and current plan artifacts stay aligned
