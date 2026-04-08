#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_root="$HOME/.agents/skills/codex-gstack-macos"

mkdir -p "$target_root"

for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  rm -rf "$target_root/$skill_name"
  cp -R "$skill_dir" "$target_root/$skill_name"
done

echo "Installed user-local namespaced skills into $target_root"

