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
  bash scripts/install-repo-local.sh "$target_repo"
fi

