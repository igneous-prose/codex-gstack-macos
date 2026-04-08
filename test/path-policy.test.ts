import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { validateOutputPath } from "../src/browser/path-policy.js";

describe("path policy", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("allows repo-local writes", () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-repo-"));
    tempDirs.push(repoRoot);
    const outputPath = validateOutputPath(repoRoot, path.join(repoRoot, "artifacts", "shot.png"));
    expect(outputPath).toMatch(/artifacts\/shot\.png$/);
  });

  it("allows writes to /tmp", () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-repo-"));
    tempDirs.push(repoRoot);
    const outputPath = validateOutputPath(repoRoot, path.join("/tmp", "codex-gstack-shot.png"));
    expect(outputPath).toBe(path.join(realpathSync("/tmp"), "codex-gstack-shot.png"));
  });

  it("rejects paths outside the repo and /tmp", () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-repo-"));
    tempDirs.push(repoRoot);
    expect(() => validateOutputPath(repoRoot, path.join(os.homedir(), "Desktop", "shot.png"))).toThrow(
      /approved paths/
    );
  });

  it("rejects symlink escapes", () => {
    const repoRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-repo-"));
    const outsideRoot = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-outside-"));
    tempDirs.push(repoRoot, outsideRoot);

    mkdirSync(path.join(repoRoot, "safe"), { recursive: true });
    symlinkSync(outsideRoot, path.join(repoRoot, "safe", "escape"));

    expect(() =>
      validateOutputPath(repoRoot, path.join(repoRoot, "safe", "escape", "shot.png"))
    ).toThrow(/approved paths/);
  });
});
