import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  PRIVATE_DIRECTORY_MODE,
  PRIVATE_FILE_MODE
} from "../src/browser/config.js";
import {
  applyBriefSnapshotSection,
  applyCeoReview,
  applyEngReview,
  appendProjectLearnings,
  buildInitiativeId,
  createPlanDocument,
  ensureWorkflowLayout,
  getWorkflowPaths,
  inferInitiativeTitle,
  readPlanSection,
  readLatestWorkflowState,
  readProjectLearnings,
  readRouterState,
  readTeamBootstrapRecord,
  slugify,
  updateExecutedReviewSequence,
  updatePlanSection,
  writeLatestWorkflowState,
  writeRouterState,
  writeTeamBootstrapRecord
} from "../src/workflow/artifacts.js";

describe("workflow artifacts", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("derives stable initiative ids and paths", () => {
    expect(slugify("Daily Briefing App")).toBe("daily-briefing-app");
    expect(inferInitiativeTitle("i want to build a daily briefing app")).toBe(
      "I Want To Build A Daily Briefing App"
    );
    expect(buildInitiativeId("Daily Briefing App", new Date("2026-04-09T10:00:00.000Z"))).toBe(
      "20260409-daily-briefing-app"
    );
  });

  it("creates docs and runtime layout with private workflow state files", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-workflow-"));
    tempDirs.push(targetRepo);

    const workflowPaths = ensureWorkflowLayout(targetRepo, "20260409-daily-briefing-app");
    writeLatestWorkflowState(targetRepo, {
      initiativeId: "20260409-daily-briefing-app",
      title: "Daily Briefing App",
      status: "briefed",
      briefPath: workflowPaths.briefPath,
      updatedAt: "2026-04-09T10:00:00.000Z"
    });
    writeRouterState(targetRepo, {
      route: "autoplan",
      suggestedSkill: "codex-gstack-autoplan",
      suggestedCommand: "/tmp/gstack-workflow-autoplan",
      requiresConfirmation: true,
      initiativeId: "20260409-daily-briefing-app",
      reason: "planning request",
      updatedAt: "2026-04-09T10:00:00.000Z"
    });
    writeTeamBootstrapRecord(targetRepo, {
      host: "codex",
      mode: "required",
      bootstrappedAt: "2026-04-09T10:00:00.000Z"
    });
    appendProjectLearnings(targetRepo, [
      {
        pattern: "Keep the wedge narrow",
        guidance: "Start with one workflow path before expanding scope.",
        sourceRetroPath: "/tmp/retro.md",
        recordedAt: "2026-04-09T10:00:00.000Z"
      }
    ]);

    expect(statSync(workflowPaths.runtimeRoot).mode & 0o777).toBe(PRIVATE_DIRECTORY_MODE);
    expect(statSync(workflowPaths.latestStatePath).mode & 0o777).toBe(PRIVATE_FILE_MODE);
    expect(statSync(workflowPaths.routerStatePath).mode & 0o777).toBe(PRIVATE_FILE_MODE);
    expect(statSync(workflowPaths.teamBootstrapPath).mode & 0o777).toBe(PRIVATE_FILE_MODE);
    expect(statSync(workflowPaths.learningsPath).mode & 0o777).toBe(PRIVATE_FILE_MODE);

    expect(readLatestWorkflowState(targetRepo)?.initiativeId).toBe("20260409-daily-briefing-app");
    expect(readRouterState(targetRepo)?.suggestedSkill).toBe("codex-gstack-autoplan");
    expect(readTeamBootstrapRecord(targetRepo)?.mode).toBe("required");
    expect(readProjectLearnings(targetRepo)).toHaveLength(1);
    expect(readFileSync(getWorkflowPaths(targetRepo, "20260409-daily-briefing-app").latestStatePath, "utf8")).toContain(
      "\"status\": \"briefed\""
    );
  });

  it("updates stable plan sections without rebuilding the whole document", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-plan-doc-"));
    tempDirs.push(targetRepo);

    const initiativeId = "20260409-daily-briefing-app";
    const initialPlan = createPlanDocument({
      initiativeId,
      title: "Daily Briefing App",
      plannedReviewSequence: ["plan-ceo-review", "plan-eng-review"]
    });
    const withBrief = updatePlanSection(initialPlan, "Brief Snapshot", "Brief excerpt");
    const withCeo = updatePlanSection(withBrief, "CEO Review", "CEO review body");
    const withSequence = updateExecutedReviewSequence(withCeo, ["plan-ceo-review"]);

    expect(readPlanSection(withSequence, "Brief Snapshot")).toBe("Brief excerpt");
    expect(readPlanSection(withSequence, "CEO Review")).toBe("CEO review body");
    expect(withSequence).toContain("Executed review stages: `plan-ceo-review`");

    applyBriefSnapshotSection(targetRepo, {
      initiativeId,
      title: "Daily Briefing App",
      briefMarkdown: "# Brief\n\nExample",
      plannedReviewSequence: ["plan-ceo-review", "plan-eng-review"]
    });
    applyCeoReview(targetRepo, {
      initiativeId,
      title: "Daily Briefing App",
      briefMarkdown: "# Brief\n\nExample",
      plannedReviewSequence: ["plan-ceo-review", "plan-eng-review"],
      executedReviewSequence: ["plan-ceo-review"]
    });
    applyEngReview(targetRepo, {
      initiativeId,
      title: "Daily Briefing App",
      plannedReviewSequence: ["plan-ceo-review", "plan-eng-review"],
      executedReviewSequence: ["plan-ceo-review", "plan-eng-review"]
    });

    const persistedPlan = readFileSync(path.join(targetRepo, "docs", "gstack", initiativeId, "plan.md"), "utf8");
    expect(readPlanSection(persistedPlan, "CEO Review")).toContain("Reframe the initiative");
    expect(readPlanSection(persistedPlan, "Engineering Review")).toContain("architecture");
  });
});
