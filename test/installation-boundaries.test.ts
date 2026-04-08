import { fileURLToPath } from "node:url";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("installation boundaries", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("does not modify user-level Codex config during repo-local install", () => {
    const fakeHome = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-home-"));
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-target-"));
    const fakeCodexDir = path.join(fakeHome, ".codex");
    const fakeAgentsDir = path.join(fakeHome, ".agents");
    tempDirs.push(fakeHome, targetRepo);

    mkdirSync(fakeCodexDir, { recursive: true });
    mkdirSync(fakeAgentsDir, { recursive: true });

    writeFileSync(path.join(fakeHome, ".codex", "config.toml"), "unchanged = true\n", {
      encoding: "utf8",
      flag: "wx"
    });
    writeFileSync(path.join(fakeAgentsDir, "AGENTS.md"), "# global\n", {
      encoding: "utf8",
      flag: "wx"
    });

    execFileSync("/bin/bash", [path.join(repoRoot, "scripts/install-repo-local.sh"), targetRepo], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: fakeHome
      }
    });

    expect(readFileSync(path.join(fakeCodexDir, "config.toml"), "utf8")).toBe("unchanged = true\n");
    expect(readFileSync(path.join(fakeAgentsDir, "AGENTS.md"), "utf8")).toBe("# global\n");
  });
});
