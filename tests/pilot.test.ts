import { describe, expect, it } from "vitest";
import type { TelemetrySummary } from "../src/contracts.js";
import {
  createAdaptationTriggerState,
  evaluateAdaptationTrigger,
  scoreInteractionFriction,
} from "../src/friction.js";

type Scenario = {
  name: string;
  taskTimeMs: number;
  counts: Partial<TelemetrySummary["counts"]>;
  expectedScore: number;
  expectedAdaptations: number;
};

const scenarios: Scenario[] = [
  {
    name: "normal",
    taskTimeMs: 160_000,
    counts: { prolongedUnchangedHesitations: 1 },
    expectedScore: 11,
    expectedAdaptations: 0,
  },
  {
    name: "moderate-friction",
    taskTimeMs: 255_000,
    counts: {
      validationErrors: 1,
      repeatedClicks: 1,
      prolongedUnchangedHesitations: 1,
      backtracks: 1,
      fieldSwitches: 4,
    },
    expectedScore: 50,
    expectedAdaptations: 0,
  },
  {
    name: "high-friction",
    taskTimeMs: 430_000,
    counts: {
      validationErrors: 2,
      repeatedClicks: 2,
      prolongedUnchangedHesitations: 2,
      backtracks: 2,
      fieldSwitches: 8,
    },
    expectedScore: 100,
    expectedAdaptations: 1,
  },
];

const emptyCounts: TelemetrySummary["counts"] = {
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

function makeWindow(
  endMs: number,
  counts: Partial<TelemetrySummary["counts"]>,
): TelemetrySummary {
  return {
    windowStart: new Date(endMs - 30_000).toISOString(),
    windowEnd: new Date(endMs).toISOString(),
    windowDurationMs: 30_000,
    counts: { ...emptyCounts, ...counts },
    metrics: {
      totalHesitationDurationMs: 0,
      averageHesitationDurationMs: 0,
    },
  };
}

describe("reproducible synthetic pilot scenarios", () => {
  it.each(scenarios)(
    "$name scores consistently and records adaptation frequency",
    ({ taskTimeMs, counts, expectedScore, expectedAdaptations }) => {
      expect(taskTimeMs).toBeGreaterThan(0);
      const score = scoreInteractionFriction({
        counts: { ...emptyCounts, ...counts },
      });
      expect(score.score).toBe(expectedScore);

      let state = createAdaptationTriggerState();
      let adaptations = 0;
      for (const endMs of [30_000, 60_000]) {
        const result = evaluateAdaptationTrigger(
          makeWindow(endMs, counts),
          score,
          state,
          endMs,
        );
        state = result.state;
        adaptations += Number(result.triggeredAutomatically);
      }

      expect(adaptations).toBe(expectedAdaptations);
    },
  );

  it("does not mistake pointer-only activity or ordinary pauses for task friction", () => {
    const pointerOnlyCounts = {
      ...emptyCounts,
      pointerCorrections: 10,
      mouseSamples: 10,
    };
    const pointerOnlyScore = scoreInteractionFriction({
      counts: pointerOnlyCounts,
    });
    expect(pointerOnlyScore.score).toBe(5);

    const ordinaryPauseCounts = {
      ...emptyCounts,
      prolongedUnchangedHesitations: 1,
    };
    const pauseScore = scoreInteractionFriction({
      counts: ordinaryPauseCounts,
    });
    expect(pauseScore.score).toBe(11);
    const shortPauseCounts: TelemetrySummary["counts"] = {
      ...emptyCounts,
      hesitations: 5,
    };
    expect(
      scoreInteractionFriction({
        counts: shortPauseCounts,
      }).score,
    ).toBe(0);

    for (const counts of [pointerOnlyCounts, ordinaryPauseCounts]) {
      const score = scoreInteractionFriction({ counts });
      let state = createAdaptationTriggerState();
      for (const endMs of [30_000, 60_000]) {
        const result = evaluateAdaptationTrigger(
          makeWindow(endMs, counts),
          score,
          state,
          endMs,
        );
        state = result.state;
        expect(result.triggeredAutomatically).toBe(false);
      }
    }
  });
});
