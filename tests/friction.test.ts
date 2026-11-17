import { describe, expect, it } from "vitest";
import {
  FrictionScoreResponseSchema,
  type TelemetrySummary,
} from "../src/contracts.js";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  requestManualSimplification,
  restoreOriginalPresentation,
  scoreInteractionFriction,
  setAutomaticAdaptationOverridden,
  type FrictionScoreResult,
} from "../src/friction.js";
import { PROVISIONAL_FRICTION_POLICY } from "../src/frictionPolicy.js";

const emptyCounts = {
  focusEvents: 0,
  blurEvents: 0,
  inputChanges: 0,
  validationErrors: 0,
  repeatedClicks: 0,
  hesitations: 0,
  prolongedUnchangedHesitations: 0,
  backtracks: 0,
  fieldSwitches: 0,
  pointerCorrections: 0,
  mouseSamples: 0,
};

function score(overrides: Partial<typeof emptyCounts> = {}) {
  return scoreInteractionFriction({
    counts: { ...emptyCounts, ...overrides },
  });
}

function summary(
  windowEndMs: number,
  counts: Partial<TelemetrySummary["counts"]> = {},
): TelemetrySummary {
  const windowEnd = new Date(windowEndMs).toISOString();
  return {
    windowStart: new Date(windowEndMs - 30_000).toISOString(),
    windowEnd,
    windowDurationMs: 30_000,
    counts: { ...emptyCounts, ...counts },
    metrics: {
      totalHesitationDurationMs: 0,
      averageHesitationDurationMs: 0,
    },
  };
}

function makeHighAssessment(): FrictionScoreResult {
  return score({
    validationErrors: 2,
    repeatedClicks: 2,
    prolongedUnchangedHesitations: 2,
    backtracks: 2,
    fieldSwitches: 8,
    mouseSamples: 10,
  });
}

describe("provisional interaction friction score", () => {
  it("uses the documented weights and normalization caps", () => {
    expect(
      Object.values(PROVISIONAL_FRICTION_POLICY.weights).reduce(
        (total, weight) => total + weight,
        0,
      ),
    ).toBe(1);

    const result = score({
      validationErrors: 20,
      repeatedClicks: 20,
      prolongedUnchangedHesitations: 20,
      backtracks: 20,
      fieldSwitches: 80,
      pointerCorrections: 20,
      mouseSamples: 10,
    });
    expect(result.score).toBe(100);
    expect(Object.values(result.features)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("rounds normalized weighted scores at each band boundary", () => {
    expect(
      score({
        validationErrors: 2,
        fieldSwitches: 3,
        mouseSamples: 10,
      }),
    ).toMatchObject({ score: 34, level: "low" });
    expect(
      score({
        validationErrors: 2,
        fieldSwitches: 4,
        mouseSamples: 10,
      }),
    ).toMatchObject({ score: 35, level: "moderate" });
    expect(
      score({
        validationErrors: 2,
        repeatedClicks: 2,
        fieldSwitches: 7,
        mouseSamples: 10,
      }),
    ).toMatchObject({ score: 59, level: "moderate" });
    expect(
      score({
        validationErrors: 2,
        repeatedClicks: 2,
        prolongedUnchangedHesitations: 1,
        mouseSamples: 10,
      }),
    ).toMatchObject({ score: 60, level: "high" });
  });

  it("excludes unavailable or under-sampled pointer corrections and renormalizes", () => {
    const unavailable = scoreInteractionFriction({
      counts: {
        validationErrors: 2,
        repeatedClicks: 0,
        prolongedUnchangedHesitations: 0,
        backtracks: 0,
        fieldSwitches: 0,
      },
    });
    const underSampled = score({
      validationErrors: 2,
      pointerCorrections: 10,
      mouseSamples: 9,
    });

    for (const result of [unavailable, underSampled]) {
      expect(result.score).toBe(32);
      expect(result.features.pointerCorrections).toBe(0);
      expect(
        result.explanations.find(
          ({ feature }) => feature === "pointerCorrections",
        ),
      ).toMatchObject({ included: false, weightedContribution: 0 });
    }

    expect(
      score({
        pointerCorrections: 10,
        mouseSamples: 10,
      }).features.pointerCorrections,
    ).toBe(1);
  });

  it("returns a typed response with explanations and trigger eligibility", () => {
    const first = summary(30_000);
    const result = scoreInteractionFriction(first);
    const evaluation = evaluateAdaptationTrigger(
      first,
      result,
      createAdaptationTriggerState(),
      30_000,
    );

    expect(
      FrictionScoreResponseSchema.safeParse(evaluation.scoreResponse).success,
    ).toBe(true);
    expect(evaluation.scoreResponse.explanations).toHaveLength(6);
    expect(evaluation.scoreResponse.triggerEligibility).toMatchObject({
      automatic: false,
      manual: true,
    });
    expect(JSON.stringify(evaluation.scoreResponse)).not.toMatch(
      /probability|emotion/i,
    );
  });
});

describe("adaptation trigger hysteresis and controls", () => {
  it("requires two consecutive high 30-second windows", () => {
    const high = makeHighAssessment();
    const firstWindow = summary(30_000, { validationErrors: 1 });
    const secondWindow = summary(60_000, { validationErrors: 1 });
    const first = evaluateAdaptationTrigger(
      firstWindow,
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const second = evaluateAdaptationTrigger(
      secondWindow,
      high,
      first.state,
      60_000,
    );

    expect(first.triggeredAutomatically).toBe(false);
    expect(first.state.consecutiveHighWindows).toBe(1);
    expect(second.triggeredAutomatically).toBe(true);
    expect(second.scoreResponse.eligibleForAdaptation).toBe(true);
    expect(
      FrictionScoreResponseSchema.safeParse(second.scoreResponse).success,
    ).toBe(true);
  });

  it("does not count overlapping or non-consecutive windows as a streak", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000, { validationErrors: 1 }),
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const overlapping = evaluateAdaptationTrigger(
      summary(35_000, { validationErrors: 1 }),
      high,
      first.state,
      35_000,
    );
    expect(overlapping.windowProcessed).toBe(false);
    expect(overlapping.state.consecutiveHighWindows).toBe(1);

    const gap = evaluateAdaptationTrigger(
      summary(70_000, { validationErrors: 1 }),
      high,
      first.state,
      70_000,
    );
    expect(gap.triggeredAutomatically).toBe(false);
    expect(gap.state.consecutiveHighWindows).toBe(1);
  });

  it("requires an independent task signal even for a high score", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000),
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const second = evaluateAdaptationTrigger(
      summary(60_000),
      high,
      first.state,
      60_000,
    );
    expect(second.triggeredAutomatically).toBe(false);
    expect(second.scoreResponse.triggerEligibility.blockers).toContain(
      "independent-task-signal-required",
    );
  });

  it("accepts an independent signal from either window in the high-score streak", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000, { validationErrors: 1 }),
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const second = evaluateAdaptationTrigger(
      summary(60_000),
      high,
      first.state,
      60_000,
    );

    expect(second.triggeredAutomatically).toBe(true);
  });

  it("blocks automatic adaptation during cooldown, then allows it at expiry", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000, { validationErrors: 1 }),
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const triggered = evaluateAdaptationTrigger(
      summary(60_000, { validationErrors: 1 }),
      high,
      first.state,
      60_000,
    );
    expect(triggered.state.cooldownUntil).toBe(
      60_000 + PROVISIONAL_FRICTION_POLICY.cooldownMs,
    );

    const coolingDown = evaluateAdaptationTrigger(
      summary(90_000, { validationErrors: 1 }),
      high,
      triggered.state,
      90_000,
    );
    expect(coolingDown.triggeredAutomatically).toBe(false);
    expect(coolingDown.scoreResponse.triggerEligibility.blockers).toContain(
      "cooldown-active",
    );

    const expired = evaluateAdaptationTrigger(
      summary(120_000, { validationErrors: 1 }),
      high,
      coolingDown.state,
      60_000 + PROVISIONAL_FRICTION_POLICY.cooldownMs,
    );
    expect(expired.triggeredAutomatically).toBe(true);
  });

  it("honors automatic override and lets a manual request bypass automatic gates", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000, { validationErrors: 1 }),
      high,
      setAutomaticAdaptationOverridden(
        createAdaptationTriggerState(),
        true,
      ),
      30_000,
    );
    const second = evaluateAdaptationTrigger(
      summary(60_000, { validationErrors: 1 }),
      high,
      first.state,
      60_000,
    );
    expect(second.triggeredAutomatically).toBe(false);
    expect(second.scoreResponse.triggerEligibility.blockers).toContain(
      "automatic-adaptation-overridden",
    );

    const manual = requestManualSimplification(
      summary(60_000),
      score(),
      {
        ...createAdaptationTriggerState(),
        automaticAdaptationOverridden: true,
        cooldownUntil: 100_000,
      },
      60_000,
    );
    expect(manual.triggeredManually).toBe(true);
    expect(
      FrictionScoreResponseSchema.safeParse(manual.scoreResponse).success,
    ).toBe(true);
    expect(manual.state.automaticAdaptationOverridden).toBe(true);
    expect(manual.state.cooldownUntil).toBe(
      60_000 + PROVISIONAL_FRICTION_POLICY.cooldownMs,
    );
  });

  it("restoring suppresses the same window without opting out of future windows", () => {
    const high = makeHighAssessment();
    const first = evaluateAdaptationTrigger(
      summary(30_000, { validationErrors: 1 }),
      high,
      createAdaptationTriggerState(),
      30_000,
    );
    const restoredState = restoreOriginalPresentation(
      first.state,
      summary(60_000).windowEnd,
    );
    const second = evaluateAdaptationTrigger(
      summary(60_000, { validationErrors: 1 }),
      high,
      restoredState,
      60_000,
    );

    expect(second.triggeredAutomatically).toBe(false);
    expect(second.scoreResponse.triggerEligibility.blockers).toContain(
      "window-already-restored",
    );
    expect(second.state.automaticAdaptationOverridden).toBe(false);
  });
});
