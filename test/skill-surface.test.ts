import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("skill surface", () => {
  it("ships exactly the v1 codex-only skill set", () => {
    expect(
      readdirSync(path.join(repoRoot, "skills"))
        .filter((entry) => !entry.startsWith("."))
        .sort()
    ).toEqual([
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
  });
});
