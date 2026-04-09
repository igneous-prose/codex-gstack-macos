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

codex_root="${HOME}/.codex"
skills_root="${codex_root}/skills"
install_root="${codex_root}/gstack-macos"
bin_root="${install_root}/bin"
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

for skill_dir in "$repo_root"/skills/*; do
  skill_name="$(basename "$skill_dir")"
  rm -rf "$skills_root/$skill_name"
  cp -R "$skill_dir" "$skills_root/$skill_name"
done

cp "$repo_root/scripts/bootstrap-repo.sh" "$bin_root/bootstrap-repo.sh"
chmod +x "$bin_root/bootstrap-repo.sh"
cp "$repo_root/templates/codex-agents-section.md" "$install_root/templates/codex-agents-section.md"
cp "$repo_root/templates/docs-gstack-readme.md" "$install_root/templates/docs-gstack-readme.md"

for wrapper_command in "${wrapper_commands[@]}"; do
  wrapper_path="$bin_root/gstack-workflow-$wrapper_command"
  cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail

repo_root=$(printf '%q' "$repo_root")
cd "\$repo_root"
exec npm run workflow:$wrapper_command -- "\$@"
EOF
  chmod +x "$wrapper_path"
done

sed "s/__TEAM_MODE__/${team_mode}/g" \
  "$repo_root/templates/codex-project-instructions.md" \
  > "$install_root/CODEX_PROJECT_INSTRUCTIONS.md"

cat > "$install_root/install.json" <<EOF
{
  "host": "codex",
  "teamMode": ${team_mode},
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
echo "Bootstrap helper installed at $bin_root/bootstrap-repo.sh"
echo "Project instructions written to $install_root/CODEX_PROJECT_INSTRUCTIONS.md"
