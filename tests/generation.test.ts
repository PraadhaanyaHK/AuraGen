import { describe, expect, it, vi } from "vitest";
import {
  generateAdaptiveUiPlan,
  type GenerationProvider,
} from "../server/generation.js";
import { FIELD_IDS } from "../src/contracts.js";

const input = {
  frictionReasons: ["Repeated clicks", "Long hesitation"],
};

function providerReturning(response: unknown): GenerationProvider {
  return {
    generate: vi.fn(async () => response),
  };
}

const validModelPlan = {
  title: "Guided demo review",
  introduction: "Review the same approved fields in smaller groups.",
  steps: [
    {
      id: "step-1",
      title: "Work",
      description: "Review work details.",
      fieldIds: ["employmentStatus", "experienceYears"],
    },
    {
      id: "step-2",
      title: "Cash flow",
      description: "Review monthly cash flow.",
      fieldIds: [
        "monthlyTakeHomeIncome",
        "otherMonthlyIncome",
        "monthlyExpenses",
      ],
    },
    {
      id: "step-3",
      title: "Commitments",
      description: "Review existing commitments.",
      fieldIds: ["currentMonthlyEmi", "activeLoanCount"],
    },
    {
      id: "step-4",
      title: "Request",
      description: "Review the demo request.",
      fieldIds: ["requestedLoanAmount", "tenureMonths", "loanPurpose"],
    },
  ],
};

describe("structured generation pipeline", () => {
  it("uses the deterministic mock without credentials", async () => {
    const result = await generateAdaptiveUiPlan(input, { mode: "mock" });

    expect(result).toMatchObject({ mode: "mock", fallback: false });
    expect(result.plan.steps).toHaveLength(4);
    expect(result.plan.steps.flatMap((step) => step.fieldIds)).toEqual(FIELD_IDS);
  });

  it("sends only approved metadata and aggregate reasons to an injected provider", async () => {
    const provider = providerReturning(validModelPlan);
    const result = await generateAdaptiveUiPlan(input, {
      mode: "live",
      provider,
      apiKey: "test-key",
    });

    expect(result).toMatchObject({ mode: "live", fallback: false });
    const payload = vi.mocked(provider.generate).mock.calls[0]?.[0];
    expect(payload).toEqual({
      formId: "synthetic-personal-loan",
      schemaVersion: "1.0",
      fields: expect.any(Array),
      sections: expect.any(Array),
      frictionReasons: input.frictionReasons,
      frictionScore: null,
      presentationMode: "original",
      previousPlan: null,
    });
    expect(payload).not.toHaveProperty("values");
  });

  it("rejects malformed provider output and returns the safe fallback", async () => {
    const result = await generateAdaptiveUiPlan(input, {
      mode: "live",
      provider: providerReturning({
        ...validModelPlan,
        steps: [
          { ...validModelPlan.steps[0], fieldIds: ["employmentStatus"] },
          ...validModelPlan.steps.slice(1),
        ],
      }),
      apiKey: "test-key",
    });

    expect(result).toMatchObject({
      fallback: true,
      error: { code: "invalid-output" },
    });
    expect(result.plan.steps.flatMap((step) => step.fieldIds)).toEqual(FIELD_IDS);
  });

  it("falls back safely when live credentials are missing or the provider fails", async () => {
    await expect(
      generateAdaptiveUiPlan(input, { mode: "live", apiKey: "" }),
    ).resolves.toMatchObject({
      fallback: true,
      error: { code: "missing-credentials" },
    });

    await expect(
      generateAdaptiveUiPlan(input, {
        mode: "live",
        apiKey: "test-key",
        provider: {
          generate: vi.fn(async () => {
            throw new Error("provider unavailable");
          }),
        },
      }),
    ).resolves.toMatchObject({
      fallback: true,
      error: { code: "provider-failure" },
    });
  });

  it("returns a safe fallback when the provider exceeds the timeout", async () => {
    const result = await generateAdaptiveUiPlan(input, {
      mode: "live",
      apiKey: "test-key",
      timeoutMs: 5,
      provider: {
        generate: vi.fn(() => new Promise<never>(() => {})),
      },
    });

    expect(result).toMatchObject({
      fallback: true,
      error: { code: "timeout" },
    });
  });
});
