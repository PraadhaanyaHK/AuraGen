// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import {
  FIELD_IDS,
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
} from "../src/contracts.js";
import { createFallbackAdaptiveUiPlan } from "../src/adaptivePlan.js";

class DisconnectedMockWebSocket {
  static readonly OPEN = 1;
  static instances: DisconnectedMockWebSocket[] = [];
  readyState = 1;
  private readonly listeners = new Map<string, Set<EventListener>>();
  sent: string[] = [];

  constructor() {
    DisconnectedMockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  close(): void {}
  send(message: string): void {
    this.sent.push(message);
  }

  receive(message: unknown): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener(new MessageEvent("message", { data: JSON.stringify(message) }));
    }
  }
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", DisconnectedMockWebSocket);
}, 10_000);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  DisconnectedMockWebSocket.instances = [];
});

describe("synthetic personal loan form", () => {
  it("renders all ten catalogue fields with their approved control types", () => {
    vi.useFakeTimers();
    render(<App />);

    for (const definition of FINANCIAL_FORM_FIELDS) {
      expect(
        screen.getByLabelText(new RegExp(definition.label, "i")),
      ).toBeInTheDocument();
    }

    expect(screen.getByLabelText(/Employment type/i).tagName).toBe("SELECT");
    expect(screen.getByLabelText(/Purpose of the loan/i).tagName).toBe("SELECT");
    expect(screen.getByLabelText(/Years in current work/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText(/Number of active loans/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByLabelText(/Requested loan amount, INR/i)).toHaveAttribute(
      "type",
      "number",
    );
    expect(screen.getByText("Research Demo:")).toBeInTheDocument();
  });

  it("shows correction messages for values outside the shared validation rules", async () => {
    const user = userEvent.setup();
    render(<App />);

    const amount = screen.getByLabelText(/Requested loan amount/i);
    await user.type(amount, "9999");
    await user.tab();
    expect(
      await screen.findByText("Enter at least 10,000."),
    ).toBeInTheDocument();

    const years = screen.getByLabelText(/Years in current work/i);
    await user.type(years, "2.5");
    await user.tab();
    expect(await screen.findByText("Enter a whole number.")).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, "100000");
    await user.tab();
    expect(screen.queryByText("Enter at least 10,000.")).not.toBeInTheDocument();
  });

  it("keeps values when switching to and back from the wizard presentation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText(/Years in current work/i), "7");
    await user.type(
      screen.getByLabelText(/Requested loan amount/i),
      "250000",
    );

    await user.click(screen.getByRole("button", { name: "Wizard preview" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);

    await user.click(screen.getByRole("button", { name: "Original form" }));
    expect(screen.getByLabelText(/Years in current work/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Personal loan details", ...FINANCIAL_FORM_SECTIONS]);
  });

  it("supports manual simplification and restoring with automatic adaptation paused", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Simplify now" }));
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Restore original" }));
    expect(screen.getByRole("heading", { name: "Personal loan details" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Automatic simplification" }),
    ).toBeChecked();
  });

  it("renders the fallback plan with all ten fields exactly once and preserves values", async () => {
    const plan = createFallbackAdaptiveUiPlan();
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    expect(plan.steps.length).toBeLessThanOrEqual(5);
    expect(plan.steps.flatMap((step) => step.fieldIds)).toEqual(FIELD_IDS);

    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/Monthly take-home income/i), "60000");
    await user.click(screen.getByRole("button", { name: "Wizard preview" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByLabelText(/Monthly take-home income/i)).toHaveValue(60000);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Original form" }));
    expect(screen.getByLabelText(/Monthly take-home income/i)).toHaveValue(60000);
  });

  it("preserves values and navigation state through layouts and a second plan", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.change(screen.getByLabelText(/Employment type/i), { target: { value: "Salaried" } });
    fireEvent.change(screen.getByLabelText(/Years in current work/i), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText(/Monthly take-home income/i), { target: { value: "60000" } });
    fireEvent.change(screen.getByLabelText(/Requested loan amount/i), { target: { value: "250000" } });

    fireEvent.click(screen.getByRole("button", { name: "Wizard preview" }));
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");

    fireEvent.click(screen.getByRole("button", { name: "Original form" }));
    expect(screen.getByLabelText(/Employment type/i)).toHaveValue("Salaried");
    expect(screen.getByLabelText(/Years in current work/i)).toHaveValue(7);
    expect(screen.getByLabelText(/Monthly take-home income/i)).toHaveValue(60000);
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);

    fireEvent.click(screen.getByRole("button", { name: "Wizard preview" }));
    const socket = DisconnectedMockWebSocket.instances.at(-1);
    expect(socket).toBeDefined();
    const telemetryRequest = socket?.sent
      .map((message) => JSON.parse(message))
      .find((message) => message.event === "telemetry.summary");
    expect(telemetryRequest).toBeDefined();
    const secondPlan = {
      schemaVersion: "1.0",
      title: "A reorganized demo review",
      introduction: "The same fields are retained.",
      steps: [
        { id: "step-1", title: "Work", description: "Review work details.", fieldIds: ["employmentStatus", "experienceYears"] },
        { id: "step-2", title: "Cash flow", description: "Review cash flow.", fieldIds: ["monthlyTakeHomeIncome", "otherMonthlyIncome", "monthlyExpenses"] },
        { id: "step-3", title: "Commitments", description: "Review commitments.", fieldIds: ["currentMonthlyEmi", "activeLoanCount"] },
        { id: "step-4", title: "Request", description: "Review the request.", fieldIds: ["requestedLoanAmount", "tenureMonths", "loanPurpose"] },
      ],
    };
    act(() => {
      socket?.receive({
        protocolVersion: "1.1",
        requestId: telemetryRequest.requestId,
        event: "friction.score",
        payload: {
          score: 65,
          level: "high",
          features: {
            validationErrors: 0.5, repeatedClicks: 0.5, hesitations: 0,
            backtracks: 0, fieldSwitches: 0, pointerCorrections: 0,
          },
          explanations: [
            { feature: "validationErrors", count: 2, normalizedValue: 0.5, weight: 0.3, weightedContribution: 0.15, included: true, explanation: "Validation errors occurred." },
            { feature: "repeatedClicks", count: 0, normalizedValue: 0, weight: 0.2, weightedContribution: 0, included: true, explanation: "No repeated clicks." },
            { feature: "hesitations", count: 0, normalizedValue: 0, weight: 0.2, weightedContribution: 0, included: true, explanation: "No hesitation." },
            { feature: "backtracks", count: 0, normalizedValue: 0, weight: 0.15, weightedContribution: 0, included: true, explanation: "No backtracking." },
            { feature: "fieldSwitches", count: 0, normalizedValue: 0, weight: 0.1, weightedContribution: 0, included: true, explanation: "No field switching." },
            { feature: "pointerCorrections", count: 0, normalizedValue: 0, weight: 0.05, weightedContribution: 0, included: false, explanation: "Insufficient mouse samples." },
          ],
          observedSignals: ["validation-errors"],
          triggerEligibility: { automatic: true, manual: true, blockers: [] },
          eligibleForAdaptation: true,
        },
      });
    });
    const request = socket?.sent.map((message) => JSON.parse(message)).find(
      (message) => message.event === "adaptation.request",
    );
    expect(request).toBeDefined();
    act(() => {
      socket?.receive({
        protocolVersion: "1.1",
        requestId: request.requestId,
        event: "adaptation.plan",
        payload: secondPlan,
      });
    });

    expect(screen.getByRole("heading", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Years in current work/i)).toHaveValue(7);

    fireEvent.click(screen.getByRole("button", { name: "Restore original" }));
    expect(screen.getByLabelText(/Employment type/i)).toHaveValue("Salaried");
    expect(screen.getByLabelText(/Requested loan amount/i)).toHaveValue(250000);
  }, 10_000);

  it("keeps form completion available while telemetry is disconnected", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Check demo fields" }));
    expect(
      await screen.findByText(
        "The entered demo values pass validation. Nothing was submitted.",
      ),
    ).toBeInTheDocument();
  });

  it("validates the current wizard section before advancing", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Wizard preview" }));

    const workSection = screen.getByRole("region", {
      name: FINANCIAL_FORM_SECTIONS[0],
    });
    await user.type(
      within(workSection).getByLabelText(/Years in current work/i),
      "51",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(
      await screen.findByText("Enter no more than 50."),
    ).toBeInTheDocument();
  });
});
