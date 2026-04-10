import path from "node:path";
import { fileURLToPath } from "node:url";

import { readMultiOptionValues, readOptionValue } from "../browser/argv.js";
import { resolveTargetRepo } from "../browser/config.js";
import {
  applyCeoReview,
  applyDesignReview,
  applyEngReview,
  buildQaContextSnapshot,
  buildReviewContextSnapshot,
  buildWorkflowStatusSnapshot,
  ensureBrief,
  getWorkflowPaths,
  persistWorkflowContextSnapshots,
  readLatestWorkflowState,
  readTeamBootstrapRecord,
  recordRetro,
  runAutoplan,
  type RouterStateRecord,
  writeLatestWorkflowState,
  writeRouterState
} from "./artifacts.js";
import {
  buildAutoplanReviewSequence,
  buildRouteConfirmationMessage,
  classifyWorkflowIntent,
  requiresDesignReview,
  type WorkflowRouteKind
} from "./router.js";

const ROUTE_WORKFLOW_COMMANDS = {
  "office-hours": "office-hours",
  autoplan: "autoplan",
  review: "review",
  qa: "qa",
  ship: "ship",
  retro: "retro"
} as const satisfies Record<Exclude<WorkflowRouteKind, "direct">, string>;

const SHIP_CHECKLIST = [
  "Run workflow review before shipping.",
  "Run workflow QA before shipping.",
  "Require green lint, typecheck, test, and security checks.",
  "Keep main protected.",
  "Prefer squash merge."
] as const;

function getWorkflowWrapperPath(command: string): string {
  const homeDir = process.env.HOME ?? "~";
  return path.join(homeDir, ".codex", "gstack-macos", "bin", command);
}

function getRepoLocalWorkflowWrapperPath(command: string): string {
  return `./.codex-gstack/bin/${command}`;
}

function resolveSuggestedCommand(route: WorkflowRouteKind, repoRoot: string): string | null {
  if (route === "direct") {
    return null;
  }

  const command = `gstack-workflow-${ROUTE_WORKFLOW_COMMANDS[route]}`;
  const installMode = readTeamBootstrapRecord(repoRoot)?.installMode;
  if (installMode === "repo-local") {
    return getRepoLocalWorkflowWrapperPath(command);
  }
  return getWorkflowWrapperPath(command);
}

function resolveSuggestedNpmScript(route: WorkflowRouteKind, repoRoot: string): string | null {
  if (route === "direct") {
    return null;
  }

  return `npm run workflow:${ROUTE_WORKFLOW_COMMANDS[route]} -- --repo ${repoRoot}`;
}

function requireInput(args: string[]): string {
  const input = readOptionValue(args, "--input");
  if (!input) {
    throw new Error("--input is required.");
  }
  return input;
}

function readInitiativeId(args: string[]): string | undefined {
  return readOptionValue(args, "--initiative-id");
}

function readTargetRepo(args: string[]): string {
  return resolveTargetRepo(readOptionValue(args, "--repo"));
}

function readLearningPairs(args: string[]): Array<{ pattern: string; guidance: string }> {
  return readMultiOptionValues(args, "--learning").map((rawValue) => {
    const [pattern, guidance] = rawValue.split("::");
    if (!pattern || !guidance) {
      throw new Error("--learning values must use pattern::guidance format.");
    }
    return {
      pattern: pattern.trim(),
      guidance: guidance.trim()
    };
  });
}

function printJson(body: unknown): void {
  console.log(JSON.stringify(body, null, 2));
}

function handleRouteCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const input = requireInput(args);
  const decision = classifyWorkflowIntent(input);
  const suggestedCommand = resolveSuggestedCommand(decision.route, repoRoot);
  const routerState: RouterStateRecord = {
    route: decision.route,
    suggestedSkill: decision.suggestedSkill,
    suggestedCommand,
    requiresConfirmation: decision.requiresConfirmation,
    reason: decision.reason,
    updatedAt: new Date().toISOString()
  };
  writeRouterState(repoRoot, routerState);

  printJson({
    route: decision.route,
    reason: decision.reason,
    requiresConfirmation: decision.requiresConfirmation,
    confirmationMessage: buildRouteConfirmationMessage(decision),
    suggestedSkill: decision.suggestedSkill,
    suggestedCommand,
    suggestedNpmScript: resolveSuggestedNpmScript(decision.route, repoRoot)
  });
}

function handleDispatchCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const input = requireInput(args);
  const decision = classifyWorkflowIntent(input);
  const workflowStatus = buildWorkflowStatusSnapshot(repoRoot);
  const suggestedCommand = resolveSuggestedCommand(decision.route, repoRoot);
  const routerStateBase = {
    route: decision.route,
    suggestedSkill: decision.suggestedSkill,
    suggestedCommand,
    requiresConfirmation: decision.requiresConfirmation,
    reason: decision.reason,
    updatedAt: new Date().toISOString()
  };
  const routerState: RouterStateRecord =
    workflowStatus.initiativeId === null
      ? routerStateBase
      : {
          ...routerStateBase,
          initiativeId: workflowStatus.initiativeId
        };
  writeRouterState(repoRoot, routerState);

  printJson({
    route: decision.route,
    reason: decision.reason,
    requiresConfirmation: decision.requiresConfirmation,
    confirmationMessage: buildRouteConfirmationMessage(decision),
    suggestedSkill: decision.suggestedSkill,
    suggestedCommand,
    activeInitiative: {
      initiativeId: workflowStatus.initiativeId,
      title: workflowStatus.title,
      status: workflowStatus.status,
      planPath: workflowStatus.planPath
    },
    suggestedNpmScript: resolveSuggestedNpmScript(decision.route, repoRoot)
  });
}

function handleOfficeHoursCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const input = requireInput(args);
  const result = ensureBrief(repoRoot, { userIntent: input });

  printJson({
    initiativeId: result.initiativeId,
    title: result.title,
    briefPath: result.briefPath,
    officeHoursMode: result.officeHoursMode
  });
}

function handleAutoplanCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const input = readOptionValue(args, "--input");
  const initiativeId = readInitiativeId(args);
  const autoplanOptions: {
    userIntent?: string;
    initiativeId?: string;
  } = {};
  if (input !== undefined) {
    autoplanOptions.userIntent = input;
  }
  if (initiativeId !== undefined) {
    autoplanOptions.initiativeId = initiativeId;
  }
  const result = runAutoplan(repoRoot, autoplanOptions);

  printJson({
    initiativeId: result.initiativeId,
    title: result.title,
    planPath: result.planPath,
    reviewSequence: result.reviewSequence,
    implementNextMessage: result.implementNextMessage,
    ceoScopeMode: result.ceoScopeMode,
    unresolvedTasteDecisions: result.unresolvedTasteDecisions
  });
}

function handlePlanReviewCommand(
  args: string[],
  reviewStep: "plan-ceo-review" | "plan-design-review" | "plan-eng-review"
): void {
  const repoRoot = readTargetRepo(args);
  const initiativeId = readInitiativeId(args) ?? readLatestWorkflowState(repoRoot)?.initiativeId;
  if (!initiativeId) {
    throw new Error(`${reviewStep} requires --initiative-id or an existing latest workflow state.`);
  }

  const briefResult = ensureBrief(repoRoot, { initiativeId });
  const plannedReviewSequence = buildAutoplanReviewSequence(briefResult.briefMarkdown);
  const latestState = readLatestWorkflowState(repoRoot);
  const executedReviewSequence = [...(latestState?.reviewSequence ?? [])];
  if (!executedReviewSequence.includes(reviewStep)) {
    executedReviewSequence.push(reviewStep);
  }

  if (reviewStep === "plan-ceo-review") {
    applyCeoReview(repoRoot, {
      initiativeId,
      title: briefResult.title,
      briefMarkdown: briefResult.briefMarkdown,
      plannedReviewSequence,
      executedReviewSequence
    });
  } else if (reviewStep === "plan-design-review") {
    applyDesignReview(repoRoot, {
      initiativeId,
      title: briefResult.title,
      plannedReviewSequence,
      executedReviewSequence,
      includeDesignReview: requiresDesignReview(briefResult.briefMarkdown)
    });
  } else {
    applyEngReview(repoRoot, {
      initiativeId,
      title: briefResult.title,
      plannedReviewSequence,
      executedReviewSequence
    });
  }

  writeLatestWorkflowState(repoRoot, {
    initiativeId,
    title: briefResult.title,
    status: "planned",
    briefPath: getWorkflowPaths(repoRoot, initiativeId).briefPath,
    planPath: getWorkflowPaths(repoRoot, initiativeId).planPath,
    reviewSequence: executedReviewSequence,
    officeHoursMode: briefResult.officeHoursMode,
    updatedAt: new Date().toISOString()
  });

  printJson({
    initiativeId,
    reviewStep,
    planPath: getWorkflowPaths(repoRoot, initiativeId).planPath,
    reviewSequence: executedReviewSequence
  });
}

function handleRetroCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const summary = readOptionValue(args, "--summary");
  if (!summary) {
    throw new Error("--summary is required.");
  }

  const retroOptions: {
    initiativeId?: string;
    summary: string;
    learnings: Array<{ pattern: string; guidance: string }>;
  } = {
    summary,
    learnings: readLearningPairs(args)
  };
  const initiativeId = readInitiativeId(args);
  if (initiativeId !== undefined) {
    retroOptions.initiativeId = initiativeId;
  }

  const result = recordRetro(repoRoot, retroOptions);

  printJson({
    initiativeId: result.initiativeId,
    retroPath: result.retroPath,
    learnings: result.learnings
  });
}

function handleStatusCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const snapshot = buildWorkflowStatusSnapshot(repoRoot);
  printJson(snapshot);
}

function handleReviewCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const reviewContext = buildReviewContextSnapshot(repoRoot);
  persistWorkflowContextSnapshots(repoRoot, { reviewContext });
  printJson(reviewContext);
}

function handleQaCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const qaContext = buildQaContextSnapshot(repoRoot);
  persistWorkflowContextSnapshots(repoRoot, { qaContext });
  printJson(qaContext);
}

function handleShipCommand(args: string[]): void {
  const repoRoot = readTargetRepo(args);
  const workflowStatus = buildWorkflowStatusSnapshot(repoRoot);

  printJson({
    initiativeId: workflowStatus.initiativeId,
    title: workflowStatus.title,
    status: workflowStatus.status,
    planPath: workflowStatus.planPath,
    suggestedSkill: "codex-gstack-ship",
    fallbackMessage:
      workflowStatus.planPath === null
        ? "No active plan found. Fall back to the existing codex-gstack-ship skill handoff."
        : null,
    shipChecklist: [...SHIP_CHECKLIST]
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    throw new Error("A workflow command is required.");
  }

  switch (command) {
    case "route":
      handleRouteCommand(args);
      break;
    case "dispatch":
      handleDispatchCommand(args);
      break;
    case "office-hours":
      handleOfficeHoursCommand(args);
      break;
    case "autoplan":
      handleAutoplanCommand(args);
      break;
    case "plan-ceo-review":
      handlePlanReviewCommand(args, "plan-ceo-review");
      break;
    case "plan-design-review":
      handlePlanReviewCommand(args, "plan-design-review");
      break;
    case "plan-eng-review":
      handlePlanReviewCommand(args, "plan-eng-review");
      break;
    case "retro":
      handleRetroCommand(args);
      break;
    case "status":
      handleStatusCommand(args);
      break;
    case "review":
      handleReviewCommand(args);
      break;
    case "qa":
      handleQaCommand(args);
      break;
    case "ship":
      handleShipCommand(args);
      break;
    default:
      throw new Error(`Unknown workflow command: ${command}`);
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);

if (entryPath === modulePath) {
  await main();
}
