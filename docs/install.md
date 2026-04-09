# Install

## Repo-local install

Use repo-local install when you want the skill pack copied into a target repo.

```bash
bash scripts/install-repo-local.sh /path/to/target-repo
```

This creates only:

- `/path/to/target-repo/.agents/skills`
- `/path/to/target-repo/.codex-gstack`
- `/path/to/target-repo/docs/gstack`

## Codex setup and team bootstrap

Use this path when you want the Codex-first workflow with a global skill install and repo bootstrap.

```bash
bash scripts/setup.sh --host codex
bash scripts/bootstrap-repo.sh required /path/to/target-repo
```

Team mode installs the skills into `~/.codex/skills`, installs the repo bootstrap helper under `~/.codex/gstack-macos/bin`, and writes a reusable project instructions file to `~/.codex/gstack-macos/CODEX_PROJECT_INSTRUCTIONS.md`.

## Optional user-local install

```bash
bash scripts/install-user-local.sh
```

This copies the shipped skills into `$HOME/.agents/skills/codex-gstack-macos` and does not edit `~/.codex/config.toml` or any hook path.
