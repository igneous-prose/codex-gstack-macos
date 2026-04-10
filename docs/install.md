# Install

## Repo-local install

Use repo-local install when you want the skill pack copied into a target repo.

```bash
bash scripts/install-repo-local.sh /path/to/target-repo
bash scripts/bootstrap-repo.sh required /path/to/target-repo --install-mode repo-local
```

This creates only:

- `/path/to/target-repo/.agents/skills`
- `/path/to/target-repo/.codex-gstack`
- `/path/to/target-repo/docs/gstack`
- `/path/to/target-repo/.codex-gstack/bin`
- `/path/to/target-repo/.codex-gstack/runtime`

Repo-local install is self-sufficient. Installed repo-local skills and bootstrapped repo instructions invoke `./.codex-gstack/bin/gstack-workflow-*`.

## Codex setup and team bootstrap

Use this path when you want the Codex-first workflow with a global skill install and repo bootstrap.

```bash
bash scripts/setup.sh --host codex
bash scripts/bootstrap-repo.sh required /path/to/target-repo --install-mode global
```

Team mode installs the skills into `~/.codex/skills`, installs a portable workflow runtime under `~/.codex/gstack-macos/runtime`, installs the repo bootstrap helper under `~/.codex/gstack-macos/bin`, and writes a reusable project instructions file to `~/.codex/gstack-macos/CODEX_PROJECT_INSTRUCTIONS.md`.
