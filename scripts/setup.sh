#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
host=""
team_mode="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host)
      host="${2:?missing host}"
      shift 2
      ;;
    --team)
      team_mode="true"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ "$host" != "codex" ]]; then
  echo "setup.sh currently supports only --host codex" >&2
  exit 1
fi

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
    echo "Run 'bash scripts/bootstrap-macos.sh' from the repo checkout before setup." >&2
    exit 1
  fi
done

codex_root="${HOME}/.codex"
skills_root="${codex_root}/skills"
install_root="${codex_root}/gstack-macos"
bin_root="${install_root}/bin"
runtime_root="${install_root}/runtime"
source_commit_sha="$(git -C "$repo_root" rev-parse HEAD 2>/dev/null || echo unknown)"
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

mkdir -p "$skills_root"
mkdir -p "$bin_root"
mkdir -p "$install_root/templates"
rm -rf "$runtime_root"
mkdir -p "$runtime_root"

for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  rm -rf "$skills_root/$skill_name"
  cp -R "$skill_dir" "$skills_root/$skill_name"
done

cp "$repo_root/scripts/bootstrap-repo.sh" "$bin_root/bootstrap-repo.sh"
chmod +x "$bin_root/bootstrap-repo.sh"
cp "$repo_root/templates/codex-agents-section.md" "$install_root/templates/codex-agents-section.md"
cp "$repo_root/templates/docs-gstack-readme.md" "$install_root/templates/docs-gstack-readme.md"
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

sed "s/__TEAM_MODE__/${team_mode}/g" \
  "$repo_root/templates/codex-project-instructions.md" \
  > "$install_root/CODEX_PROJECT_INSTRUCTIONS.md"

cat > "$install_root/install.json" <<EOF
{
  "host": "codex",
  "teamMode": ${team_mode},
  "runtimeRoot": "$(printf '%s' "$runtime_root")",
  "sourceCommitSha": "${source_commit_sha}",
  "installedSkills": [
$(for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  printf '    "%s"' "$skill_name"
  if [[ "$skill_dir" != "$(printf '%s\n' "$repo_root"/skills/* | tail -n 1)" ]]; then
    printf ','
  fi
  printf '\n'
done)
  ],
  "wrapperCommands": [
$(last_wrapper_command="${wrapper_commands[${#wrapper_commands[@]}-1]}"
for wrapper_command in "${wrapper_commands[@]}"; do
  printf '    "%s"' "gstack-workflow-$wrapper_command"
  if [[ "$wrapper_command" != "$last_wrapper_command" ]]; then
    printf ','
  fi
  printf '\n'
done)
  ]
}
EOF

echo "Installed Codex gstack skills into $skills_root"
echo "Installed portable workflow runtime into $runtime_root"
echo "Bootstrap helper installed at $bin_root/bootstrap-repo.sh"
echo "Project instructions written to $install_root/CODEX_PROJECT_INSTRUCTIONS.md"
