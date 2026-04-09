import { fileURLToPath } from "node:url";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
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

  it("installs the Codex skill pack and bootstrap helper", () => {
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
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-route"))).toBe(true);
    expect(existsSync(path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-status"))).toBe(true);
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "CODEX_PROJECT_INSTRUCTIONS.md"), "utf8")
    ).toContain("gstack-workflow-route");
    expect(
      readFileSync(path.join(fakeHome, ".codex", "gstack-macos", "install.json"), "utf8")
    ).toContain("gstack-workflow-autoplan");
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
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-route");
    expect(readFileSync(path.join(targetRepo, "AGENTS.md"), "utf8")).toContain("gstack-workflow-status");
    expect(readFileSync(path.join(targetRepo, "docs", "gstack", "README.md"), "utf8")).toContain(
      "brief.md"
    );
    expect(
      readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "team-bootstrap.json"), "utf8")
    ).toContain("\"mode\": \"required\"");

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/doctor.sh"), targetRepo], {
      cwd: repoRoot
    });
  });

  it("installs wrapper commands that can reach the workflow engine", () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-home-"));
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    tempDirs.push(fakeHome, targetRepo);

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/setup.sh"), "--host", "codex"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: fakeHome
      }
    });

    const wrapperOutput = execFileSync(
      path.join(fakeHome, ".codex", "gstack-macos", "bin", "gstack-workflow-office-hours"),
      ["--repo", targetRepo, "--input", "I want to build a lean alert triage app"],
      {
        cwd: repoRoot,
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
