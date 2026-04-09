import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("github workflows", () => {
  it("uses node24-based checkout and setup-node majors in CI", () => {
    const ciWorkflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    expect(ciWorkflow).toContain("actions/checkout@v6");
    expect(ciWorkflow).toContain("actions/setup-node@v6");
    expect(ciWorkflow).not.toContain("actions/checkout@v4");
    expect(ciWorkflow).not.toContain("actions/setup-node@v4");
  });

  it("uses the current checkout major in release workflow", () => {
    const releaseWorkflow = readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8"
    );
    expect(releaseWorkflow).toContain("actions/checkout@v6");
    expect(releaseWorkflow).not.toContain("actions/checkout@v4");
  });
});
