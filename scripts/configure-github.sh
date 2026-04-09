#!/usr/bin/env bash
set -euo pipefail

repo=""
summary=()

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

record_summary() {
  summary+=("$1=$2")
}

print_summary() {
  printf 'GitHub configuration summary for %s\n' "$repo"
  for entry in "${summary[@]}"; do
    printf '  %s\n' "$entry"
  done
}

is_plan_limit_error() {
  grep -q "Upgrade to GitHub Pro or make this repository public to enable this feature." <<<"$1"
}

is_feature_unavailable_error() {
  grep -q "is not available for this repository." <<<"$1"
}

run_gh_api_feature() {
  local feature="$1"
  shift

  local output=""
  local status=0
  set +e
  output="$(gh api "$@" 2>&1)"
  status=$?
  set -e

  if [[ $status -eq 0 ]]; then
    record_summary "$feature" "enabled"
    return 0
  fi

  if is_plan_limit_error "$output"; then
    record_summary "$feature" "skipped(plan limit)"
    return 0
  fi

  if is_feature_unavailable_error "$output"; then
    record_summary "$feature" "skipped(feature unavailable)"
    return 0
  fi

  record_summary "$feature" "failed"
  echo "$output" >&2
  return 1
}

gh api --method PATCH "repos/$repo" >/dev/null \
  -f default_branch='main' \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -F delete_branch_on_merge=true
record_summary "repo-settings" "enabled"

run_gh_api_feature "vulnerability-alerts" --method PUT "repos/$repo/vulnerability-alerts"
run_gh_api_feature "automated-security-fixes" --method PUT "repos/$repo/automated-security-fixes"

security_payload="$(mktemp)"
cat >"$security_payload" <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" },
    "dependabot_security_updates": { "status": "enabled" }
  }
}
JSON
run_gh_api_feature "security-and-analysis" --method PATCH "repos/$repo" --input "$security_payload"
rm -f "$security_payload"

latest_ci_conclusion="$(gh run list --repo "$repo" --workflow CI --branch main --limit 1 --json conclusion --jq '.[0].conclusion // ""')"

if [[ "$latest_ci_conclusion" != "success" ]]; then
  record_summary "branch-protection" "skipped(ci not green)"
  print_summary
  echo "Main branch checks are not green yet; skipping branch protection." >&2
  exit 0
fi

protection_payload="$(mktemp)"
cat >"$protection_payload" <<'JSON'
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
run_gh_api_feature "branch-protection" --method PUT "repos/$repo/branches/main/protection" \
  -H "Accept: application/vnd.github+json" \
  --input "$protection_payload"
rm -f "$protection_payload"

print_summary
echo "Configured GitHub settings for $repo"
