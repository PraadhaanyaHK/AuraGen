import {
  FrictionScoreResponseSchema,
  TELEMETRY_WINDOW_MS,
  type FrictionScoreResponse,
  type TelemetrySummary,
} from "./contracts.js";
import { PROVISIONAL_FRICTION_POLICY as policy } from "./frictionPolicy.js";

type TelemetryCounts = TelemetrySummary["counts"];
type ScoringCountKey =
  | "validationErrors"
  | "repeatedClicks"
  | "prolongedUnchangedHesitations"
  | "backtracks"
  | "fieldSwitches";

export type FrictionScoringInput = {
  counts: Pick<TelemetryCounts, ScoringCountKey> &
    Partial<Pick<TelemetryCounts, "pointerCorrections" | "mouseSamples">>;
};

export type FrictionScoreResult = Omit<
  FrictionScoreResponse,
  "eligibleForAdaptation" | "triggerEligibility"
>;

export type AdaptationTriggerState = {
  consecutiveHighWindows: number;
  independentSignalInHighStreak: boolean;
  lastProcessedWindowEnd: string | null;
  cooldownUntil: number | null;
  automaticAdaptationOverridden: boolean;
  restoredWindowEnd: string | null;
  lastTriggeredWindowEnd: string | null;
};

export type TriggerEvaluation = {
  state: AdaptationTriggerState;
  scoreResponse: FrictionScoreResponse;
  windowProcessed: boolean;
  triggeredAutomatically: boolean;
  triggeredManually: boolean;
};

type TriggerBlocker =
  FrictionScoreResponse["triggerEligibility"]["blockers"][number];

type FeatureName = keyof FrictionScoreResponse["features"];

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
}

function explainFeature(
  feature: FeatureName,
  count: number,
  included: boolean,
  exclusion: string | undefined,
): FrictionScoreResponse["explanations"][number] {
  const weight = policy.weights[feature];
  const normalizedValue = included
    ? Math.min(count / policy.normalizationCounts[feature], 1)
    : 0;
  const weightedContribution = included ? weight * normalizedValue : 0;
  const detail = included
    ? `${count} events; normalized ${normalizedValue.toFixed(2)} at ${(weight * 100).toFixed(0)}% weight.`
    : exclusion ?? "Feature unavailable.";

  return {
    feature,
    count,
    normalizedValue,
    weight,
    weightedContribution,
    included,
    explanation: detail,
  };
}

function levelForScore(score: number): FrictionScoreResponse["level"] {
  if (score <= policy.bands.lowMaximum) {
    return "low";
  }
  if (score <= policy.bands.moderateMaximum) {
    return "moderate";
  }
  return "high";
}

export function scoreInteractionFriction(
  input: FrictionScoringInput,
): FrictionScoreResult {
  const { counts } = input;
  const ordinaryCounts: [string, number][] = [
    ["validationErrors", counts.validationErrors],
    ["repeatedClicks", counts.repeatedClicks],
    ["prolongedUnchangedHesitations", counts.prolongedUnchangedHesitations],
    ["backtracks", counts.backtracks],
    ["fieldSwitches", counts.fieldSwitches],
  ];
  for (const [name, count] of ordinaryCounts) {
    assertCount(name, count);
  }

  const pointerAvailable =
    counts.pointerCorrections !== undefined &&
    counts.mouseSamples !== undefined;
  const mouseSampleCount = counts.mouseSamples ?? 0;
  if (counts.pointerCorrections !== undefined) {
    assertCount("pointerCorrections", counts.pointerCorrections);
  }
  if (counts.mouseSamples !== undefined) {
    assertCount("mouseSamples", mouseSampleCount);
  }
  const pointerUsable =
    pointerAvailable &&
    mouseSampleCount >= policy.minimumMouseSamples;

  const validationErrors = explainFeature(
    "validationErrors",
    counts.validationErrors,
    true,
    undefined,
  );
  const repeatedClicks = explainFeature(
    "repeatedClicks",
    counts.repeatedClicks,
    true,
    undefined,
  );
  const hesitations = explainFeature(
    "hesitations",
    counts.prolongedUnchangedHesitations,
    true,
    undefined,
  );
  const backtracks = explainFeature(
    "backtracks",
    counts.backtracks,
    true,
    undefined,
  );
  const fieldSwitches = explainFeature(
    "fieldSwitches",
    counts.fieldSwitches,
    true,
    undefined,
  );
  const pointerCorrections = explainFeature(
    "pointerCorrections",
    counts.pointerCorrections ?? 0,
    pointerUsable,
    !pointerAvailable
      ? "Pointer correction data is unavailable; its weight is excluded."
      : mouseSampleCount < policy.minimumMouseSamples
        ? `Only ${mouseSampleCount} usable mouse samples; at least ${policy.minimumMouseSamples} are required.`
        : undefined,
  );
  const explanations = [
    validationErrors,
    repeatedClicks,
    hesitations,
    backtracks,
    fieldSwitches,
    pointerCorrections,
  ];
  const availableWeight = explanations.reduce(
    (total, feature) => total + (feature.included ? feature.weight : 0),
    0,
  );
  const weightedTotal = explanations.reduce(
    (total, feature) => total + feature.weightedContribution,
    0,
  );
  const score = Math.round((100 * weightedTotal) / availableWeight);

  return {
    score,
    level: levelForScore(score),
    features: {
      validationErrors: validationErrors.normalizedValue,
      repeatedClicks: repeatedClicks.normalizedValue,
      hesitations: hesitations.normalizedValue,
      backtracks: backtracks.normalizedValue,
      fieldSwitches: fieldSwitches.normalizedValue,
      pointerCorrections: pointerUsable
        ? pointerCorrections.normalizedValue
        : 0,
    },
    explanations,
    observedSignals: explanations
      .filter((feature) => feature.included && feature.count > 0)
      .map((feature) => {
        switch (feature.feature) {
          case "validationErrors":
            return "validation-errors" as const;
          case "repeatedClicks":
            return "repeated-clicks" as const;
          case "hesitations":
            return "hesitations" as const;
          case "backtracks":
            return "backtracking" as const;
          case "fieldSwitches":
            return "field-switching" as const;
          case "pointerCorrections":
            return "pointer-corrections" as const;
        }
      }),
  };
}

export function createAdaptationTriggerState(): AdaptationTriggerState {
  return {
    consecutiveHighWindows: 0,
    independentSignalInHighStreak: false,
    lastProcessedWindowEnd: null,
    cooldownUntil: null,
    automaticAdaptationOverridden: false,
    restoredWindowEnd: null,
    lastTriggeredWindowEnd: null,
  };
}

function toScoreResponse(
  score: FrictionScoreResult,
  automatic: boolean,
  blockers: TriggerBlocker[],
): FrictionScoreResponse {
  return FrictionScoreResponseSchema.parse({
    ...score,
    triggerEligibility: {
      automatic,
      manual: true,
      blockers,
    },
    eligibleForAdaptation: automatic,
  });
}

function noWindowEvaluation(
  score: FrictionScoreResult,
  state: AdaptationTriggerState,
  blocker: TriggerBlocker,
): TriggerEvaluation {
  return {
    state,
    scoreResponse: toScoreResponse(score, false, [blocker]),
    windowProcessed: false,
    triggeredAutomatically: false,
    triggeredManually: false,
  };
}

function hasIndependentTaskSignal(summary: TelemetrySummary): boolean {
  const { validationErrors, repeatedClicks, backtracks } = summary.counts;
  return validationErrors > 0 || repeatedClicks > 0 || backtracks > 0;
}

function eligibilityBlockers(
  score: FrictionScoreResult,
  state: AdaptationTriggerState,
  now: number,
  independentSignal: boolean,
  windowEnd: string,
): TriggerBlocker[] {
  const blockers: TriggerBlocker[] = [];
  if (score.score < policy.bands.highMinimum) {
    blockers.push("score-below-high");
  }
  if (state.consecutiveHighWindows < policy.consecutiveHighWindows) {
    blockers.push("awaiting-second-high-window");
  }
  if (!independentSignal) {
    blockers.push("independent-task-signal-required");
  }
  if (state.cooldownUntil !== null && now < state.cooldownUntil) {
    blockers.push("cooldown-active");
  }
  if (state.automaticAdaptationOverridden) {
    blockers.push("automatic-adaptation-overridden");
  }
  if (state.restoredWindowEnd === windowEnd) {
    blockers.push("window-already-restored");
  }
  if (state.lastTriggeredWindowEnd === windowEnd) {
    blockers.push("window-already-processed");
  }
  return blockers;
}

export function getFrictionScoreResponse(
  summary: TelemetrySummary,
  score: FrictionScoreResult,
  state: AdaptationTriggerState,
  now: number,
): FrictionScoreResponse {
  const blockers = eligibilityBlockers(
    score,
    state,
    now,
    state.independentSignalInHighStreak ||
      hasIndependentTaskSignal(summary),
    summary.windowEnd,
  );
  if (state.lastProcessedWindowEnd === summary.windowEnd) {
    if (!blockers.includes("window-already-processed")) {
      blockers.push("window-already-processed");
    }
  }
  return toScoreResponse(score, blockers.length === 0, blockers);
}

export function evaluateAdaptationTrigger(
  summary: TelemetrySummary,
  score: FrictionScoreResult,
  currentState: AdaptationTriggerState,
  now: number,
): TriggerEvaluation {
  const windowEnd = Date.parse(summary.windowEnd);
  const windowStart = Date.parse(summary.windowStart);
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) {
    throw new RangeError("Telemetry window must contain valid timestamps");
  }

  if (
    currentState.lastProcessedWindowEnd !== null &&
    windowEnd <= Date.parse(currentState.lastProcessedWindowEnd)
  ) {
    return noWindowEvaluation(
      score,
      currentState,
      "window-already-processed",
    );
  }

  let consecutive = currentState.lastProcessedWindowEnd === null;
  if (currentState.lastProcessedWindowEnd !== null) {
    const previousEnd = Date.parse(currentState.lastProcessedWindowEnd);
    const elapsed = windowEnd - previousEnd;
    if (elapsed < TELEMETRY_WINDOW_MS) {
      return noWindowEvaluation(score, currentState, "awaiting-next-window");
    }
    const windowGap = windowStart - previousEnd;
    consecutive =
      windowGap >= 0 &&
      windowGap <= policy.windowContinuityToleranceMs &&
      Math.abs(elapsed - TELEMETRY_WINDOW_MS) <=
        policy.windowContinuityToleranceMs;
  }

  const isHigh = score.score >= policy.bands.highMinimum;
  const consecutiveHighWindows = isHigh
    ? consecutive
      ? currentState.consecutiveHighWindows + 1
      : 1
    : 0;
  const independentSignalInHighStreak = isHigh
    ? (consecutive && currentState.independentSignalInHighStreak) ||
      hasIndependentTaskSignal(summary)
    : false;
  const nextState: AdaptationTriggerState = {
    ...currentState,
    consecutiveHighWindows,
    independentSignalInHighStreak,
    lastProcessedWindowEnd: summary.windowEnd,
  };
  const blockers = eligibilityBlockers(
    score,
    nextState,
    now,
    independentSignalInHighStreak,
    summary.windowEnd,
  );
  const automatic = blockers.length === 0;
  if (automatic) {
    nextState.cooldownUntil = now + policy.cooldownMs;
    nextState.lastTriggeredWindowEnd = summary.windowEnd;
  }

  return {
    state: nextState,
    scoreResponse: toScoreResponse(score, automatic, blockers),
    windowProcessed: true,
    triggeredAutomatically: automatic,
    triggeredManually: false,
  };
}

export function requestManualSimplification(
  summary: TelemetrySummary,
  score: FrictionScoreResult,
  currentState: AdaptationTriggerState,
  now: number,
): TriggerEvaluation {
  const nextState: AdaptationTriggerState = {
    ...currentState,
    cooldownUntil: now + policy.cooldownMs,
    lastTriggeredWindowEnd: summary.windowEnd,
  };
  const blockers = eligibilityBlockers(
    score,
    nextState,
    now,
    currentState.independentSignalInHighStreak ||
      hasIndependentTaskSignal(summary),
    summary.windowEnd,
  );
  const automatic = blockers.length === 0;
  return {
    state: nextState,
    scoreResponse: toScoreResponse(score, automatic, blockers),
    windowProcessed: false,
    triggeredAutomatically: false,
    triggeredManually: true,
  };
}

export function restoreOriginalPresentation(
  state: AdaptationTriggerState,
  windowEnd: string,
): AdaptationTriggerState {
  return {
    ...state,
    restoredWindowEnd: windowEnd,
  };
}

export function setAutomaticAdaptationOverridden(
  state: AdaptationTriggerState,
  overridden: boolean,
): AdaptationTriggerState {
  return { ...state, automaticAdaptationOverridden: overridden };
}
