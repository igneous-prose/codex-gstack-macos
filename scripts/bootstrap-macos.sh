#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "bootstrap-macos.sh supports only macOS" >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "bootstrap-macos.sh supports only Apple Silicon (arm64)" >&2
  exit 1
fi

npm ci
npx playwright install chromium
npm run typecheck
npm run test
npm run security

