import { describe, expect, it } from "vitest";

import {
  buildAutoplanReviewSequence,
  buildRouteConfirmationMessage,
  classifyWorkflowIntent,
  mapRouteToSkill,
  requiresDesignReview
} from "../src/workflow/router.js";

describe("workflow router", () => {
  it("routes exploratory product ideas to office-hours", () => {
    const decision = classifyWorkflowIntent(
      "I want to build a daily briefing app and I am still rambling through the idea"
    );

    expect(decision.route).toBe("office-hours");
    expect(decision.suggestedSkill).toBe("codex-gstack-office-hours");
    expect(decision.requiresConfirmation).toBe(false);
  });

  it("routes explicit planning requests to autoplan with confirmation", () => {
    const decision = classifyWorkflowIntent("Help me plan this API redesign and give me a working plan");

    expect(decision.route).toBe("autoplan");
    expect(decision.suggestedSkill).toBe(mapRouteToSkill("autoplan"));
    expect(decision.requiresConfirmation).toBe(true);
    expect(buildRouteConfirmationMessage(decision)).toContain("codex-gstack-autoplan");
  });

  it("leaves direct execution requests outside the workflow", () => {
    const decision = classifyWorkflowIntent("Fix the typo in README and update the test");

    expect(decision.route).toBe("direct");
    expect(decision.suggestedSkill).toBeNull();
  });

  it("includes design review only for user-facing initiatives", () => {
    expect(requiresDesignReview("Build a polished onboarding flow for the web app")).toBe(true);
    expect(requiresDesignReview("Plan a backend worker queue migration")).toBe(false);
    expect(buildAutoplanReviewSequence("Build a customer dashboard")).toEqual([
      "plan-ceo-review",
      "plan-design-review",
      "plan-eng-review"
    ]);
    expect(buildAutoplanReviewSequence("Refactor the internal CLI")).toEqual([
      "plan-ceo-review",
      "plan-eng-review"
    ]);
  });
});
