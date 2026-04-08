# codex-gstack-qa

Use this skill to verify the local workflow end to end.

## Checklist

1. Run `bash scripts/install-repo-local.sh /path/to/target-repo`
2. Run `bash scripts/doctor.sh /path/to/target-repo`
3. Run `npm run test`
4. Verify `.agents/skills` and `.codex-gstack` stay repo-local

