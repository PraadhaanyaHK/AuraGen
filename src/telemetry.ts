import { useEffect, useMemo, useRef, useState } from "react";
import {
  TELEMETRY_WINDOW_MS,
  type FinancialFieldId,
  type TelemetrySummary,
} from "./contracts.js";
import { PROVISIONAL_FRICTION_POLICY } from "./frictionPolicy.js";

export const TELEMETRY_SUMMARY_INTERVAL_MS = 5_000;
export const REPEATED_CLICK_WINDOW_MS =
  PROVISIONAL_FRICTION_POLICY.repeatedClickWindowMs;

export type TelemetryClickTarget =
  | FinancialFieldId
  | "check-demo-fields"
  | "wizard-back"
  | "wizard-continue";

export type PointerMovementSample = {
  pointerType: string;
  movementX: number;
  movementY: number;
};

type CountKey = keyof TelemetrySummary["counts"];
type TelemetryDelta = Partial<Record<CountKey, number>> & {
  hesitationDurationMs?: number;
};

type TimedDelta = {
  at: number;
  delta: TelemetryDelta;
};

type ActiveFocus = {
  fieldId: FinancialFieldId;
  focusedAt: number;
  hesitationRecorded: boolean;
  valueChanged: boolean;
};

type MouseDirection = {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
  at: number;
};

const createEmptyCounts = (): TelemetrySummary["counts"] => ({
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
});

function directionSign(value: number): -1 | 0 | 1 {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }
  return value < 0 ? -1 : 1;
}

export class FinancialFormTelemetry {
  private readonly deltas: TimedDelta[] = [];
  private readonly lastClickAt = new Map<TelemetryClickTarget, number>();
  private activeFocus: ActiveFocus | undefined;
  private previousFocusedField: FinancialFieldId | undefined;
  private lastMouseDirection: MouseDirection | undefined;

  focus(fieldId: FinancialFieldId, at = Date.now()): void {
    this.completeHesitation(at);
    this.add(at, { focusEvents: 1 });
    if (
      this.previousFocusedField !== undefined &&
      this.previousFocusedField !== fieldId
    ) {
      this.add(at, { fieldSwitches: 1 });
    }
    this.previousFocusedField = fieldId;
    this.activeFocus = {
      fieldId,
      focusedAt: at,
      hesitationRecorded: false,
      valueChanged: false,
    };
  }

  blur(fieldId: FinancialFieldId, at = Date.now()): void {
    this.add(at, { blurEvents: 1 });
    if (this.activeFocus?.fieldId === fieldId) {
      const durationMs = Math.max(0, at - this.activeFocus.focusedAt);
      if (
        !this.activeFocus.valueChanged &&
        durationMs >= PROVISIONAL_FRICTION_POLICY.hesitationThresholdMs
      ) {
        this.add(at, { prolongedUnchangedHesitations: 1 });
      }
      this.completeHesitation(at);
      this.activeFocus = undefined;
    }
  }

  inputChange(fieldId: FinancialFieldId, at = Date.now()): void {
    this.add(at, { inputChanges: 1 });
    if (this.activeFocus?.fieldId === fieldId) {
      this.activeFocus.valueChanged = true;
      this.completeHesitation(at);
    }
  }

  click(target: TelemetryClickTarget, at = Date.now()): void {
    const previousAt = this.lastClickAt.get(target);
    if (
      previousAt !== undefined &&
      at >= previousAt &&
      at - previousAt <= REPEATED_CLICK_WINDOW_MS
    ) {
      this.add(at, { repeatedClicks: 1 });
    }
    this.lastClickAt.set(target, at);
  }

  validationFailure(at = Date.now()): void {
    this.add(at, { validationErrors: 1 });
  }

  wizardNavigation(fromStep: number, toStep: number, at = Date.now()): void {
    if (toStep < fromStep) {
      this.add(at, { backtracks: 1 });
    }
  }

  pointerMove(sample: PointerMovementSample, at = Date.now()): void {
    if (sample.pointerType !== "mouse") {
      return;
    }

    const x = directionSign(sample.movementX);
    const y = directionSign(sample.movementY);
    const previous = this.lastMouseDirection;
    let pointerCorrections = 0;
    if (
      previous !== undefined &&
      at >= previous.at &&
      at - previous.at <= 500 &&
      previous.x * x + previous.y * y < 0
    ) {
      pointerCorrections = 1;
    }
    this.add(at, { mouseSamples: 1, pointerCorrections });

    if (x !== 0 || y !== 0) {
      this.lastMouseDirection = { x, y, at };
    }
  }

  getSummary(at = Date.now()): TelemetrySummary {
    this.prune(at);
    const counts = createEmptyCounts();
    let totalHesitationDurationMs = 0;
    for (const timedDelta of this.deltas) {
      if (timedDelta.at > at) {
        continue;
      }
      const { delta } = timedDelta;
      for (const key of Object.keys(counts) as CountKey[]) {
        counts[key] += delta[key] ?? 0;
      }
      totalHesitationDurationMs += delta.hesitationDurationMs ?? 0;
    }

    return {
      windowStart: new Date(at - TELEMETRY_WINDOW_MS).toISOString(),
      windowEnd: new Date(at).toISOString(),
      windowDurationMs: TELEMETRY_WINDOW_MS,
      counts,
      metrics: {
        totalHesitationDurationMs,
        averageHesitationDurationMs:
          counts.hesitations === 0
            ? 0
            : Math.round(totalHesitationDurationMs / counts.hesitations),
      },
    };
  }

  reset(): void {
    this.deltas.length = 0;
    this.lastClickAt.clear();
    this.activeFocus = undefined;
    this.previousFocusedField = undefined;
    this.lastMouseDirection = undefined;
  }

  private completeHesitation(at: number): void {
    if (
      this.activeFocus === undefined ||
      this.activeFocus.hesitationRecorded
    ) {
      return;
    }

    const durationMs = Math.max(0, at - this.activeFocus.focusedAt);
    this.add(at, {
      hesitations: 1,
      hesitationDurationMs: durationMs,
    });
    this.activeFocus.hesitationRecorded = true;
  }

  private add(at: number, delta: TelemetryDelta): void {
    this.prune(at);
    this.deltas.push({ at, delta });
  }

  private prune(at: number): void {
    const earliestIncludedAt = at - TELEMETRY_WINDOW_MS;
    let retainedCount = 0;
    for (const timedDelta of this.deltas) {
      if (timedDelta.at >= earliestIncludedAt) {
        this.deltas[retainedCount] = timedDelta;
        retainedCount += 1;
      }
    }
    this.deltas.length = retainedCount;
  }
}

export type FinancialFormTelemetryEvents = {
  focus: (fieldId: FinancialFieldId) => void;
  blur: (fieldId: FinancialFieldId) => void;
  inputChange: (fieldId: FinancialFieldId) => void;
  click: (target: TelemetryClickTarget) => void;
  validationFailure: () => void;
  wizardNavigation: (fromStep: number, toStep: number) => void;
  pointerMove: (sample: PointerMovementSample) => void;
};

export function useFinancialFormTelemetry(enabled = true): {
  summary: TelemetrySummary;
  events: FinancialFormTelemetryEvents;
} {
  const telemetryRef = useRef<FinancialFormTelemetry | null>(null);
  if (telemetryRef.current === null) {
    telemetryRef.current = new FinancialFormTelemetry();
  }
  const telemetry = telemetryRef.current;
  const [summary, setSummary] = useState(() => telemetry.getSummary());

  useEffect(() => {
    if (!enabled) {
      telemetry.reset();
      setSummary(telemetry.getSummary());
      return;
    }

    const intervalId = window.setInterval(() => {
      setSummary(telemetry.getSummary());
    }, TELEMETRY_SUMMARY_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
      telemetry.reset();
    };
  }, [enabled, telemetry]);

  const events = useMemo<FinancialFormTelemetryEvents>(
    () => ({
      focus: (fieldId) => {
        if (enabled) telemetry.focus(fieldId);
      },
      blur: (fieldId) => {
        if (enabled) telemetry.blur(fieldId);
      },
      inputChange: (fieldId) => {
        if (enabled) telemetry.inputChange(fieldId);
      },
      click: (target) => {
        if (enabled) telemetry.click(target);
      },
      validationFailure: () => {
        if (enabled) telemetry.validationFailure();
      },
      wizardNavigation: (fromStep, toStep) => {
        if (enabled) telemetry.wizardNavigation(fromStep, toStep);
      },
      pointerMove: (sample) => {
        if (enabled) telemetry.pointerMove(sample);
      },
    }),
    [enabled, telemetry],
  );

  return { summary, events };
}
