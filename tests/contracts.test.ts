import { describe, expect, it } from "vitest";
import adaptiveUiSchema from "../docs/ADAPTIVE_UI_SCHEMA.json";
import {
  ADAPTIVE_UI_SCHEMA_VERSION,
  AdaptationRequestSchema,
  AdaptiveUiPlanSchema,
  assertExactFieldCoverage,
  ClientMessageSchema,
  FIELD_IDS,
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_METADATA,
  FinancialFormMetadataSchema,
  FrictionScoreResponseSchema,
  getFieldCoverageIssues,
  MAX_WEBSOCKET_MESSAGE_BYTES,
  MessageInputError,
  parseClientMessage,
  parseServerMessage,
  ServerMessageSchema,
  StandardErrorResponseSchema,
  TelemetrySummarySchema,
  validateAdaptiveUiPlan,
} from "../src/contracts.js";

const allFields = [...FIELD_IDS];

function makePlan(fieldIds: string[] = allFields) {
  const firstFour = fieldIds.slice(0, 4);
  const secondFour = fieldIds.slice(4, 8);
  const remaining = fieldIds.slice(8);
  return {
    schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
    title: "A simpler application",
    introduction: "Complete each short step at your own pace.",
    steps: [
      { id: "step-1", title: "Work", description: "Tell us about your work.", fieldIds: firstFour },
      { id: "step-2", title: "Monthly finances", description: "Share monthly amounts.", fieldIds: secondFour },
      { id: "step-3", title: "Request", description: "Review your request details.", fieldIds: remaining },
    ],
  };
}

const validTelemetry = {
  windowStart: "2026-11-12T10:00:00.000Z",
  windowEnd: "2026-11-12T10:00:30.000Z",
  windowDurationMs: 30_000,
  counts: {
    validationErrors: 0,
    repeatedClicks: 0,
    hesitations: 0,
    backtracks: 0,
    fieldSwitches: 0,
    pointerCorrections: 0,
    mouseSamples: 0,
  },
};

const validFriction = {
  score: 65,
  level: "high",
  features: {
    validationErrors: 0.5,
    repeatedClicks: 0.5,
    hesitations: 0,
    backtracks: 0,
    fieldSwitches: 0,
    pointerCorrections: 0,
  },
  observedSignals: ["validation-errors"],
  eligibleForAdaptation: true,
};

describe("canonical financial form catalogue", () => {
  it("defines the ten approved fields exactly once", () => {
    expect(FINANCIAL_FORM_FIELDS).toHaveLength(10);
    expect(new Set(FIELD_IDS).size).toBe(10);
    expect(FINANCIAL_FORM_METADATA.fields.map(({ id }) => id)).toEqual(FIELD_IDS);
  });

  it("accepts only canonical metadata, not client-supplied controls or rules", () => {
    expect(FinancialFormMetadataSchema.safeParse(FINANCIAL_FORM_METADATA).success).toBe(true);

    const alteredLabel = structuredClone(FINANCIAL_FORM_METADATA);
    alteredLabel.fields[0]!.label = "Unapproved label";
    expect(FinancialFormMetadataSchema.safeParse(alteredLabel).success).toBe(false);

    const withValidationRules = {
      ...FINANCIAL_FORM_METADATA,
      validation: { required: false },
    };
    expect(FinancialFormMetadataSchema.safeParse(withValidationRules).success).toBe(false);
  });

  it("keeps the portable JSON Schema field enum aligned with the catalogue", () => {
    expect(adaptiveUiSchema.$defs.FieldId.enum).toEqual(FIELD_IDS);
  });
});

describe("telemetry and friction contracts", () => {
  it("accepts aggregate telemetry and rejects raw values or coordinates", () => {
    expect(TelemetrySummarySchema.safeParse(validTelemetry).success).toBe(true);
    expect(
      TelemetrySummarySchema.safeParse({
        ...validTelemetry,
        typedCharacters: "synthetic value",
      }).success,
    ).toBe(false);
    expect(
      TelemetrySummarySchema.safeParse({
        ...validTelemetry,
        pointerX: 20,
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent score bands and adaptation eligibility", () => {
    expect(FrictionScoreResponseSchema.safeParse(validFriction).success).toBe(true);
    expect(
      FrictionScoreResponseSchema.safeParse({
        ...validFriction,
        level: "moderate",
      }).success,
    ).toBe(false);
  });

  it("accepts only eligible adaptation requests with aggregate metadata", () => {
    const request = {
      schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
      form: FINANCIAL_FORM_METADATA,
      telemetry: validTelemetry,
      friction: validFriction,
      consecutiveHighWindows: 2,
      independentSignal: "validation-errors",
    };
    expect(AdaptationRequestSchema.safeParse(request).success).toBe(true);
    expect(
      AdaptationRequestSchema.safeParse({
        ...request,
        friction: { ...validFriction, eligibleForAdaptation: false },
      }).success,
    ).toBe(false);
    expect(
      AdaptationRequestSchema.safeParse({
        ...request,
        requestedLoanAmount: 100_000,
      }).success,
    ).toBe(false);
  });
});

describe("adaptive UI plan and exact-once field coverage", () => {
  it("accepts a versioned plan with exactly the ten approved fields", () => {
    expect(AdaptiveUiPlanSchema.safeParse(makePlan()).success).toBe(true);
    expect(validateAdaptiveUiPlan(makePlan()).steps).toHaveLength(3);
  });

  it("reports missing, duplicate, and unknown field IDs", () => {
    const missing = getFieldCoverageIssues(allFields.slice(1));
    expect(missing.missing).toEqual([FIELD_IDS[0]]);
    expect(missing.duplicate).toEqual([]);
    expect(missing.unknown).toEqual([]);

    const duplicate = getFieldCoverageIssues([...allFields, FIELD_IDS[0]]);
    expect(duplicate.duplicate).toEqual([FIELD_IDS[0]]);

    const unknown = getFieldCoverageIssues([...allFields.slice(1), "unapprovedField"]);
    expect(unknown.unknown).toEqual(["unapprovedField"]);
    expect(unknown.missing).toEqual([FIELD_IDS[0]]);
  });

  it("rejects missing, duplicate, and unknown IDs in a plan", () => {
    expect(AdaptiveUiPlanSchema.safeParse(makePlan(allFields.slice(1))).success).toBe(false);
    expect(AdaptiveUiPlanSchema.safeParse(makePlan([...allFields, FIELD_IDS[0]])).success).toBe(false);
    expect(AdaptiveUiPlanSchema.safeParse(makePlan([...allFields.slice(1), "unknown"])).success).toBe(false);
  });

  it("rejects unsupported versions, extra properties, and repeated step IDs", () => {
    const unsupportedVersion = { ...makePlan(), schemaVersion: "2.0" };
    expect(AdaptiveUiPlanSchema.safeParse(unsupportedVersion).success).toBe(false);

    const extraProperty = { ...makePlan(), fields: [] };
    expect(AdaptiveUiPlanSchema.safeParse(extraProperty).success).toBe(false);

    const repeatedStepIds = makePlan();
    repeatedStepIds.steps[1]!.id = "step-1";
    expect(AdaptiveUiPlanSchema.safeParse(repeatedStepIds).success).toBe(false);
  });

  it("throws a coverage-specific error from the explicit invariant guard", () => {
    expect(() => assertExactFieldCoverage(allFields.slice(1))).toThrow(
      "every approved field exactly once",
    );
  });
});

describe("WebSocket message contracts", () => {
  it("accepts known client and server envelopes", () => {
    const clientMessage = {
      protocolVersion: "1.0",
      requestId: "9b530ef4-3c39-4bdb-93ef-5790bcf6c0d5",
      event: "telemetry.summary",
      payload: validTelemetry,
    };
    const serverMessage = {
      protocolVersion: "1.0",
      requestId: clientMessage.requestId,
      event: "adaptation.plan",
      payload: makePlan(),
    };

    expect(ClientMessageSchema.safeParse(clientMessage).success).toBe(true);
    expect(ServerMessageSchema.safeParse(serverMessage).success).toBe(true);
    expect(parseClientMessage(JSON.stringify(clientMessage))).toEqual(clientMessage);
    expect(parseServerMessage(new TextEncoder().encode(JSON.stringify(serverMessage)))).toEqual(serverMessage);
    const clientBytes = new TextEncoder().encode(JSON.stringify(clientMessage));
    const clientBuffer = new ArrayBuffer(clientBytes.byteLength);
    new Uint8Array(clientBuffer).set(clientBytes);
    expect(parseClientMessage(clientBuffer)).toEqual(clientMessage);

    const errorResponse = {
      code: "GENERATION_FAILED",
      message: "The original layout remains available.",
      retryable: true,
    };
    expect(StandardErrorResponseSchema.safeParse(errorResponse).success).toBe(true);
    expect(
      ServerMessageSchema.safeParse({
        protocolVersion: "1.0",
        requestId: clientMessage.requestId,
        event: "error",
        payload: errorResponse,
      }).success,
    ).toBe(true);
    expect(
      StandardErrorResponseSchema.safeParse({
        ...errorResponse,
        debug: "stack trace",
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported events, extra envelope properties, and invalid plans", () => {
    const base = {
      protocolVersion: "1.0",
      requestId: "9b530ef4-3c39-4bdb-93ef-5790bcf6c0d5",
      payload: validTelemetry,
    };
    expect(ClientMessageSchema.safeParse({ ...base, event: "unknown" }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ ...base, event: "telemetry.summary", debug: true }).success).toBe(false);

    const invalidPlanMessage = {
      protocolVersion: "1.0",
      requestId: base.requestId,
      event: "adaptation.plan",
      payload: makePlan(allFields.slice(1)),
    };
    expect(ServerMessageSchema.safeParse(invalidPlanMessage).success).toBe(false);
  });

  it("enforces the UTF-8 byte limit before parsing and rejects malformed input", () => {
    expect(MAX_WEBSOCKET_MESSAGE_BYTES).toBe(16 * 1024);
    expect(() => parseClientMessage("x".repeat(MAX_WEBSOCKET_MESSAGE_BYTES + 1))).toThrow(
      MessageInputError,
    );
    expect(() => parseClientMessage("{")).toThrow("valid JSON");
    expect(() => parseClientMessage(new Uint8Array([0xff]))).toThrow("valid UTF-8");
  });
});
