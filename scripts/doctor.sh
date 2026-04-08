#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo="${1:-$repo_root}"

expected_skills=(
  codex-gstack-browse
  codex-gstack-document-release
  codex-gstack-plan
  codex-gstack-qa
  codex-gstack-review
  codex-gstack-security-review
  codex-gstack-ship
)

cd "$repo_root"

[[ -f "$repo_root/package.json" ]] || { echo "Missing package.json" >&2; exit 1; }
[[ -d "$repo_root/skills" ]] || { echo "Missing skills/" >&2; exit 1; }
[[ -d "$target_repo/.codex-gstack" ]] || { echo "Missing $target_repo/.codex-gstack" >&2; exit 1; }

for skill_name in "${expected_skills[@]}"; do
  [[ -f "$repo_root/skills/$skill_name/SKILL.md" ]] || { echo "Missing shipped skill $skill_name" >&2; exit 1; }
  if [[ -d "$target_repo/.agents/skills" ]]; then
    [[ -f "$target_repo/.agents/skills/$skill_name/SKILL.md" ]] || { echo "Missing installed skill $skill_name" >&2; exit 1; }
  fi
done

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 1
fi

node scripts/check-security.mjs >/dev/null
echo "doctor: repo-local layout and security guards look good"
