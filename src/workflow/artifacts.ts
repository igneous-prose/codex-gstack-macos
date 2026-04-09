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
  "QA Targets",
  "Implement Next"
] as const;

export type WorkflowArtifactKind = "brief" | "plan" | "retro";
export type WorkflowStatus = "briefed" | "planned" | "retrospective";
export type PlanSectionTitle = (typeof PLAN_SECTION_TITLES)[number];
export type OfficeHoursMode = "startup" | "builder";
export type CeaScopeMode = "expand" | "selective-expand" | "hold-scope" | "reduce";

export interface ReviewContextSnapshot {
  readonly generatedAt: string;
  readonly initiativeId: string | null;
  readonly title: string | null;
  readonly planPath: string | null;
  readonly implementationChecklist: string[];
  readonly acceptanceCriteria: string[];
  readonly fallbackMessage: string | null;
}

export interface QaContextSnapshot {
  readonly generatedAt: string;
  readonly initiativeId: string | null;
  readonly title: string | null;
  readonly planPath: string | null;
  readonly qaTargets: string[];
  readonly userFacingExpectations: string[];
  readonly fallbackMessage: string | null;
}

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
  readonly officeHoursMode?: OfficeHoursMode;
  readonly ceoScopeMode?: CeaScopeMode;
  readonly unresolvedTasteDecisions?: string[];
  readonly reviewContext?: ReviewContextSnapshot;
  readonly qaContext?: QaContextSnapshot;
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
  readonly officeHoursMode: OfficeHoursMode;
}

export interface AutoplanResult {
  readonly initiativeId: string;
  readonly title: string;
  readonly planPath: string;
  readonly planMarkdown: string;
  readonly reviewSequence: string[];
  readonly implementNextMessage: string;
  readonly ceoScopeMode: CeaScopeMode;
  readonly unresolvedTasteDecisions: string[];
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
    case "QA Targets":
      return "- QA targets have not been finalized yet.";
    case "Implement Next":
      return "- Implement-next guidance has not been written yet.";
  }
}

function buildPlanSection(sectionTitle: PlanSectionTitle, body: string): string {
  return `## ${sectionTitle}\n\n${body.trim()}`;
}

function hasMatcher(input: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

function cleanIntentLine(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function extractListItems(sectionBody: string | null): string[] {
  if (!sectionBody) {
    return [];
  }

  return sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(-|\d+\.)\s+/.test(line))
    .map((line) => line.replace(/^(-|\d+\.)\s+/, "").trim())
    .filter(Boolean);
}

function extractLatestPlanMarkdown(repoRoot: string): { latestState: LatestWorkflowState | null; planMarkdown: string | null } {
  const latestState = readLatestWorkflowState(repoRoot);
  if (!latestState?.planPath || !existsSync(latestState.planPath)) {
    return {
      latestState,
      planMarkdown: null
    };
  }

  return {
    latestState,
    planMarkdown: readFileSync(latestState.planPath, "utf8")
  };
}

function selectOfficeHoursMode(userIntent: string): OfficeHoursMode {
  const normalized = userIntent.toLowerCase();
  if (
    hasMatcher(normalized, [
      /\bstartup\b/,
      /\bfounder\b/,
      /\bnew product\b/,
      /\bgo to market\b/,
      /\bbuyer\b/,
      /\bpricing\b/,
      /\bmarket\b/,
      /\bcustomer\b/
    ])
  ) {
    return "startup";
  }

  return "builder";
}

function buildModeRationale(mode: OfficeHoursMode): string {
  if (mode === "startup") {
    return "Use startup mode when the user is still proving demand, users, and wedge.";
  }

  return "Use builder mode when the user mostly needs product framing and execution shape.";
}

function buildModeQuestions(mode: OfficeHoursMode, title: string): string {
  if (mode === "startup") {
    return [
      `1. Which specific user will switch behavior on day one if ${title} exists?`,
      "2. What painful workflow is happening often enough that a narrow wedge matters now?",
      "3. What evidence would prove this is a must-have instead of a nice-to-have?",
      "4. What would the buyer, operator, or founder refuse to cut from the first release?",
      "5. What can wait until after the first repeated success story?",
      "6. What metric would make you double down within two weeks of shipping?"
    ].join("\n");
  }

  return [
    `1. What would make the first use of ${title} feel immediately magical?`,
    "2. Which operator path must feel faster, clearer, or calmer than the current workflow?",
    "3. Where will the user hesitate or mistrust the product unless the design is explicit?",
    "4. Which system or human boundary creates the highest implementation risk?",
    "5. What is the smallest release that still feels like a product, not a demo?",
    "6. What should stay deliberately unfinished until real usage teaches something?"
  ].join("\n");
}

function buildActualBuildStatement(title: string, mode: OfficeHoursMode): string {
  if (mode === "startup") {
    return `${title} is a narrow proof-of-demand product that should teach whether one user workflow is painful enough to earn repeat usage.`;
  }

  return `${title} is an execution-focused product wedge that should make one operator or end-user path meaningfully clearer, faster, or safer.`;
}

function buildPremiseChallenge(mode: OfficeHoursMode): string {
  const challengeLines =
    mode === "startup"
      ? [
          "Accept: the first release can optimize for learning over breadth if it earns repeat use.",
          "Reject: building a platform, suite, or marketplace before one workflow proves sticky value.",
          "Adjust: keep founder ambition, but force the first release to win one narrow buyer or operator story."
        ]
      : [
          "Accept: the first release should feel polished on the primary path, not complete everywhere.",
          "Reject: shipping every edge path before the main interaction feels trustworthy.",
          "Adjust: reduce setup, copy, and branching until the user understands the wedge in one pass."
        ];

  return joinBullets(challengeLines);
}

function buildImplementationAlternatives(title: string, mode: OfficeHoursMode): string {
  const alternatives =
    mode === "startup"
      ? [
          {
            name: "Pilot Wedge",
            wedge: `Ship ${title} for one operator workflow and measure repeat usage.`,
            effort: "Low",
            risk: "May feel intentionally narrow, but learning is fast."
          },
          {
            name: "Concierge Hybrid",
            wedge: `Keep ${title} lightweight in product and fill gaps manually behind the scenes.`,
            effort: "Medium",
            risk: "Manual load stays high if the wedge is not tightened."
          },
          {
            name: "Platform Leap",
            wedge: `Attempt ${title} as a broad system from day one.`,
            effort: "High",
            risk: "High risk of breadth outrunning proof of value."
          }
        ]
      : [
          {
            name: "Single-Path Product Slice",
            wedge: `Implement one complete user path in ${title} with strong defaults and clear UX.`,
            effort: "Low",
            risk: "Secondary paths wait until after first release."
          },
          {
            name: "Config-Heavy First Release",
            wedge: `Expose more knobs in ${title} before the main flow feels obvious.`,
            effort: "Medium",
            risk: "Users may need too much interpretation on day one."
          },
          {
            name: "Broad Coverage Pass",
            wedge: `Cover most workflows in ${title} before the primary path feels excellent.`,
            effort: "High",
            risk: "High chance of generic UX and diluted quality bar."
          }
        ];

  return alternatives
    .map(
      (alternative, index) =>
        `### Option ${index + 1}: ${alternative.name}\n- Wedge: ${alternative.wedge}\n- Effort: ${alternative.effort}\n- Risk: ${alternative.risk}`
    )
    .join("\n\n");
}

function buildRecommendation(title: string, mode: OfficeHoursMode): string {
  if (mode === "startup") {
    return `Recommend the Pilot Wedge for ${title}. It keeps the first release narrow enough to learn quickly while still producing a concrete proof-of-value story.`;
  }

  return `Recommend the Single-Path Product Slice for ${title}. It is the narrowest release that can still feel intentional, trustworthy, and implementation-ready.`;
}

function selectCeoScopeMode(briefMarkdown: string): CeaScopeMode {
  const normalized = briefMarkdown.toLowerCase();
  if (hasMatcher(normalized, [/\bplatform\b/, /\bsuite\b/, /\bmarketplace\b/, /\ball-in-one\b/, /\beverything\b/])) {
    return "reduce";
  }

  if (hasMatcher(normalized, [/\bpilot\b/, /\bmvp\b/, /\bsingle path\b/, /\bnarrow\b/, /\bwedge\b/])) {
    return "selective-expand";
  }

  if (hasMatcher(normalized, [/\blanding page\b/, /\bprototype\b/, /\bone screen\b/])) {
    return "expand";
  }

  return "hold-scope";
}

function buildCeoApprovalGate(scopeMode: CeaScopeMode): string {
  switch (scopeMode) {
    case "reduce":
      return "Reduce scope before implementation if new work expands beyond the first useful workflow.";
    case "selective-expand":
      return "Allow only selective expansion that reinforces the first successful workflow.";
    case "expand":
      return "Expand only if the current wedge is too small to feel like a real product.";
    case "hold-scope":
      return "Hold scope steady unless new evidence shows the first path is underspecified.";
  }
}

function buildDesignScores(title: string): string[] {
  return [
    `Clarity: 4/5 for ${title} if the first screen makes the wedge obvious immediately.`,
    "Focus: 5/5 when the primary path is simpler than the surrounding system.",
    "Quality bar: 4/5 if copy, layout, and defaults avoid generic AI-product sludge."
  ];
}

function buildUnresolvedTasteDecisions(title: string): string[] {
  return [
    `Decide whether ${title} should open with a dense operator workspace or a guided summary view.`,
    "Decide how assertive the primary CTA should be relative to secondary diagnostics.",
    "Decide which secondary controls stay hidden until the main path is clearly understood."
  ];
}

function buildReviewContextFromPlan(repoRoot: string): ReviewContextSnapshot {
  const generatedAt = new Date().toISOString();
  const { latestState, planMarkdown } = extractLatestPlanMarkdown(repoRoot);
  if (!latestState?.initiativeId || !latestState.planPath || !planMarkdown) {
    return {
      generatedAt,
      initiativeId: latestState?.initiativeId ?? null,
      title: latestState?.title ?? null,
      planPath: latestState?.planPath ?? null,
      implementationChecklist: [],
      acceptanceCriteria: [],
      fallbackMessage: "No active plan found. Fall back to branch-only review."
    };
  }

  return {
    generatedAt,
    initiativeId: latestState.initiativeId,
    title: latestState.title,
    planPath: latestState.planPath,
    implementationChecklist: extractListItems(readPlanSection(planMarkdown, "Implementation Plan")),
    acceptanceCriteria: extractListItems(readPlanSection(planMarkdown, "Acceptance Criteria")),
    fallbackMessage: null
  };
}

function buildQaContextFromPlan(repoRoot: string): QaContextSnapshot {
  const generatedAt = new Date().toISOString();
  const { latestState, planMarkdown } = extractLatestPlanMarkdown(repoRoot);
  if (!latestState?.initiativeId || !latestState.planPath || !planMarkdown) {
    return {
      generatedAt,
      initiativeId: latestState?.initiativeId ?? null,
      title: latestState?.title ?? null,
      planPath: latestState?.planPath ?? null,
      qaTargets: [],
      userFacingExpectations: [],
      fallbackMessage: "No active plan found. Fall back to installation and branch-only QA."
    };
  }

  const qaTargets = extractListItems(readPlanSection(planMarkdown, "QA Targets"));
  const acceptanceCriteria = extractListItems(readPlanSection(planMarkdown, "Acceptance Criteria"));

  return {
    generatedAt,
    initiativeId: latestState.initiativeId,
    title: latestState.title,
    planPath: latestState.planPath,
    qaTargets,
    userFacingExpectations: acceptanceCriteria.slice(0, 3),
    fallbackMessage: null
  };
}

export function buildReviewContextSnapshot(repoRoot: string): ReviewContextSnapshot {
  return buildReviewContextFromPlan(repoRoot);
}

export function buildQaContextSnapshot(repoRoot: string): QaContextSnapshot {
  return buildQaContextFromPlan(repoRoot);
}

export function persistWorkflowContextSnapshots(
  repoRoot: string,
  contexts: {
    readonly reviewContext?: ReviewContextSnapshot;
    readonly qaContext?: QaContextSnapshot;
  }
): LatestWorkflowState | null {
  const latestState = readLatestWorkflowState(repoRoot);
  if (!latestState) {
    return null;
  }

  const nextState: LatestWorkflowState = {
    ...latestState,
    ...contexts,
    updatedAt: new Date().toISOString()
  };
  writeLatestWorkflowState(repoRoot, nextState);
  return nextState;
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
  readonly officeHoursMode: OfficeHoursMode;
}): string {
  const learningBlock =
    options.rememberedLearnings.length === 0
      ? "- None recorded yet.\n"
      : options.rememberedLearnings
          .slice(-5)
          .map((learning) => `- ${learning.pattern}: ${learning.guidance}`)
          .join("\n");
  const normalizedIntent = cleanIntentLine(options.userIntent);

  return `# Brief: ${options.title}

- Initiative ID: \`${options.initiativeId}\`
- Workflow stage: \`office-hours\`
- Output path: \`docs/gstack/${options.initiativeId}/brief.md\`
- Selected mode: \`${options.officeHoursMode}\`

## Office Hours Mode

- Mode: \`${options.officeHoursMode}\`
- Guidance: ${buildModeRationale(options.officeHoursMode)}

## User Intent

${normalizedIntent}

## Reframe

### What You Said

${normalizedIntent}

### What You Are Actually Building

${buildActualBuildStatement(options.title, options.officeHoursMode)}

## Forcing Questions

${buildModeQuestions(options.officeHoursMode, options.title)}

## Premise Challenge

${buildPremiseChallenge(options.officeHoursMode)}

## Implementation Alternatives

${buildImplementationAlternatives(options.title, options.officeHoursMode)}

## Recommendation

${buildRecommendation(options.title, options.officeHoursMode)}

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
    `## ${escapeRegExp(sectionTitle)}\\n\\n([\\s\\S]*?)(?=\\n## [^\\n]+\\n\\n|\\s*$)`
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
    `## ${escapeRegExp(sectionTitle)}\\n\\n[\\s\\S]*?(?=\\n## [^\\n]+\\n\\n|\\s*$)`
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
      briefMarkdown,
      officeHoursMode: latestState?.initiativeId === options.initiativeId
        ? latestState.officeHoursMode ?? selectOfficeHoursMode(briefMarkdown)
        : selectOfficeHoursMode(briefMarkdown)
    };
  }

  if (latestState?.briefPath) {
    const briefMarkdown = readWorkflowArtifact(repoRoot, latestState.initiativeId, "brief");
    if (briefMarkdown) {
      return {
        initiativeId: latestState.initiativeId,
        title: latestState.title,
        briefPath: latestState.briefPath,
        briefMarkdown,
        officeHoursMode: latestState.officeHoursMode ?? selectOfficeHoursMode(briefMarkdown)
      };
    }
  }

  if (!options.userIntent) {
    throw new Error("A raw user intent is required when no brief exists.");
  }

  return startOfficeHoursWorkflow(repoRoot, options.userIntent, now);
}

export function buildBriefSnapshot(briefMarkdown: string): string {
  return briefMarkdown.split("\n").slice(0, 20).join("\n");
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
  const scopeMode = selectCeoScopeMode(options.briefMarkdown);
  const ceoBody = joinBullets([
    `Scope mode: \`${scopeMode}\`.`,
    `Product reframe: ${options.title} should win one narrow workflow before adding adjacent breadth.`,
    "Accepted premise: the first release must teach something real about repeat usage or operator value.",
    "Accepted premise: remove work that does not change the first useful path.",
    `Approval gate: ${buildCeoApprovalGate(scopeMode)}`
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
    ? [
        "### Scorecard",
        joinBullets(buildDesignScores(options.title)),
        "",
        "### Unresolved Taste Decisions",
        joinBullets(buildUnresolvedTasteDecisions(options.title)),
        "",
        "### User-Facing Expectations",
        joinBullets([
          `The first screen for ${options.title} should explain the wedge in one glance.`,
          "Primary actions should be obvious before secondary diagnostics or settings.",
          "Copy, defaults, and visual hierarchy should avoid generic AI-product styling."
        ])
      ].join("\n")
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
  const engBody = [
    "### Architecture",
    joinBullets([
      `Lock the core architecture for ${options.title} before editing the repo.`,
      "Identify the smallest module boundary that can deliver the wedge end to end."
    ]),
    "",
    "### Data Flow",
    joinBullets([
      "Map input, state transitions, persistence, and user-visible output explicitly.",
      "Call out any browser, filesystem, or repo-local boundary that cannot drift."
    ]),
    "",
    "### Failure Modes",
    joinBullets([
      "List regressions, empty-state behavior, and partial-write failure cases.",
      "Make fallback behavior explicit instead of silently masking state problems."
    ]),
    "",
    "### Trust Boundaries",
    joinBullets([
      "Preserve local-only behavior and existing browser hardening.",
      "Do not add remote control, tunnels, or cross-workspace leakage."
    ]),
    "",
    "### Test Plan",
    joinBullets([
      "Add or update command-level workflow coverage.",
      "Verify lint, test, and security checks against the persisted plan."
    ])
  ].join("\n");
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
    readonly ceoScopeMode: CeaScopeMode;
    readonly unresolvedTasteDecisions: readonly string[];
    readonly includeDesignReview: boolean;
  }
): string {
  let planMarkdown = initializePlanDocument(repoRoot, options);
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Implementation Plan",
    `### Chosen Implementation Approach

- CEO scope mode: \`${options.ceoScopeMode}\`
- Build the narrowest release that still feels like a real product wedge.
- Keep the plan executable by one implementation thread without hidden dependency work.

### Implementation Checklist

1. Read the brief and current repo shape before editing.
2. Implement the smallest end-to-end change that satisfies the wedge.
3. Keep review-stage artifacts and runtime state aligned as changes land.
4. Run \`/review\` against the persisted plan, then \`/qa\` or browser verification as needed.
5. Use \`/ship\` only after the plan and verification criteria are satisfied.`
  );
  planMarkdown = updatePlanSection(
    planMarkdown,
    "Acceptance Criteria",
    joinBullets([
      "The implementation follows this saved plan rather than improvised prompting.",
      "New behavior is covered by tests or an exact manual verification path.",
      "Review and QA both reference the current plan artifact and its acceptance criteria.",
      options.includeDesignReview
        ? "User-facing polish decisions are either resolved or explicitly called out as open."
        : "Non-user-facing work preserves trusted internal boundaries and operational clarity."
    ])
  );
  planMarkdown = updatePlanSection(
    planMarkdown,
    "QA Targets",
    joinBullets([
      "Validate the implementation against the saved acceptance criteria before fallback checks.",
      "Confirm the implementation checklist was followed and the active plan path is still current.",
      ...(options.unresolvedTasteDecisions.length === 0
        ? ["No unresolved taste decisions remain from planning."]
        : options.unresolvedTasteDecisions.map((decision) => `Open taste decision: ${decision}`))
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
  const officeHoursMode = selectOfficeHoursMode(userIntent);
  const briefMarkdown = renderBriefMarkdown({
    initiativeId,
    title,
    userIntent,
    rememberedLearnings,
    officeHoursMode
  });
  const briefPath = writeWorkflowArtifact(repoRoot, initiativeId, "brief", briefMarkdown);

  writeLatestWorkflowState(repoRoot, {
    initiativeId,
    title,
    status: "briefed",
    briefPath,
    officeHoursMode,
    reviewSequence: [],
    unresolvedTasteDecisions: [],
    updatedAt: now.toISOString()
  });

  return {
    initiativeId,
    title,
    briefPath,
    briefMarkdown,
    officeHoursMode
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
  const ceoScopeMode = selectCeoScopeMode(briefResult.briefMarkdown);
  const unresolvedTasteDecisions = includeDesignReview
    ? buildUnresolvedTasteDecisions(briefResult.title)
    : [];
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
    executedReviewSequence,
    ceoScopeMode,
    unresolvedTasteDecisions,
    includeDesignReview
  });
  const planPath = getWorkflowPaths(repoRoot, briefResult.initiativeId).planPath;

  writeLatestWorkflowState(repoRoot, {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    status: "planned",
    briefPath: briefResult.briefPath,
    planPath,
    reviewSequence: executedReviewSequence,
    officeHoursMode: briefResult.officeHoursMode,
    ceoScopeMode,
    unresolvedTasteDecisions,
    updatedAt: now.toISOString()
  });

  return {
    initiativeId: briefResult.initiativeId,
    title: briefResult.title,
    planPath,
    planMarkdown,
    reviewSequence: executedReviewSequence,
    implementNextMessage: buildImplementNextMessage(briefResult.initiativeId),
    ceoScopeMode,
    unresolvedTasteDecisions
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
    ...(latestState?.officeHoursMode
      ? { officeHoursMode: latestState.officeHoursMode }
      : {}),
    ...(latestState?.ceoScopeMode ? { ceoScopeMode: latestState.ceoScopeMode } : {}),
    unresolvedTasteDecisions: latestState?.unresolvedTasteDecisions ?? [],
    ...(latestState?.reviewContext ? { reviewContext: latestState.reviewContext } : {}),
    ...(latestState?.qaContext ? { qaContext: latestState.qaContext } : {}),
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
