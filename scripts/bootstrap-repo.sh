#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
shift || true
target_repo="$PWD"
install_mode="global"
target_repo_set=0

usage() {
  echo "Usage: bootstrap-repo.sh required|optional [target-repo] [--install-mode global|repo-local]" >&2
}

if [[ "$mode" != "required" && "$mode" != "optional" ]]; then
  usage
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-mode)
      if [[ $# -lt 2 ]]; then
        usage
        exit 1
      fi
      install_mode="$2"
      shift 2
      ;;
    *)
      if [[ "$target_repo_set" -eq 0 ]]; then
        target_repo="$1"
        target_repo_set=1
        shift
      else
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ "$install_mode" != "global" && "$install_mode" != "repo-local" ]]; then
  echo "Unsupported install mode: $install_mode" >&2
  usage
  exit 1
fi

mkdir -p "$target_repo/docs/gstack"
mkdir -p "$target_repo/.codex-gstack/workflow"

if [[ ! -f "$target_repo/docs/gstack/README.md" ]]; then
  cp "$repo_root/templates/docs-gstack-readme.md" "$target_repo/docs/gstack/README.md"
fi

cat > "$target_repo/.codex-gstack/workflow/team-bootstrap.json" <<EOF
{
  "host": "codex",
  "mode": "$mode",
  "installMode": "$install_mode",
  "bootstrappedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

section_start='<!-- codex-gstack:start -->'
section_end='<!-- codex-gstack:end -->'
workflow_bin='$HOME/.codex/gstack-macos/bin/'
if [[ "$install_mode" == "repo-local" ]]; then
  workflow_bin='./.codex-gstack/bin/'
fi
rendered_section="$(sed \
  -e "s/__MODE__/$mode/g" \
  -e "s|__WORKFLOW_BIN__|$workflow_bin|g" \
  "$repo_root/templates/codex-agents-section.md")"
tmp_file="$(mktemp)"

if [[ -f "$target_repo/AGENTS.md" ]]; then
  awk -v start="$section_start" -v end="$section_end" '
    $0 == start { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' "$target_repo/AGENTS.md" > "$tmp_file"
else
  : > "$tmp_file"
fi

if [[ -s "$tmp_file" ]]; then
  printf '\n' >> "$tmp_file"
fi

printf '%s\n' "$rendered_section" >> "$tmp_file"
mv "$tmp_file" "$target_repo/AGENTS.md"

echo "Bootstrapped Codex gstack workflow in $target_repo"
