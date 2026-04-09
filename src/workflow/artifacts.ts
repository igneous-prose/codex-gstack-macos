import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PRIVATE_DIRECTORY_MODE, PRIVATE_FILE_MODE } from "../browser/config.js";
import { buildAutoplanReviewSequence, type PlanningReviewStep } from "./router.js";

export const WORKFLOW_DOCS_ROOT = path.join("docs", "gstack");
export const WORKFLOW_RUNTIME_ROOT = path.join(".codex-gstack", "workflow");
export const PLAN_SECTION_TITLES = [
  "Brief Snapshot",
  "CEO Review",
  "Design Review",
  "Engineering Review",
  "Implementation Plan",
  "Acceptance Criteria",
  "Implement Next"
] as const;

export type WorkflowArtifactKind = "brief" | "plan" | "retro";
export type WorkflowStatus = "briefed" | "planned" | "retrospective";
export type PlanSectionTitle = (typeof PLAN_SECTION_TITLES)[number];

export interface WorkflowPaths {
  readonly repoRoot: string;
  readonly docsRoot: string;
  readonly runtimeRoot: string;
  readonly initiativeId: string;
  readonly initiativeDir: string;
  readonly briefPath: string;
  readonly planPath: string;
  readonly retroPath: string;
  readonly latestStatePath: string;
  readonly learningsPath: string;
  readonly routerStatePath: string;
  readonly teamBootstrapPath: string;
}

export interface LatestWorkflowState {
  readonly initiativeId: string;
  readonly title: string;
  readonly status: WorkflowStatus;
  readonly briefPath?: string;
  readonly planPath?: string;
  readonly retroPath?: string;
  readonly reviewSequence?: string[];
  readonly updatedAt: string;
}

export interface ProjectLearning {
  readonly pattern: string;
  readonly guidance: string;
  readonly sourceRetroPath: string;
  readonly recordedAt: string;
}

export interface RouterStateRecord {
  readonly route: string;
  readonly suggestedSkill: string | null;
  readonly suggestedCommand: string | null;
  readonly requiresConfirmation: boolean;
  readonly initiativeId?: string;
  readonly reason: string;
  readonly updatedAt: string;
}

export interface TeamBootstrapRecord {
  readonly host: "codex";
  readonly mode: "required" | "optional";
  readonly bootstrappedAt: string;
}

export interface OfficeHoursResult {
  readonly initiativeId: string;
  readonly title: string;
  readonly briefPath: string;
  readonly briefMarkdown: string;
}

export interface AutoplanResult {
  readonly initiativeId: string;
  readonly title: string;
  readonly planPath: string;
  readonly planMarkdown: string;
  readonly reviewSequence: string[];
  readonly implementNextMessage: string;
}

export interface RetroResult {
  readonly initiativeId: string;
  readonly retroPath: string;
  readonly retroMarkdown: string;
  readonly learnings: ProjectLearning[];
}

export interface WorkflowStatusSnapshot {
  readonly initiativeId: string | null;
  readonly title: string | null;
  readonly status: WorkflowStatus | null;
  readonly briefPath: string | null;
  readonly planPath: string | null;
  readonly retroPath: string | null;
  readonly reviewSequence: string[];
}

function ensurePrivateDirectory(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  chmodSync(dirPath, PRIVATE_DIRECTORY_MODE);
}

function writePrivateJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: PRIVATE_FILE_MODE
  });
  chmodSync(filePath, PRIVATE_FILE_MODE);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function normalizeMarkdown(content: string): string {
  const trimmed = content.trimEnd();
  return `${trimmed}\n`;
}

function titleCase(words: string[]): string {
  return words
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatPlanReviewSequence(reviewSequence: readonly string[]): string {
  return reviewSequence.length === 0 ? "none yet" : reviewSequence.join(" -> ");
}

function joinBullets(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

function getPlanSectionPlaceholder(sectionTitle: PlanSectionTitle): string {
  switch (sectionTitle) {
    case "Brief Snapshot":
      return "- No brief snapshot recorded yet.";
    case "CEO Review":
      return "- CEO review has not run yet.";
    case "Design Review":
      return "- Design review has not run yet.";
    case "Engineering Review":
      return "- Engineering review has not run yet.";
    case "Implementation Plan":
      return "- Final implementation plan has not been assembled yet.";
    case "Acceptance Criteria":
      return "- Acceptance criteria have not been finalized yet.";
    case "Implement Next":
      return "- Implement-next guidance has not been written yet.";
  }
}

function buildPlanSection(sectionTitle: PlanSectionTitle, body: string): string {
  return `## ${sectionTitle}\n\n${body.trim()}`;
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "initiative";
}

export function inferInitiativeTitle(rawIntent: string): string {
  const cleaned = rawIntent
    .replace(/[`*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 8);

  if (words.length === 0) {
    return "Untitled Initiative";
  }

  return titleCase(words);
}

export function buildInitiativeId(title: string, now = new Date()): string {
  const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `${datePrefix}-${slugify(title).slice(0, 48)}`;
}

export function getWorkflowPaths(repoRoot: string, initiativeId: string): WorkflowPaths {
  const docsRoot = path.join(repoRoot, WORKFLOW_DOCS_ROOT);
  const runtimeRoot = path.join(repoRoot, WORKFLOW_RUNTIME_ROOT);
  const initiativeDir = path.join(docsRoot, initiativeId);

  return {
    repoRoot,
    docsRoot,
    runtimeRoot,
    initiativeId,
    initiativeDir,
    briefPath: path.join(initiativeDir, "brief.md"),
    planPath: path.join(initiativeDir, "plan.md"),
    retroPath: path.join(initiativeDir, "retro.md"),
    latestStatePath: path.join(runtimeRoot, "latest.json"),
    learningsPath: path.join(runtimeRoot, "learnings.json"),
    routerStatePath: path.join(runtimeRoot, "router-state.json"),
    teamBootstrapPath: path.join(runtimeRoot, "team-bootstrap.json")
  };
}

export function ensureWorkflowLayout(repoRoot: string, initiativeId?: string): WorkflowPaths {
  const resolvedInitiativeId = initiativeId ?? "shared";
  const workflowPaths = getWorkflowPaths(repoRoot, resolvedInitiativeId);

  mkdirSync(workflowPaths.docsRoot, { recursive: true });
  if (initiativeId) {
    mkdirSync(workflowPaths.initiativeDir, { recursive: true });
  }
  ensurePrivateDirectory(path.join(repoRoot, ".codex-gstack"));
  ensurePrivateDirectory(workflowPaths.runtimeRoot);

  return workflowPaths;
}

export function writeWorkflowArtifact(
  repoRoot: string,
  initiativeId: string,
  kind: WorkflowArtifactKind,
  markdown: string
): string {
  const workflowPaths = ensureWorkflowLayout(repoRoot, initiativeId);
  const targetPath =
    kind === "brief"
      ? workflowPaths.briefPath
      : kind === "plan"
        ? workflowPaths.planPath
        : workflowPaths.retroPath;

  writeFileSync(targetPath, normalizeMarkdown(markdown), "utf8");
  return targetPath;
}

export function readWorkflowArtifact(
  repoRoot: string,
  initiativeId: string,
  kind: WorkflowArtifactKind
): string | null {
  const workflowPaths = getWorkflowPaths(repoRoot, initiativeId);
  const targetPath =
    kind === "brief"
      ? workflowPaths.briefPath
      : kind === "plan"
        ? workflowPaths.planPath
        : workflowPaths.retroPath;

  if (!existsSync(targetPath)) {
    return null;
  }

  return readFileSync(targetPath, "utf8");
}

export function writeLatestWorkflowState(repoRoot: string, state: LatestWorkflowState): void {
  const workflowPaths = ensureWorkflowLayout(repoRoot, state.initiativeId);
  writePrivateJson(workflowPaths.latestStatePath, state);
}

export function readLatestWorkflowState(repoRoot: string): LatestWorkflowState | null {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  return readJsonFile<LatestWorkflowState>(workflowPaths.latestStatePath);
}

export function writeRouterState(repoRoot: string, state: RouterStateRecord): void {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  writePrivateJson(workflowPaths.routerStatePath, state);
}

export function readRouterState(repoRoot: string): RouterStateRecord | null {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  return readJsonFile<RouterStateRecord>(workflowPaths.routerStatePath);
}

export function writeTeamBootstrapRecord(repoRoot: string, record: TeamBootstrapRecord): void {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  writePrivateJson(workflowPaths.teamBootstrapPath, record);
}

export function readTeamBootstrapRecord(repoRoot: string): TeamBootstrapRecord | null {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  return readJsonFile<TeamBootstrapRecord>(workflowPaths.teamBootstrapPath);
}

export function readProjectLearnings(repoRoot: string): ProjectLearning[] {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  return readJsonFile<ProjectLearning[]>(workflowPaths.learningsPath) ?? [];
}

export function appendProjectLearnings(
  repoRoot: string,
  learnings: readonly ProjectLearning[]
): ProjectLearning[] {
  const workflowPaths = ensureWorkflowLayout(repoRoot);
  const existing = readProjectLearnings(repoRoot);
  const merged = [...existing, ...learnings];
  writePrivateJson(workflowPaths.learningsPath, merged);
  return merged;
}

export function buildImplementNextMessage(initiativeId: string): string {
  return `Plan saved for \`${initiativeId}\`. Stop here by default, or explicitly ask Codex to implement from \`docs/gstack/${initiativeId}/plan.md\`.`;
}

export function buildWorkflowStatusSnapshot(repoRoot: string): WorkflowStatusSnapshot {
  const latestState = readLatestWorkflowState(repoRoot);
  if (!latestState) {
    return {
      initiativeId: null,
      title: null,
      status: null,
      briefPath: null,
      planPath: null,
      retroPath: null,
      reviewSequence: []
    };
  }

  return {
    initiativeId: latestState.initiativeId,
    title: latestState.title,
    status: latestState.status,
    briefPath: latestState.briefPath ?? null,
    planPath: latestState.planPath ?? null,
    retroPath: latestState.retroPath ?? null,
    reviewSequence: latestState.reviewSequence ?? []
  };
}

export function renderBriefMarkdown(options: {
  readonly initiativeId: string;
  readonly title: string;
  readonly userIntent: string;
  readonly rememberedLearnings: readonly ProjectLearning[];
}): string {
  const learningBlock =
    options.rememberedLearnings.length === 0
      ? "- None recorded yet.\n"
      : options.rememberedLearnings
          .slice(-5)
          .map((learning) => `- ${learning.pattern}: ${learning.guidance}`)
          .join("\n");

  return `# Brief: ${options.title}

- Initiative ID: \`${options.initiativeId}\`
- Workflow stage: \`office-hours\`
- Output path: \`docs/gstack/${options.initiativeId}/brief.md\`

## User Intent

${options.userIntent}

## Problem Framing

- Core problem: clarify the real pain behind the request.
- Users: identify the main operator, buyer, or end user.
- Wedge: define the smallest useful version worth shipping first.

## Success Criteria

- Document the user-visible outcome.
- Record the constraints and non-goals before code starts.
- Leave the brief ready for \`/autoplan\`.

## Constraints

- Keep the workflow Codex-first and local-only.
- Preserve browser hardening and existing repo boundaries.
- Prefer the smallest coherent plan that can be implemented safely.

## Remembered Learnings

${learningBlock}

## Next Step

Run \`/autoplan\` to produce a reviewed implementation plan from this brief.`;
}

export function createPlanDocument(options: {
  readonly initiativeId: string;
  readonly title: string;
  readonly plannedReviewSequence: readonly string[];
}): string {
  const sections = PLAN_SECTION_TITLES.map((sectionTitle) =>
    buildPlanSection(sectionTitle, getPlanSectionPlaceholder(sectionTitle))
  ).join("\n\n");

  return `# Plan: ${options.title}

- Initiative ID: \`${options.initiativeId}\`
- Workflow stage: \`autoplan\`
- Planned review stages: \`${options.plannedReviewSequence.join(" -> ")}\`
- Executed review stages: \`none yet\`
- Output path: \`docs/gstack/${options.initiativeId}/plan.md\`

${sections}
`;
}

export function initializePlanDocument(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly plannedReviewSequence: readonly string[];
  }
): string {
  const existingPlan = readWorkflowArtifact(repoRoot, options.initiativeId, "plan");
  if (existingPlan) {
    return existingPlan;
  }

  const planMarkdown = createPlanDocument(options);
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function readPlanSection(planMarkdown: string, sectionTitle: PlanSectionTitle): string | null {
  const pattern = new RegExp(
    `## ${escapeRegExp(sectionTitle)}\\n\\n([\\s\\S]*?)(?=\\n## |$)`,
    "m"
  );
  const match = planMarkdown.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function updatePlanSection(
  planMarkdown: string,
  sectionTitle: PlanSectionTitle,
  body: string
): string {
  const replacement = buildPlanSection(sectionTitle, body.trim());
  const pattern = new RegExp(
    `## ${escapeRegExp(sectionTitle)}\\n\\n[\\s\\S]*?(?=\\n## |$)`,
    "m"
  );

  if (pattern.test(planMarkdown)) {
    return normalizeMarkdown(planMarkdown.replace(pattern, replacement));
  }

  return normalizeMarkdown(`${planMarkdown.trimEnd()}\n\n${replacement}`);
}

export function updateExecutedReviewSequence(
  planMarkdown: string,
  reviewSequence: readonly string[]
): string {
  const renderedSequence = formatPlanReviewSequence(reviewSequence);
  return normalizeMarkdown(
    planMarkdown.replace(
      /- Executed review stages: `.*`/,
      `- Executed review stages: \`${renderedSequence}\``
    )
  );
}

export function ensureBrief(
  repoRoot: string,
  options: {
    readonly userIntent?: string;
    readonly initiativeId?: string;
    readonly now?: Date;
  }
): OfficeHoursResult {
  const now = options.now ?? new Date();
  const latestState = readLatestWorkflowState(repoRoot);

  if (!options.initiativeId && options.userIntent) {
    return startOfficeHoursWorkflow(repoRoot, options.userIntent, now);
  }

  if (options.initiativeId) {
    const briefMarkdown = readWorkflowArtifact(repoRoot, options.initiativeId, "brief");
    if (!briefMarkdown) {
      throw new Error(`No brief exists for initiative ${options.initiativeId}.`);
    }

    const title =
      latestState?.initiativeId === options.initiativeId
        ? latestState.title
        : inferInitiativeTitle(briefMarkdown);
    return {
      initiativeId: options.initiativeId,
      title,
      briefPath: getWorkflowPaths(repoRoot, options.initiativeId).briefPath,
      briefMarkdown
    };
  }

  if (latestState?.briefPath) {
    const briefMarkdown = readWorkflowArtifact(repoRoot, latestState.initiativeId, "brief");
    if (briefMarkdown) {
      return {
        initiativeId: latestState.initiativeId,
        title: latestState.title,
        briefPath: latestState.briefPath,
        briefMarkdown
      };
    }
  }

  if (!options.userIntent) {
    throw new Error("A raw user intent is required when no brief exists.");
  }

  return startOfficeHoursWorkflow(repoRoot, options.userIntent, now);
}

export function buildBriefSnapshot(briefMarkdown: string): string {
  return briefMarkdown.split("\n").slice(0, 12).join("\n");
}

export function applyBriefSnapshotSection(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly briefMarkdown: string;
    readonly plannedReviewSequence: readonly string[];
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Brief Snapshot",
    buildBriefSnapshot(options.briefMarkdown)
  );
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function applyCeoReview(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly briefMarkdown: string;
    readonly plannedReviewSequence: readonly string[];
    readonly executedReviewSequence: readonly string[];
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  const ceoBody = joinBullets([
    `Reframe the initiative as: ${options.title}.`,
    "Protect the smallest wedge that teaches something real before broader expansion.",
    "Remove work that does not affect the first useful operator or customer path."
  ]);
  planMarkdown = updatePlanSection(planMarkdown, "CEO Review", ceoBody);
  planMarkdown = updateExecutedReviewSequence(planMarkdown, options.executedReviewSequence);
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function applyDesignReview(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly plannedReviewSequence: readonly string[];
    readonly executedReviewSequence: readonly string[];
    readonly includeDesignReview: boolean;
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  const designBody = options.includeDesignReview
    ? joinBullets([
        `Define what a polished first version of ${options.title} should feel like.`,
        "Call out visible UX assumptions, interaction clarity, and anti-slop quality bars.",
        "Require explicit user-facing acceptance criteria before implementation starts."
      ])
    : "- Design review skipped because this initiative is not user-facing.";
  planMarkdown = updatePlanSection(planMarkdown, "Design Review", designBody);
  planMarkdown = updateExecutedReviewSequence(planMarkdown, options.executedReviewSequence);
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function applyEngReview(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly plannedReviewSequence: readonly string[];
    readonly executedReviewSequence: readonly string[];
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  const engBody = joinBullets([
    `Lock the architecture and data flow for ${options.title} before editing.`,
    "Make failure modes, regression risks, and verification paths explicit.",
    "Tie tests and acceptance criteria to the actual plan rather than improvised implementation."
  ]);
  planMarkdown = updatePlanSection(planMarkdown, "Engineering Review", engBody);
  planMarkdown = updateExecutedReviewSequence(planMarkdown, options.executedReviewSequence);
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function finalizePlan(
  repoRoot: string,
  options: {
    readonly initiativeId: string;
    readonly title: string;
    readonly plannedReviewSequence: readonly string[];
    readonly executedReviewSequence: readonly string[];
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Implementation Plan",
    `1. Read the brief and current repo shape before editing.
2. Implement the smallest end-to-end change that satisfies the wedge.
3. Verify behavior with automated checks and any required manual QA.
4. Run \`/review\` against the persisted plan, then \`/qa\` or browser verification as needed.
5. Use \`/ship\` only after the plan and verification criteria are satisfied.`
  );
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Acceptance Criteria",
    joinBullets([
      "The implementation follows this saved plan rather than improvised prompting.",
      "New behavior is covered by tests or an exact manual verification path.",
      "Review and QA both reference the current plan artifact and its acceptance criteria."
    ])
  );
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Implement Next",
    buildImplementNextMessage(options.initiativeId)
  );
  planMarkdown = updateExecutedReviewSequence(planMarkdown, options.executedReviewSequence);
  writeWorkflowArtifact(repoRoot, options.initiativeId, "plan", planMarkdown);
  return planMarkdown;
}

export function startOfficeHoursWorkflow(
  repoRoot: string,
  userIntent: string,
  now = new Date()
): OfficeHoursResult {
  const title = inferInitiativeTitle(userIntent);
  const initiativeId = buildInitiativeId(title, now);
  const rememberedLearnings = readProjectLearnings(repoRoot);
  const briefMarkdown = renderBriefMarkdown({
    initiativeId,
    title,
    userIntent,
    rememberedLearnings
  });
  const briefPath = writeWorkflowArtifact(repoRoot, initiativeId, "brief", briefMarkdown);

  writeLatestWorkflowState(repoRoot, {
    initiativeId,
    title,
    status: "briefed",
    briefPath,
    reviewSequence: [],
    updatedAt: now.toISOString()
  });

  return {
    initiativeId,
    title,
    briefPath,
    briefMarkdown
  };
}

export function runAutoplan(
  repoRoot: string,
  options: {
    readonly userIntent?: string;
    readonly initiativeId?: string;
    readonly now?: Date;
  }
): AutoplanResult {
  const now = options.now ?? new Date();
  const briefResult = ensureBrief(repoRoot, options);
  const reviewSequence = buildAutoplanReviewSequence(
    `${options.userIntent ?? ""}\n${briefResult.briefMarkdown}`
  );
  const includeDesignReview = reviewSequence.includes("plan-design-review");
  const commonOptions = {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    briefMarkdown: briefResult.briefMarkdown,
    plannedReviewSequence: reviewSequence
  };

  applyBriefSnapshotSection(repoRoot, commonOptions);

  const executedReviewSequence: PlanningReviewStep[] = [];
  executedReviewSequence.push("plan-ceo-review");
  applyCeoReview(repoRoot, {
    ...commonOptions,
    executedReviewSequence
  });

  if (includeDesignReview) {
    executedReviewSequence.push("plan-design-review");
  }
  applyDesignReview(repoRoot, {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    plannedReviewSequence: reviewSequence,
    executedReviewSequence,
    includeDesignReview
  });

  executedReviewSequence.push("plan-eng-review");
  applyEngReview(repoRoot, {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    plannedReviewSequence: reviewSequence,
    executedReviewSequence
  });

  const planMarkdown = finalizePlan(repoRoot, {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    plannedReviewSequence: reviewSequence,
    executedReviewSequence
  });
  const planPath = getWorkflowPaths(repoRoot, briefResult.initiativeId).planPath;

  writeLatestWorkflowState(repoRoot, {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    status: "planned",
    briefPath: briefResult.briefPath,
    planPath,
    reviewSequence: executedReviewSequence,
    updatedAt: now.toISOString()
  });

  return {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    planPath,
    planMarkdown,
    reviewSequence: executedReviewSequence,
    implementNextMessage: buildImplementNextMessage(briefResult.initiativeId)
  };
}

export function recordRetro(
  repoRoot: string,
  options: {
    readonly initiativeId?: string;
    readonly title?: string;
    readonly summary: string;
    readonly learnings: ReadonlyArray<Pick<ProjectLearning, "pattern" | "guidance">>;
    readonly now?: Date;
  }
): RetroResult {
  const now = options.now ?? new Date();
  const latestState = readLatestWorkflowState(repoRoot);
  const initiativeId = options.initiativeId ?? latestState?.initiativeId;

  if (!initiativeId) {
    throw new Error("Retro requires an initiative id or prior workflow state.");
  }

  const title = options.title ?? latestState?.title ?? "Untitled Initiative";
  const retroPath = getWorkflowPaths(repoRoot, initiativeId).retroPath;
  const learnings = options.learnings.map((learning) => ({
    ...learning,
    sourceRetroPath: retroPath,
    recordedAt: now.toISOString()
  }));
  const retroMarkdown = renderRetroMarkdown({
    initiativeId,
    title,
    summary: options.summary,
    learnings
  });
  writeWorkflowArtifact(repoRoot, initiativeId, "retro", retroMarkdown);
  appendProjectLearnings(repoRoot, learnings);

  writeLatestWorkflowState(repoRoot, {
    initiativeId,
    title,
    status: "retrospective",
    briefPath: getWorkflowPaths(repoRoot, initiativeId).briefPath,
    planPath: getWorkflowPaths(repoRoot, initiativeId).planPath,
    retroPath,
    reviewSequence: latestState?.reviewSequence ?? [],
    updatedAt: now.toISOString()
  });

  return {
    initiativeId,
    retroPath,
    retroMarkdown,
    learnings
  };
}

export function renderRetroMarkdown(options: {
  readonly initiativeId: string;
  readonly title: string;
  readonly summary: string;
  readonly learnings: readonly ProjectLearning[];
}): string {
  const learningBlock =
    options.learnings.length === 0
      ? "- No learnings recorded.\n"
      : options.learnings
          .map((learning) => `- ${learning.pattern}: ${learning.guidance}`)
          .join("\n");

  return `# Retro: ${options.title}

- Initiative ID: \`${options.initiativeId}\`
- Workflow stage: \`retro\`
- Output path: \`docs/gstack/${options.initiativeId}/retro.md\`

## Summary

${options.summary}

## Learnings

${learningBlock}

## Next Sprint

- Feed the learnings back into the next \`/office-hours\` or \`/autoplan\` run.
- Update the plan only when the learning changes the implementation path.`;
}
