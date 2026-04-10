import { fileURLToPath } from "node:url";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("install-repo-local.sh", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("creates only repo-local runtime and skill directories in the target repo", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/install-repo-local.sh"), targetRepo], {
      cwd: repoRoot
    });

    expect(readdirSync(targetRepo).sort()).toEqual([".agents", ".codex-gstack", "docs"]);
    expect(readdirSync(path.join(targetRepo, ".agents", "skills")).sort()).toEqual([
      "codex-gstack-autoplan",
      "codex-gstack-browse",
      "codex-gstack-document-release",
      "codex-gstack-office-hours",
      "codex-gstack-plan",
      "codex-gstack-plan-ceo-review",
      "codex-gstack-plan-design-review",
      "codex-gstack-plan-eng-review",
      "codex-gstack-qa",
      "codex-gstack-retro",
      "codex-gstack-review",
      "codex-gstack-router",
      "codex-gstack-security-review",
      "codex-gstack-ship"
    ]);
    expect(readdirSync(path.join(targetRepo, ".codex-gstack")).sort()).toEqual([
      "bin",
      "browser",
      "logs",
      "runtime",
      "workflow"
    ]);
    expect(readdirSync(path.join(targetRepo, "docs")).sort()).toEqual(["gstack"]);
    expect(existsSync(path.join(targetRepo, ".codex-gstack", "runtime", "package.json"))).toBe(true);
    expect(existsSync(path.join(targetRepo, ".codex-gstack", "runtime", "src", "workflow", "cli.ts"))).toBe(true);
    expect(existsSync(path.join(targetRepo, ".codex-gstack", "runtime", "node_modules"))).toBe(true);
    expect(
      readFileSync(path.join(targetRepo, ".agents", "skills", "codex-gstack-office-hours", "SKILL.md"), "utf8")
    ).toContain("./.codex-gstack/bin/gstack-workflow-office-hours");
    expect(
      readFileSync(path.join(targetRepo, ".agents", "skills", "codex-gstack-office-hours", "SKILL.md"), "utf8")
    ).not.toContain("$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours");
  });

  it("can bootstrap repo-local AGENTS instructions that match the repo-local wrapper surface", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/install-repo-local.sh"), targetRepo], {
      cwd: repoRoot
    });
    execFileSync(
      "/bin/bash",
      [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo, "--install-mode", "repo-local"],
      {
        cwd: repoRoot
      }
    );

    const agents = readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8");
    expect(agents).toContain("./.codex-gstack/bin/gstack-workflow-office-hours");
    expect(agents).not.toContain("$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours");
  });

  it("installs repo-local wrappers that can run without global setup", { timeout: 20000 }, () => {
    const tempSourceParent = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-source-parent-"));
    const tempSourceRepo = path.join(tempSourceParent, "codex-gstack-source");
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(tempSourceParent, targetRepo);

    execFileSync("/bin/cp", ["-R", repoRoot, tempSourceRepo], {
      cwd: repoRoot
    });

    execFileSync("/bin/bash", [path.join(tempSourceRepo, "scripts", "install-repo-local.sh"), targetRepo], {
      cwd: tempSourceRepo
    });

    rmSync(tempSourceRepo, { force: true, recursive: true });

    const wrapperOutput = execFileSync(
      path.join(targetRepo, ".codex-gstack", "bin", "gstack-workflow-office-hours"),
      ["--repo", targetRepo, "--input", "I want to build a lean alert triage app"],
      {
        cwd: targetRepo,
        encoding: "utf8"
      }
    );

    expect(wrapperOutput).toContain("\"briefPath\"");
    expect(readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "latest.json"), "utf8")).toContain(
      "\"status\": \"briefed\""
    );
  });

  it("update-local preserves bootstrap mode while refreshing repo-local AGENTS instructions", { timeout: 20000 }, () => {
    const tempSourceParent = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-source-parent-"));
    const tempSourceRepo = path.join(tempSourceParent, "codex-gstack-source");
    const bareRemoteRepo = path.join(tempSourceParent, "codex-gstack-remote.git");
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(tempSourceParent, targetRepo);

    execFileSync("/bin/cp", ["-R", repoRoot, tempSourceRepo], {
      cwd: repoRoot
    });
    execFileSync("git", ["clone", "--bare", repoRoot, bareRemoteRepo], {
      cwd: repoRoot
    });
    execFileSync("git", ["-C", tempSourceRepo, "remote", "set-url", "origin", bareRemoteRepo], {
      cwd: repoRoot
    });

    writeFileSync(
      path.join(tempSourceRepo, "scripts", "bootstrap-macos.sh"),
      "#!/usr/bin/env bash\nset -euo pipefail\n",
      "utf8"
    );
    chmodSync(path.join(tempSourceRepo, "scripts", "bootstrap-macos.sh"), 0o755);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/install-repo-local.sh"), targetRepo], {
      cwd: repoRoot
    });
    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "optional", targetRepo], {
      cwd: repoRoot
    });

    const staleAgents = readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8");
    const staleBootstrapRecord = readFileSync(
      path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"),
      "utf8"
    );
    expect(staleAgents).toContain("Team bootstrap mode: optional");
    expect(staleAgents).toContain("$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours");
    expect(staleBootstrapRecord).toContain("\"mode\": \"optional\"");

    execFileSync("/bin/bash", [path.join(tempSourceRepo, "scripts", "update-local.sh"), "--target", targetRepo], {
      cwd: tempSourceRepo
    });

    const refreshedAgents = readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8");
    const refreshedBootstrapRecord = readFileSync(
      path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"),
      "utf8"
    );
    expect(refreshedAgents).toContain("Team bootstrap mode: optional");
    expect(refreshedAgents).toContain("./.codex-gstack/bin/gstack-workflow-office-hours");
    expect(refreshedAgents).not.toContain("$HOME/.codex/gstack-macos/bin/gstack-workflow-office-hours");
    expect(refreshedBootstrapRecord).toContain("\"mode\": \"optional\"");
    expect(refreshedBootstrapRecord).toContain("\"installMode\": \"repo-local\"");
  });
});
