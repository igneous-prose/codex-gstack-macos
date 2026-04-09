import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("github workflows", () => {
  it("uses current checkout/setup-node majors and least-privilege permissions in CI", () => {
    const ciWorkflow = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    expect(ciWorkflow).toContain("actions/checkout@v6");
    expect(ciWorkflow).toContain("actions/setup-node@v6");
    expect(ciWorkflow).toContain("permissions:\n  contents: read");
    expect(ciWorkflow).toContain("- run: npm run typecheck");
    expect(ciWorkflow).not.toContain("actions/checkout@v4");
    expect(ciWorkflow).not.toContain("actions/setup-node@v4");
  });

  it("uses the current checkout major and immutable release action pin in release workflow", () => {
    const releaseWorkflow = readFileSync(
      path.join(repoRoot, ".github", "workflows", "release.yml"),
      "utf8"
    );
    expect(releaseWorkflow).toContain("actions/checkout@v6");
    expect(releaseWorkflow).toContain(
      "softprops/action-gh-release@a06a81a03ee405af7f2048a818ed3f03bbf83c7b"
    );
    expect(releaseWorkflow).not.toContain("actions/checkout@v4");
    expect(releaseWorkflow).not.toContain("softprops/action-gh-release@v2");
  });

  it("keeps branch protection contexts aligned with CI jobs", () => {
    const configureGithub = readFileSync(
      path.join(repoRoot, "scripts", "configure-github.sh"),
      "utf8"
    );
    expect(configureGithub).toContain('"contexts": ["lint", "typecheck", "test", "security"]');
  });
});
