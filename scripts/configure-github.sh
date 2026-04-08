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

gh api --method PATCH "repos/$repo/vulnerability-alerts" >/dev/null 2>&1 || true
gh api --method PUT "repos/$repo/automated-security-fixes" >/dev/null 2>&1 || true
gh api --method PATCH "repos/$repo" -F security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"},"dependabot_security_updates":{"status":"enabled"},"dependabot_alerts":{"status":"enabled"}}' >/dev/null 2>&1 || true

main_sha="$(gh api "repos/$repo/commits/main" --jq '.sha')"
combined_state="$(gh api "repos/$repo/commits/$main_sha/status" --jq '.state')"

if [[ "$combined_state" != "success" ]]; then
  echo "Main branch checks are not green yet; skipping branch protection." >&2
  exit 0
fi

gh api --method PUT "repos/$repo/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks.strict=true \
  -f enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null \
  -f required_linear_history=false \
  -f allow_force_pushes=false \
  -f allow_deletions=false \
  -f block_creations=false \
  -f required_conversation_resolution=false \
  -f lock_branch=false \
  -f allow_fork_syncing=false \
  -f required_status_checks.contexts[]='lint' \
  -f required_status_checks.contexts[]='test' \
  -f required_status_checks.contexts[]='security'

echo "Configured GitHub settings for $repo"

