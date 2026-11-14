// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { TelemetrySummarySchema } from "../src/contracts.js";
import {
  FinancialFormTelemetry,
  REPEATED_CLICK_WINDOW_MS,
  TELEMETRY_SUMMARY_INTERVAL_MS,
  useFinancialFormTelemetry,
} from "../src/telemetry.js";
import {
  simulateBlur,
  simulateClick,
  simulateFocus,
  simulateInputChange,
  simulatePointerMovement,
  simulateValidationFailure,
  simulateWizardNavigation,
} from "./helpers/telemetry.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("financial form telemetry", () => {
  it("keeps an exact rolling 30-second window of aggregate event deltas", () => {
    const telemetry = new FinancialFormTelemetry();
    simulateValidationFailure(telemetry, 2_000);
    simulateInputChange(telemetry, "experienceYears", 3_000);

    const summary = telemetry.getSummary(32_000);
    expect(summary.counts.validationErrors).toBe(1);
    expect(summary.counts.inputChanges).toBe(1);
    expect(summary.windowStart).toBe(new Date(2_000).toISOString());
    expect(summary.windowEnd).toBe(new Date(32_000).toISOString());

    const expired = telemetry.getSummary(32_001);
    expect(expired.counts.validationErrors).toBe(0);
    expect(expired.counts.inputChanges).toBe(1);
    expect(expired.windowDurationMs).toBe(30_000);

    expect(telemetry.getSummary(33_001).counts.inputChanges).toBe(0);
  });

  it("keeps out-of-order simulated events within the correct timestamp window", () => {
    const telemetry = new FinancialFormTelemetry();
    simulateValidationFailure(telemetry, 30_000);
    simulateInputChange(telemetry, "experienceYears", 1_000);

    const summary = telemetry.getSummary(31_001);
    expect(summary.counts.validationErrors).toBe(1);
    expect(summary.counts.inputChanges).toBe(0);
  });

  it("counts repeated clicks on one target only within the timing threshold", () => {
    const telemetry = new FinancialFormTelemetry();
    simulateClick(telemetry, "experienceYears", 1_000);
    simulateClick(
      telemetry,
      "experienceYears",
      1_000 + REPEATED_CLICK_WINDOW_MS,
    );
    simulateClick(telemetry, "experienceYears", 3_501);
    simulateClick(telemetry, "experienceYears", 4_000);
    simulateClick(telemetry, "wizard-back", 4_000);

    expect(telemetry.getSummary(5_000).counts.repeatedClicks).toBe(2);
  });

  it("measures one hesitation from focus until first change without retaining input", () => {
    const telemetry = new FinancialFormTelemetry();
    simulateFocus(telemetry, "experienceYears", 10_000);
    simulateInputChange(telemetry, "experienceYears", 11_250);
    simulateInputChange(telemetry, "experienceYears", 11_500);
    simulateBlur(telemetry, "experienceYears", 12_000);

    const summary = telemetry.getSummary(12_000);
    expect(summary.counts.focusEvents).toBe(1);
    expect(summary.counts.blurEvents).toBe(1);
    expect(summary.counts.inputChanges).toBe(2);
    expect(summary.counts.hesitations).toBe(1);
    expect(summary.metrics).toEqual({
      totalHesitationDurationMs: 1_250,
      averageHesitationDurationMs: 1_250,
    });
  });

  it("counts switches between approved fields and wizard backtracking", () => {
    const telemetry = new FinancialFormTelemetry();
    simulateFocus(telemetry, "experienceYears", 100);
    simulateBlur(telemetry, "experienceYears", 110);
    simulateFocus(telemetry, "monthlyExpenses", 200);
    simulateBlur(telemetry, "monthlyExpenses", 210);
    simulateFocus(telemetry, "monthlyExpenses", 220);
    simulateFocus(telemetry, "experienceYears", 230);
    simulateWizardNavigation(telemetry, 3, 2, 240);
    simulateWizardNavigation(telemetry, 2, 3, 250);

    const summary = telemetry.getSummary(300);
    expect(summary.counts.fieldSwitches).toBe(2);
    expect(summary.counts.backtracks).toBe(1);
  });

  it("uses mouse-only pointer direction diagnostics and exposes no raw data", () => {
    const telemetry = new FinancialFormTelemetry();
    simulatePointerMovement(
      telemetry,
      { pointerType: "mouse", movementX: 8, movementY: 0 },
      1_000,
    );
    simulatePointerMovement(
      telemetry,
      { pointerType: "mouse", movementX: -4, movementY: 0 },
      1_100,
    );
    for (const pointerType of ["touch", "pen", "unknown"]) {
      simulatePointerMovement(
        telemetry,
        { pointerType, movementX: -4, movementY: 0 },
        1_200,
      );
    }

    const summary = telemetry.getSummary(2_000);
    expect(summary.counts.mouseSamples).toBe(2);
    expect(summary.counts.pointerCorrections).toBe(1);
    expect(TelemetrySummarySchema.safeParse(summary).success).toBe(true);
    expect(Object.keys(summary)).toEqual([
      "windowStart",
      "windowEnd",
      "windowDurationMs",
      "counts",
      "metrics",
    ]);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("clientX");
    expect(serialized).not.toContain("clientY");
    expect(serialized).not.toContain("movementX");
    expect(serialized).not.toContain("typed characters");
  });

  it("publishes summaries every five seconds, can be disabled, and cleans up", () => {
    vi.useFakeTimers();
    const enabled = renderHook(() => useFinancialFormTelemetry());
    act(() => enabled.result.current.events.focus("experienceYears"));
    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));
    expect(enabled.result.current.summary.counts.focusEvents).toBe(1);
    enabled.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const disabled = renderHook(() => useFinancialFormTelemetry(false));
    act(() => disabled.result.current.events.focus("experienceYears"));
    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));
    expect(disabled.result.current.summary.counts.focusEvents).toBe(0);
    disabled.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows only aggregate counters and metrics after a real form change", () => {
    vi.useFakeTimers();
    render(<App />);
    const field = screen.getByLabelText(/Years in current work/i);
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "923847561" } });
    fireEvent.blur(field);
    act(() => vi.advanceTimersByTime(TELEMETRY_SUMMARY_INTERVAL_MS));

    const summary = TelemetrySummarySchema.parse(
      JSON.parse(
        screen.getByLabelText("Local telemetry summary").textContent ?? "",
      ),
    );
    expect(summary.counts.inputChanges).toBe(1);
    expect(summary.counts.focusEvents).toBe(1);
    expect(summary.counts.blurEvents).toBe(1);
    expect(summary.counts.validationErrors).toBe(1);
    expect(JSON.stringify(summary)).not.toContain("923847561");
    expect(Object.keys(summary)).toEqual([
      "windowStart",
      "windowEnd",
      "windowDurationMs",
      "counts",
      "metrics",
    ]);
  });
});
