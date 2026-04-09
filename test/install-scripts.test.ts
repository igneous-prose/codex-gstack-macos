import { fileURLToPath } from "node:url";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
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
      "browser",
      "logs",
      "workflow"
    ]);
    expect(readdirSync(path.join(targetRepo, "docs")).sort()).toEqual(["gstack"]);
  });
});
