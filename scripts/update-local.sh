#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      target_repo="${2:?missing target path}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

cd "$repo_root"
git pull --ff-only
bash scripts/bootstrap-macos.sh

if [[ -n "$target_repo" ]]; then
  bootstrap_mode="required"
  team_bootstrap_path="$target_repo/.codex-gstack/workflow/team-bootstrap.json"

  if [[ -f "$team_bootstrap_path" ]]; then
    bootstrap_mode="$(
      node -e '
const fs = require("node:fs");
const targetPath = process.argv[1];
const record = JSON.parse(fs.readFileSync(targetPath, "utf8"));
if (record.mode !== "required" && record.mode !== "optional") {
  console.error(`Unsupported bootstrap mode in ${targetPath}: ${record.mode}`);
  process.exit(1);
}
process.stdout.write(record.mode);
' "$team_bootstrap_path"
    )"
  fi

  bash scripts/install-repo-local.sh "$target_repo"
  bash scripts/bootstrap-repo.sh "$bootstrap_mode" "$target_repo" --install-mode repo-local
fi
