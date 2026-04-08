import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("security guards", () => {
  it("passes static guard checks", () => {
    expect(() =>
      execFileSync(process.execPath, [path.join(repoRoot, "scripts", "check-security.mjs")], {
        cwd: repoRoot,
        stdio: "pipe"
      })
    ).not.toThrow();
  });
});
