import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function runWorkflowScript(scriptName: string, args: string[]): Record<string, unknown> {
  const output = execFileSync(
    "npm",
    ["run", "--silent", scriptName, "--", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  return JSON.parse(output) as Record<string, unknown>;
}

describe("workflow cli", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("dispatches requests and persists router state", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-route-"));
    tempDirs.push(targetRepo);

    const result = runWorkflowScript("workflow:dispatch", [
      "--repo",
      targetRepo,
      "--input",
      "Help me plan this dashboard redesign"
    ]);

    expect(result.route).toBe("autoplan");
    expect(result.requiresConfirmation).toBe(true);
    expect(String(result.suggestedCommand)).toContain("gstack-workflow-autoplan");
    expect(result.activeInitiative).toEqual({
      initiativeId: null,
      title: null,
      status: null,
      planPath: null
    });
    expect(readFileSync(path.join(targetRepo, ".codex-gstack", "workflow", "router-state.json"), "utf8")).toContain(
      "\"route\": \"autoplan\""
    );
  });

  it("writes a brief and reports current status", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-office-hours-"));
    tempDirs.push(targetRepo);

    const officeHours = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "I want to build a daily briefing app for support leads"
    ]);
    expect(String(officeHours.briefPath)).toContain("docs/gstack/");
    expect(officeHours.officeHoursMode).toBe("builder");
    const briefMarkdown = readFileSync(String(officeHours.briefPath), "utf8");
    expect(briefMarkdown).toContain("## Office Hours Mode");
    expect(briefMarkdown).toContain("## Premise Challenge");
    expect(briefMarkdown).toContain("## Implementation Alternatives");

    const status = runWorkflowScript("workflow:status", ["--repo", targetRepo]);
    expect(status.status).toBe("briefed");
    expect(status.briefPath).toBe(officeHours.briefPath);
  });

  it("runs autoplan and produces stable review sections", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-autoplan-"));
    tempDirs.push(targetRepo);

    const officeHours = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "I want to build a customer dashboard for support leads"
    ]);
    const initiativeId = String(officeHours.initiativeId);

    const autoplan = runWorkflowScript("workflow:autoplan", [
      "--repo",
      targetRepo,
      "--initiative-id",
      initiativeId
    ]);
    expect(autoplan.reviewSequence).toEqual([
      "plan-ceo-review",
      "plan-design-review",
      "plan-eng-review"
    ]);

    const planMarkdown = readFileSync(path.join(targetRepo, "docs", "gstack", initiativeId, "plan.md"), "utf8");
    expect(planMarkdown).toContain("## CEO Review");
    expect(planMarkdown).toContain("## Design Review");
    expect(planMarkdown).toContain("## Engineering Review");
    expect(planMarkdown).toContain("## Acceptance Criteria");
    expect(planMarkdown).toContain("## QA Targets");
    expect(planMarkdown).toContain("Scope mode:");
    expect(planMarkdown).toContain("### Scorecard");
    expect(planMarkdown).toContain("### Architecture");
    expect(Array.isArray(autoplan.unresolvedTasteDecisions)).toBe(true);
  });

  it("lets independent plan reviews update targeted sections", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-plan-review-"));
    tempDirs.push(targetRepo);

    const officeHours = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "Plan a backend worker queue migration"
    ]);
    const initiativeId = String(officeHours.initiativeId);

    runWorkflowScript("workflow:plan-ceo-review", [
      "--repo",
      targetRepo,
      "--initiative-id",
      initiativeId
    ]);
    runWorkflowScript("workflow:plan-eng-review", [
      "--repo",
      targetRepo,
      "--initiative-id",
      initiativeId
    ]);

    const planMarkdown = readFileSync(path.join(targetRepo, "docs", "gstack", initiativeId, "plan.md"), "utf8");
    expect(planMarkdown).toContain("## CEO Review");
    expect(planMarkdown).toContain("## Engineering Review");
    expect(planMarkdown).toContain("Product reframe");
    expect(planMarkdown).toContain("architecture");
  });

  it("returns review and QA context from the active plan", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-review-qa-"));
    tempDirs.push(targetRepo);

    const officeHours = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "I want to build a customer dashboard for support leads"
    ]);
    const initiativeId = String(officeHours.initiativeId);
    runWorkflowScript("workflow:autoplan", ["--repo", targetRepo, "--initiative-id", initiativeId]);

    const reviewContext = runWorkflowScript("workflow:review", ["--repo", targetRepo]);
    expect(String(reviewContext.planPath)).toContain(
      path.join("docs", "gstack", initiativeId, "plan.md")
    );
    expect(reviewContext.fallbackMessage).toBeNull();
    expect(reviewContext.implementationChecklist).toContain(
      "Read the brief and current repo shape before editing."
    );

    const qaContext = runWorkflowScript("workflow:qa", ["--repo", targetRepo]);
    expect(String(qaContext.planPath)).toContain(
      path.join("docs", "gstack", initiativeId, "plan.md")
    );
    expect(qaContext.fallbackMessage).toBeNull();
    expect(qaContext.qaTargets).not.toHaveLength(0);
  });

  it("falls back cleanly when review or QA runs without a plan", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-review-fallback-"));
    tempDirs.push(targetRepo);

    const reviewContext = runWorkflowScript("workflow:review", ["--repo", targetRepo]);
    expect(reviewContext.fallbackMessage).toBe("No active plan found. Fall back to branch-only review.");

    const qaContext = runWorkflowScript("workflow:qa", ["--repo", targetRepo]);
    expect(qaContext.fallbackMessage).toBe(
      "No active plan found. Fall back to installation and branch-only QA."
    );
  });

  it("writes retro learnings and reuses them in the next brief", () => {
    const targetRepo = mkdtempSync(path.join(os.tmpdir(), "codex-gstack-retro-"));
    tempDirs.push(targetRepo);

    const officeHours = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "I want to build an alert triage app"
    ]);
    const initiativeId = String(officeHours.initiativeId);

    runWorkflowScript("workflow:retro", [
      "--repo",
      targetRepo,
      "--initiative-id",
      initiativeId,
      "--summary",
      "Narrow wedges improved planning quality.",
      "--learning",
      "Start small::Protect the first operator path before expansion."
    ]);

    const nextBrief = runWorkflowScript("workflow:office-hours", [
      "--repo",
      targetRepo,
      "--input",
      "I want to build the follow-up workflow for the same alert triage app"
    ]);
    const nextBriefMarkdown = readFileSync(String(nextBrief.briefPath), "utf8");
    expect(nextBriefMarkdown).toContain("Start small");
    expect(nextBriefMarkdown).toContain("Protect the first operator path before expansion.");
  });
});
