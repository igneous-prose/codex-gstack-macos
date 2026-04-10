import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("setup and bootstrap", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("installs the Codex skill pack and bootstrap helper", { timeout: 20000 }, () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-home-"));
    tempDirs.push(fakeHome);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/setup.sh"), "--host", "codex", "--team"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: fakeHome
      }
    });

    const codexSkillsDir = path.join(fakeHome, ".codex", "skills");
    expect(readdirSync(codexSkillsDir).sort()).toEqual([
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

    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "bootstrap-repo.sh"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "runtime", "package.json"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "runtime", "src", "workflow", "cli.ts"))).toBe(
      true
    );
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "runtime", "node_modules"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-dispatch"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-status"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-review"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-qa"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-ship"))).toBe(true);
    const dispatchWrapper = readFileSync(
      path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-dispatch"),
      "utf8"
    );
    expect(dispatchWrapper).toContain('runtime_root="$(cd "$script_dir/../runtime" && pwd)"');
    expect(dispatchWrapper).not.toContain(repoRoot);
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "CODEX_PROJECT_INSTRUCTIONS.md"), "utf8")
    ).toContain("gstack-workflow-dispatch");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "CODEX_PROJECT_INSTRUCTIONS.md"), "utf8")
    ).toContain("gstack-workflow-ship");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "install.json"), "utf8")
    ).toContain("gstack-workflow-review");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "install.json"), "utf8")
    ).toContain("gstack-workflow-ship");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "install.json"), "utf8")
    ).toContain("\"runtimeRoot\":");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "install.json"), "utf8")
    ).toContain("\"sourceCommitSha\":");
  });

  it("bootstraps a repo with workflow docs, runtime metadata, and AGENTS routing", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync(
      "/bin/bash",
      [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo],
      {
        cwd: repoRoot
      }
    );

    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("codex-gstack-router");
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-dispatch");
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-review");
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-qa");
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-ship");
    expect(readFileSync(path.join(targetRepo, "docs", "gstack", "README.md"), "utf8")).toContain(
      "brief.md"
    );
    expect(
      readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"), "utf8")
    ).toContain("\"mode\": \"required\"");
    expect(
      readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"), "utf8")
    ).toContain("\"installMode\": \"global\"");

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/doctor.sh"), targetRepo], {
      cwd: repoRoot
    });
  });

  it("bootstraps repo-local AGENTS routing with repo-local wrapper paths", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync(
      "/bin/bash",
      [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo, "--install-mode", "repo-local"],
      {
        cwd: repoRoot
      }
    );

    const agents = readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8");
    expect(agents).toContain("./.codex-gstack/bin/gstack-workflow-dispatch");
    expect(agents).toContain("./.codex-gstack/bin/gstack-workflow-ship");
    expect(agents).not.toContain("$HOME/.codex/gstack-macos/bin/gstack-workflow-dispatch");
    expect(
      readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"), "utf8")
    ).toContain("\"installMode\": \"repo-local\"");
  });

  it("doctor rejects a global bootstrap whose AGENTS section points at repo-local wrappers", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo], {
      cwd: repoRoot
    });

    writeFileSync(
      path.join(targetRepo, "AGENTS.md"),
      readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8").replaceAll(
        "$HOME/.codex/gstack-macos/bin/",
        "./.codex-gstack/bin/"
      ),
      "utf8"
    );

    expect(() => {
      execFileSync("/bin/bash", [path.join(repoRoot, "scripts/doctor.sh"), targetRepo], {
        cwd: repoRoot,
        stdio: "pipe"
      });
    }).toThrow(/installMode=global/);
  });

  it("doctor rejects a repo-local bootstrap whose AGENTS section points at global wrappers", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync(
      "/bin/bash",
      [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo, "--install-mode", "repo-local"],
      {
        cwd: repoRoot
      }
    );

    writeFileSync(
      path.join(targetRepo, "AGENTS.md"),
      readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8").replaceAll(
        "./.codex-gstack/bin/",
        "$HOME/.codex/gstack-macos/bin/"
      ),
      "utf8"
    );

    expect(() => {
      execFileSync("/bin/bash", [path.join(repoRoot, "scripts/doctor.sh"), targetRepo], {
        cwd: repoRoot,
        stdio: "pipe"
      });
    }).toThrow(/installMode=repo-local/);
  });

  it("doctor rejects a repo-local bootstrap whose AGENTS section only contains .codex-gstack/bin as part of an absolute path", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(targetRepo);

    execFileSync(
      "/bin/bash",
      [path.join(repoRoot, "scripts/bootstrap-repo.sh"), "required", targetRepo, "--install-mode", "repo-local"],
      {
        cwd: repoRoot
      }
    );

    writeFileSync(
      path.join(targetRepo, "AGENTS.md"),
      readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8").replaceAll(
        "./.codex-gstack/bin/",
        "/tmp/xcodex-gstack/bin/"
      ),
      "utf8"
    );

    expect(() => {
      execFileSync("/bin/bash", [path.join(repoRoot, "scripts/doctor.sh"), targetRepo], {
        cwd: repoRoot,
        stdio: "pipe"
      });
    }).toThrow(/must use \.\/\.codex-gstack\/bin\//);
  });

  it("installs wrapper commands that can reach the workflow engine after the source checkout is removed", { timeout: 20000 }, () => {
    const tempSourceParent = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-source-parent-"));
    const tempSourceRepo = path.join(tempSourceParent, "codex-gstack-source");
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-home-"));
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(tempSourceParent, fakeHome, targetRepo);

    execFileSync("/bin/cp", ["-R", repoRoot, tempSourceRepo], {
      cwd: repoRoot
    });

    execFileSync("/bin/bash", [path.join(tempSourceRepo, "scripts", "setup.sh"), "--host", "codex"], {
      cwd: tempSourceRepo,
      env: {
        ...process.env,
        HOME: fakeHome
      }
    });

    rmSync(tempSourceRepo, { force: true, recursive: true });

    const wrapperOutput = execFileSync(
      path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-office-hours"),
      ["--repo", targetRepo, "--input", "I want to build a lean alert triage app"],
      {
        cwd: targetRepo,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: fakeHome
        }
      }
    );

    expect(wrapperOutput).toContain("\"briefPath\"");
    expect(readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "latest.json"), "utf8")).toContain(
      "\"status\": \"briefed\""
    );
  });
});
