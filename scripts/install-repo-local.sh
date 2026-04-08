#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo="${1:-$PWD}"

mkdir -p "$target_repo/.agents/skills"
mkdir -p "$target_repo/.codex-gstack/browser"
mkdir -p "$target_repo/.codex-gstack/logs"

for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  rm -rf "$target_repo/.agents/skills/$skill_name"
  cp -R "$skill_dir" "$target_repo/.agents/skills/$skill_name"
done

echo "Installed repo-local skills into $target_repo/.agents/skills"

