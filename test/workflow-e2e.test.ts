import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getWorkflowPaths,
  readLatestWorkflowState,
  readProjectLearnings,
  recordRetro,
  runAutoplan,
  startOfficeHoursWorkflow
} from "../src/workflow/artifacts.js";
import { classifyWorkflowIntent } from "../src/workflow/router.js";

describe("workflow e2e", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("persists brief, plan, retro, and learnings across the workflow loop", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-e2e-"));
    tempDirs.push(targetRepo);

    const routeDecision = classifyWorkflowIntent(
      "I want to build a customer dashboard and I am still dumping thoughts"
    );
    expect(routeDecision.route).toBe("office-hours");

    const officeHours = startOfficeHoursWorkflow(
      targetRepo,
      "I want to build a customer dashboard that cuts triage time for support leads.",
      new Date("2026-04-09T10:00:00.000Z")
    );
    expect(readFileSync(officeHours.briefPath, "utf8")).toContain("## User Intent");

    const autoplan = runAutoplan(targetRepo, {
      initiativeId: officeHours.initiativeId,
      now: new Date("2026-04-09T10:10:00.000Z")
    });
    expect(autoplan.reviewSequence).toEqual([
      "plan-ceo-review",
      "plan-design-review",
      "plan-eng-review"
    ]);
    expect(readFileSync(autoplan.planPath, "utf8")).toContain("## Implement Next");
    expect(autoplan.implementNextMessage).toContain("docs/gstack");

    const retro = recordRetro(targetRepo, {
      initiativeId: officeHours.initiativeId,
      summary: "The plan worked better when the wedge stayed narrow.",
      learnings: [
        {
          pattern: "Start from the narrow wedge",
          guidance: "Do not expand scope until the first operator path is working."
        }
      ],
      now: new Date("2026-04-09T10:20:00.000Z")
    });
    expect(readFileSync(retro.retroPath, "utf8")).toContain("## Learnings");
    expect(readProjectLearnings(targetRepo)).toHaveLength(1);
    expect(readLatestWorkflowState(targetRepo)?.status).toBe("retrospective");

    const nextOfficeHours = startOfficeHoursWorkflow(
      targetRepo,
      "I want to build the follow-up operator workflow for the same dashboard.",
      new Date("2026-04-10T10:00:00.000Z")
    );
    expect(readFileSync(nextOfficeHours.briefPath, "utf8")).toContain("Start from the narrow wedge");
    expect(getWorkflowPaths(targetRepo, nextOfficeHours.initiativeId).briefPath).toBe(nextOfficeHours.briefPath);
  });
});
