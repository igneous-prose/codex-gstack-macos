#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_repo="${1:-$PWD}"
bin_root="$target_repo/.codex-gstack/bin"
runtime_root="$target_repo/.codex-gstack/runtime"
wrapper_commands=(
  dispatch
  route
  office-hours
  autoplan
  plan-ceo-review
  plan-design-review
  plan-eng-review
  retro
  status
  review
  qa
  ship
)

required_runtime_paths=(
  "$repo_root/package.json"
  "$repo_root/package-lock.json"
  "$repo_root/tsconfig.json"
  "$repo_root/src"
  "$repo_root/node_modules"
)

for required_path in "${required_runtime_paths[@]}"; do
  if [[ ! -e "$required_path" ]]; then
    echo "Missing required runtime input: $required_path" >&2
    echo "Run 'bash scripts/bootstrap-macos.sh' from the repo checkout before repo-local install." >&2
    exit 1
  fi
done

mkdir -p "$target_repo/.agents/skills"
mkdir -p "$target_repo/.codex-gstack/browser"
mkdir -p "$bin_root"
mkdir -p "$target_repo/.codex-gstack/logs"
rm -rf "$runtime_root"
mkdir -p "$runtime_root"
mkdir -p "$target_repo/.codex-gstack/workflow"
mkdir -p "$target_repo/docs/gstack"

for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  rm -rf "$target_repo/.agents/skills/$skill_name"
  cp -R "$skill_dir" "$target_repo/.agents/skills/$skill_name"
  skill_path="$target_repo/.agents/skills/$skill_name/SKILL.md"
  if [[ -f "$skill_path" ]]; then
    perl -0pi -e 's{\$HOME/\.codex/gstack-macos/bin/}{./.codex-gstack/bin/}g' "$skill_path"
  fi
done

cp "$repo_root/package.json" "$runtime_root/package.json"
cp "$repo_root/package-lock.json" "$runtime_root/package-lock.json"
cp "$repo_root/tsconfig.json" "$runtime_root/tsconfig.json"
cp -R "$repo_root/src" "$runtime_root/src"
cp -R "$repo_root/node_modules" "$runtime_root/node_modules"

for wrapper_command in "${wrapper_commands[@]}"; do
  wrapper_path="$bin_root/gstack-workflow-$wrapper_command"
  cat > "$wrapper_path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runtime_root="$(cd "$script_dir/../runtime" && pwd)"
cd "$runtime_root"
exec npm run workflow:__WORKFLOW_COMMAND__ -- "$@"
EOF
  perl -0pi -e "s/__WORKFLOW_COMMAND__/$wrapper_command/g" "$wrapper_path"
  chmod +x "$wrapper_path"
done

if [[ ! -f "$target_repo/docs/gstack/README.md" ]]; then
  cp "$repo_root/templates/docs-gstack-readme.md" "$target_repo/docs/gstack/README.md"
fi

echo "Installed repo-local skills into $target_repo/.agents/skills"
echo "Installed repo-local workflow wrappers into $bin_root"
echo "Installed repo-local workflow runtime into $runtime_root"
