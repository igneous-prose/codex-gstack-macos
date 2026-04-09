# codex-gstack-ship

Use this skill to prepare a local change for GitHub.

## Rules

- keep `main` protected
- prefer squash merge
- require green `lint`, `test`, and `security`
- use explicit tags for releases

## Commands

```bash
if [[ -x "$HOME/.codex/gstack-macos/bin/gstack-workflow-ship" ]]; then
  "$HOME/.codex/gstack-macos/bin/gstack-workflow-ship" --repo /path/to/target-repo
fi
bash scripts/configure-github.sh --repo igneous-prose/codex-gstack-macos
```
