#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo="${1:-$repo_root}"

expected_skills=(
  codex-gstack-autoplan
  codex-gstack-browse
  codex-gstack-document-release
  codex-gstack-office-hours
  codex-gstack-plan
  codex-gstack-plan-ceo-review
  codex-gstack-plan-design-review
  codex-gstack-plan-eng-review
  codex-gstack-qa
  codex-gstack-retro
  codex-gstack-review
  codex-gstack-router
  codex-gstack-security-review
  codex-gstack-ship
)

cd "$repo_root"

[[ -f "$repo_root/package.json" ]] || { echo "Missing package.json" >&2; exit 1; }
[[ -d "$repo_root/skills" ]] || { echo "Missing skills/" >&2; exit 1; }
[[ -f "$repo_root/src/workflow/cli.ts" ]] || { echo "Missing src/workflow/cli.ts" >&2; exit 1; }
[[ -f "$repo_root/scripts/setup.sh" ]] || { echo "Missing scripts/setup.sh" >&2; exit 1; }
[[ -f "$repo_root/scripts/bootstrap-repo.sh" ]] || { echo "Missing scripts/bootstrap-repo.sh" >&2; exit 1; }
[[ -f "$repo_root/templates/codex-agents-section.md" ]] || { echo "Missing Codex AGENTS template" >&2; exit 1; }
[[ -f "$repo_root/templates/docs-gstack-readme.md" ]] || { echo "Missing docs/gstack template" >&2; exit 1; }
[[ -d "$target_repo/.codex-gstack" ]] || { echo "Missing $target_repo/.codex-gstack" >&2; exit 1; }
[[ -d "$target_repo/.codex-gstack/workflow" ]] || { echo "Missing $target_repo/.codex-gstack/workflow" >&2; exit 1; }
[[ -d "$target_repo/docs/gstack" ]] || { echo "Missing $target_repo/docs/gstack" >&2; exit 1; }

for skill_name in "${expected_skills[@]}"; do
  [[ -f "$repo_root/skills/$skill_name/SKILL.md" ]] || { echo "Missing shipped skill $skill_name" >&2; exit 1; }
  if [[ -d "$target_repo/.agents/skills" ]]; then
    [[ -f "$target_repo/.agents/skills/$skill_name/SKILL.md" ]] || { echo "Missing installed skill $skill_name" >&2; exit 1; }
  fi
done

grep -q "workflow:dispatch" "$repo_root/package.json" || { echo "Missing workflow:dispatch package script" >&2; exit 1; }
grep -q "gstack-workflow-dispatch" "$repo_root/skills/codex-gstack-router/SKILL.md" || {
  echo "Router skill must reference the installed dispatch wrapper command" >&2
  exit 1
}
grep -q "workflow-review" "$repo_root/skills/codex-gstack-review/SKILL.md" || {
  echo "Review skill must reference the review wrapper" >&2
  exit 1
}
grep -q "plan.md" "$repo_root/skills/codex-gstack-review/SKILL.md" || {
  echo "Review skill must reference the current plan artifact" >&2
  exit 1
}
grep -q "workflow-qa" "$repo_root/skills/codex-gstack-qa/SKILL.md" || {
  echo "QA skill must reference the QA wrapper" >&2
  exit 1
}
grep -q "plan.md" "$repo_root/skills/codex-gstack-qa/SKILL.md" || {
  echo "QA skill must reference the current plan artifact" >&2
  exit 1
}

if [[ -f "$target_repo/.codex-gstack/workflow/team-bootstrap.json" ]]; then
  [[ -f "$target_repo/AGENTS.md" ]] || { echo "Missing $target_repo/AGENTS.md" >&2; exit 1; }
  grep -q "<!-- codex-gstack:start -->" "$target_repo/AGENTS.md" || {
    echo "Missing codex-gstack AGENTS section" >&2
    exit 1
  }
  grep -q "gstack-workflow-dispatch" "$target_repo/AGENTS.md" || {
    echo "Bootstrapped AGENTS must reference the installed wrapper commands" >&2
    exit 1
  }
  grep -q "gstack-workflow-review" "$target_repo/AGENTS.md" || {
    echo "Bootstrapped AGENTS must reference the review wrapper command" >&2
    exit 1
  }
  grep -q "gstack-workflow-qa" "$target_repo/AGENTS.md" || {
    echo "Bootstrapped AGENTS must reference the QA wrapper command" >&2
    exit 1
  }
fi

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
