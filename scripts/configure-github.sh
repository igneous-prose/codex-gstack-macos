#!/usr/bin/env bash
set -euo pipefail

repo=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo="${2:?missing repo}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$repo" ]]; then
  echo "--repo owner/name is required" >&2
  exit 1
fi

required_contexts='["lint","test","security"]'

gh api --method PATCH "repos/$repo" \
  -f default_branch='main' \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true

gh api --method PUT "repos/$repo/vulnerability-alerts" >/dev/null 2>&1 || true
gh api --method PUT "repos/$repo/automated-security-fixes" >/dev/null 2>&1 || true
gh api --method PATCH "repos/$repo" --input - >/dev/null 2>&1 <<'JSON' || true
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" },
    "dependabot_security_updates": { "status": "enabled" }
  }
}
JSON

latest_ci_conclusion="$(gh run list --repo "$repo" --workflow CI --branch main --limit 1 --json conclusion --jq '.[0].conclusion // ""')"

if [[ "$latest_ci_conclusion" != "success" ]]; then
  echo "Main branch checks are not green yet; skipping branch protection." >&2
  exit 0
fi

gh api --method PUT "repos/$repo/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "test", "security"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo "Configured GitHub settings for $repo"
