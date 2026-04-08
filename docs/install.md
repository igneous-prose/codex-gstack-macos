# Install

## Repo-local install

Use repo-local install by default.

```bash
bash scripts/install-repo-local.sh /path/to/target-repo
```

This creates only:

- `/path/to/target-repo/.agents/skills`
- `/path/to/target-repo/.codex-gstack`

## Optional user-local install

```bash
bash scripts/install-user-local.sh
```

This copies the shipped skills into `$HOME/.agents/skills/codex-gstack-macos` and does not edit `~/.codex/config.toml`, any global `AGENTS.md`, or any hook path.

