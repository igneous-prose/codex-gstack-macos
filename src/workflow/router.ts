export type WorkflowRouteKind =
  | "office-hours"
  | "autoplan"
  | "review"
  | "qa"
  | "ship"
  | "retro"
  | "direct";

export type PlanningReviewStep =
  | "plan-ceo-review"
  | "plan-design-review"
  | "plan-eng-review";

export interface WorkflowRouteDecision {
  readonly route: WorkflowRouteKind;
  readonly reason: string;
  readonly requiresConfirmation: boolean;
  readonly suggestedSkill: string | null;
}

const directTaskMatchers = [
  /\bfix\b/,
  /\brefactor\b/,
  /\brename\b/,
  /\bdebug\b/,
  /\bimplement\b/,
  /\bupdate\b/,
  /\bedit\b/,
  /\bchange\b/,
  /\bwrite tests?\b/,
  /\bcommit\b/
];

const officeHoursMatchers = [
  /\bi want to build\b/,
  /\bthinking about\b/,
  /\bidea for\b/,
  /\bnew product\b/,
  /\bnew app\b/,
  /\bwhat if we\b/,
  /\brandom thought\b/,
  /\bramble\b/,
  /\bdump thoughts\b/,
  /\bbrainstorm\b/
];

const autoplanMatchers = [
  /\bautoplan\b/,
  /\bplan this\b/,
  /\bspec this\b/,
  /\bthink this through\b/,
  /\bhelp me plan\b/,
  /\bdesign a plan\b/,
  /\bworking plan\b/,
  /\bstructured plan\b/
];

const reviewMatchers = [/\breview this\b/, /\bcode review\b/, /\breview the branch\b/];
const qaMatchers = [
  /\bqa\b/,
  /\btest this\b/,
  /\bverify this\b/,
  /\bbrowse this\b/,
  /\bcheck staging\b/,
  /\btest the app\b/
];
const shipMatchers = [/\bship\b/, /\brelease\b/, /\bopen pr\b/, /\bopen a pr\b/];
const retroMatchers = [/\bretro\b/, /\bwhat did we learn\b/, /\bweekly retro\b/];

const userFacingMatchers = [
  /\bui\b/,
  /\bux\b/,
  /\bdesign\b/,
  /\bfrontend\b/,
  /\bfront-end\b/,
  /\bpage\b/,
  /\bdashboard\b/,
  /\blanding page\b/,
  /\bonboarding\b/,
  /\bmobile app\b/,
  /\bweb app\b/,
  /\bcustomer\b/,
  /\bend user\b/
];

const backendOnlyMatchers = [
  /\bapi\b/,
  /\bcli\b/,
  /\bsdk\b/,
  /\bworker\b/,
  /\bcron\b/,
  /\bbackend\b/,
  /\binfra\b/,
  /\bmigration\b/
];

function matchesAny(input: string, matchers: RegExp[]): boolean {
  return matchers.some((matcher) => matcher.test(input));
}

export function mapRouteToSkill(route: WorkflowRouteKind): string | null {
  switch (route) {
    case "office-hours":
      return "codex-gstack-office-hours";
    case "autoplan":
      return "codex-gstack-autoplan";
    case "review":
      return "codex-gstack-review";
    case "qa":
      return "codex-gstack-qa";
    case "ship":
      return "codex-gstack-ship";
    case "retro":
      return "codex-gstack-retro";
    default:
      return null;
  }
}

export function classifyWorkflowIntent(rawInput: string): WorkflowRouteDecision {
  const input = rawInput.trim().toLowerCase();
  if (input.length === 0) {
    return {
      route: "direct",
      reason: "Empty request does not need workflow routing.",
      requiresConfirmation: false,
      suggestedSkill: null
    };
  }

  if (matchesAny(input, retroMatchers)) {
    return {
      route: "retro",
      reason: "The request asks for reflection or project learnings.",
      requiresConfirmation: false,
      suggestedSkill: mapRouteToSkill("retro")
    };
  }

  if (matchesAny(input, shipMatchers)) {
    return {
      route: "ship",
      reason: "The request is about release or PR flow.",
      requiresConfirmation: false,
      suggestedSkill: mapRouteToSkill("ship")
    };
  }

  if (matchesAny(input, reviewMatchers)) {
    return {
      route: "review",
      reason: "The request is asking for a branch or code review.",
      requiresConfirmation: false,
      suggestedSkill: mapRouteToSkill("review")
    };
  }

  if (matchesAny(input, qaMatchers)) {
    return {
      route: "qa",
      reason: "The request is about browser verification or QA.",
      requiresConfirmation: false,
      suggestedSkill: mapRouteToSkill("qa")
    };
  }

  if (matchesAny(input, autoplanMatchers)) {
    return {
      route: "autoplan",
      reason: "The request explicitly asks for structured planning.",
      requiresConfirmation: true,
      suggestedSkill: mapRouteToSkill("autoplan")
    };
  }

  if (matchesAny(input, officeHoursMatchers) && !matchesAny(input, directTaskMatchers)) {
    return {
      route: "office-hours",
      reason: "The request is exploratory product thinking rather than an execution task.",
      requiresConfirmation: false,
      suggestedSkill: mapRouteToSkill("office-hours")
    };
  }

  return {
    route: "direct",
    reason: "The request looks like direct execution work and should not be forced through gstack planning.",
    requiresConfirmation: false,
    suggestedSkill: null
  };
}

export function requiresDesignReview(rawInput: string): boolean {
  const input = rawInput.trim().toLowerCase();
  if (input.length === 0) {
    return false;
  }

  if (matchesAny(input, userFacingMatchers)) {
    return true;
  }

  if (matchesAny(input, backendOnlyMatchers)) {
    return false;
  }

  return /\bapp\b/.test(input);
}

export function buildAutoplanReviewSequence(rawInput: string): PlanningReviewStep[] {
  const reviewSteps: PlanningReviewStep[] = ["plan-ceo-review"];
  if (requiresDesignReview(rawInput)) {
    reviewSteps.push("plan-design-review");
  }
  reviewSteps.push("plan-eng-review");
  return reviewSteps;
}

export function buildRouteConfirmationMessage(decision: WorkflowRouteDecision): string | null {
  if (!decision.requiresConfirmation || !decision.suggestedSkill) {
    return null;
  }

  return `Route this request through \`${decision.suggestedSkill}\`? ${decision.reason}`;
}
