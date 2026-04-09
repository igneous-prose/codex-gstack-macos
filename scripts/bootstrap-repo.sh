#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
target_repo="${2:-$PWD}"

if [[ "$mode" != "required" && "$mode" != "optional" ]]; then
  echo "Usage: bootstrap-repo.sh required|optional [target-repo]" >&2
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
  "bootstrappedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

section_start='<!-- codex-gstack:start -->'
section_end='<!-- codex-gstack:end -->'
rendered_section="$(sed "s/__MODE__/$mode/g" "$repo_root/templates/codex-agents-section.md")"
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
