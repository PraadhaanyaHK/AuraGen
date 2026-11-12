import { z } from "zod";

export const CONTRACT_VERSION = "1.0" as const;
export const ADAPTIVE_UI_SCHEMA_VERSION = "1.0" as const;
export const MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024;
export const TELEMETRY_WINDOW_MS = 30_000;

const enumValues = <T extends readonly string[]>(values: T) =>
  z.enum(values as unknown as [T[number], ...T[number][]]);

const employmentOptions = [
  "Salaried",
  "self-employed",
  "business owner",
  "other",
] as const;
const loanPurposeOptions = [
  "education",
  "medical",
  "home improvement",
  "business",
  "other",
] as const;

type SelectFieldDefinition = {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly controlType: "select";
  readonly options: readonly string[];
  readonly validation: {
    readonly kind: "enum";
    readonly values: readonly string[];
  };
};

type NumberFieldDefinition = {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly controlType: "number";
  readonly validation: {
    readonly kind: "number";
    readonly min: number;
    readonly max: number;
    readonly integer: boolean;
    readonly instruction?: string;
  };
};

type CurrencyFieldDefinition = {
  readonly id: string;
  readonly label: string;
  readonly section: string;
  readonly controlType: "currency";
  readonly currency: "INR";
  readonly validation: {
    readonly kind: "number";
    readonly min: number;
    readonly max: number;
    readonly instruction?: string;
  };
};

export type FinancialFieldDefinition =
  | SelectFieldDefinition
  | NumberFieldDefinition
  | CurrencyFieldDefinition;

export const FINANCIAL_FORM_FIELDS = [
  {
    id: "employmentStatus",
    label: "Employment type",
    section: "Employment profile",
    controlType: "select",
    options: employmentOptions,
    validation: { kind: "enum", values: employmentOptions },
  },
  {
    id: "experienceYears",
    label: "Years in current work",
    section: "Employment profile",
    controlType: "number",
    validation: { kind: "number", min: 0, max: 50, integer: true },
  },
  {
    id: "monthlyTakeHomeIncome",
    label: "Monthly take-home income",
    section: "Monthly cash flow",
    controlType: "currency",
    currency: "INR",
    validation: { kind: "number", min: 0, max: 10_000_000 },
  },
  {
    id: "otherMonthlyIncome",
    label: "Other monthly income",
    section: "Monthly cash flow",
    controlType: "currency",
    currency: "INR",
    validation: {
      kind: "number",
      min: 0,
      max: 10_000_000,
      instruction: "Enter 0 if none.",
    },
  },
  {
    id: "monthlyExpenses",
    label: "Monthly household expenses",
    section: "Monthly cash flow",
    controlType: "currency",
    currency: "INR",
    validation: { kind: "number", min: 0, max: 10_000_000 },
  },
  {
    id: "currentMonthlyEmi",
    label: "Existing monthly loan payments",
    section: "Existing commitments",
    controlType: "currency",
    currency: "INR",
    validation: { kind: "number", min: 0, max: 10_000_000 },
  },
  {
    id: "activeLoanCount",
    label: "Number of active loans",
    section: "Existing commitments",
    controlType: "number",
    validation: { kind: "number", min: 0, max: 20, integer: true },
  },
  {
    id: "requestedLoanAmount",
    label: "Requested loan amount",
    section: "Loan request",
    controlType: "currency",
    currency: "INR",
    validation: { kind: "number", min: 10_000, max: 5_000_000 },
  },
  {
    id: "tenureMonths",
    label: "Preferred repayment period",
    section: "Loan request",
    controlType: "number",
    validation: { kind: "number", min: 6, max: 60, integer: true },
  },
  {
    id: "loanPurpose",
    label: "Purpose of the loan",
    section: "Loan request",
    controlType: "select",
    options: loanPurposeOptions,
    validation: { kind: "enum", values: loanPurposeOptions },
  },
] as const satisfies readonly FinancialFieldDefinition[];

export const FINANCIAL_FORM_ID = "synthetic-personal-loan" as const;
export const FIELD_IDS = FINANCIAL_FORM_FIELDS.map((field) => field.id) as [
  (typeof FINANCIAL_FORM_FIELDS)[number]["id"],
  ...(typeof FINANCIAL_FORM_FIELDS)[number]["id"][],
];
export type FinancialFieldId = (typeof FINANCIAL_FORM_FIELDS)[number]["id"];

export const FINANCIAL_FORM_SECTIONS = [
  "Employment profile",
  "Monthly cash flow",
  "Existing commitments",
  "Loan request",
] as const;

export const APPROVED_STEP_IDS = [
  "step-1",
  "step-2",
  "step-3",
  "step-4",
  "step-5",
] as const;

const nonBlankText = (maxLength: number) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => value.trim().length > 0, "Text must not be blank");

export const FIELD_METADATA = FINANCIAL_FORM_FIELDS.map(
  ({ id, label, section, controlType }) => ({ id, label, section, controlType }),
);

const fieldMetadataSchema = z
  .object({
    id: enumValues(FIELD_IDS),
    label: z.string().min(1).max(80),
    section: enumValues(FINANCIAL_FORM_SECTIONS),
    controlType: z.enum(["select", "number", "currency"]),
  })
  .strict();

export const FinancialFormMetadataSchema = z
  .object({
    formId: z.literal(FINANCIAL_FORM_ID),
    schemaVersion: z.literal(ADAPTIVE_UI_SCHEMA_VERSION),
    fields: z.array(fieldMetadataSchema).length(FINANCIAL_FORM_FIELDS.length),
  })
  .strict()
  .superRefine(({ fields }, context) => {
    const seen = new Set<string>();
    for (const [index, field] of fields.entries()) {
      if (seen.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate field metadata: ${field.id}`,
          path: ["fields", index, "id"],
        });
      }
      seen.add(field.id);
      const approved = FIELD_METADATA.find((item) => item.id === field.id);
      if (
        approved === undefined ||
        approved.label !== field.label ||
        approved.section !== field.section ||
        approved.controlType !== field.controlType
      ) {
        context.addIssue({
          code: "custom",
          message: `Field metadata does not match the approved catalogue: ${field.id}`,
          path: ["fields", index],
        });
      }
    }
  });

export type FinancialFormMetadata = z.infer<typeof FinancialFormMetadataSchema>;

export const FINANCIAL_FORM_METADATA: FinancialFormMetadata = {
  formId: FINANCIAL_FORM_ID,
  schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
  fields: FIELD_METADATA,
};

export const TelemetryCountsSchema = z
  .object({
    validationErrors: z.number().int().min(0).max(1000),
    repeatedClicks: z.number().int().min(0).max(1000),
    hesitations: z.number().int().min(0).max(1000),
    backtracks: z.number().int().min(0).max(1000),
    fieldSwitches: z.number().int().min(0).max(1000),
    pointerCorrections: z.number().int().min(0).max(1000),
    mouseSamples: z.number().int().min(0).max(1000),
  })
  .strict();

export const TelemetrySummarySchema = z
  .object({
    windowStart: z.iso.datetime(),
    windowEnd: z.iso.datetime(),
    windowDurationMs: z.literal(TELEMETRY_WINDOW_MS),
    counts: TelemetryCountsSchema,
  })
  .strict()
  .refine(
    ({ windowStart, windowEnd }) =>
      Date.parse(windowEnd) >= Date.parse(windowStart),
    { message: "windowEnd must not precede windowStart" },
  );

export type TelemetrySummary = z.infer<typeof TelemetrySummarySchema>;

export const FrictionFeatureSchema = z
  .object({
    validationErrors: z.number().min(0).max(1),
    repeatedClicks: z.number().min(0).max(1),
    hesitations: z.number().min(0).max(1),
    backtracks: z.number().min(0).max(1),
    fieldSwitches: z.number().min(0).max(1),
    pointerCorrections: z.number().min(0).max(1),
  })
  .strict();

export const FrictionLevelSchema = z.enum(["low", "moderate", "high"]);

export const FrictionScoreResponseSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    level: FrictionLevelSchema,
    features: FrictionFeatureSchema,
    observedSignals: z
      .array(
        z.enum([
          "validation-errors",
          "repeated-clicks",
          "hesitations",
          "backtracking",
          "field-switching",
          "pointer-corrections",
        ]),
      )
      .max(6),
    eligibleForAdaptation: z.boolean(),
  })
  .strict()
  .superRefine(({ score, level, eligibleForAdaptation }, context) => {
    const expectedLevel = score < 35 ? "low" : score < 60 ? "moderate" : "high";
    if (level !== expectedLevel) {
      context.addIssue({
        code: "custom",
        message: `Score ${score} must use the ${expectedLevel} level`,
        path: ["level"],
      });
    }
    if (eligibleForAdaptation && expectedLevel !== "high") {
      context.addIssue({
        code: "custom",
        message: "Only a high friction score can be eligible for adaptation",
        path: ["eligibleForAdaptation"],
      });
    }
  });

export type FrictionScoreResponse = z.infer<
  typeof FrictionScoreResponseSchema
>;

export const IndependentTaskSignalSchema = z.enum([
  "validation-errors",
  "repeated-clicks",
  "backtracking",
]);

export const AdaptationRequestSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_UI_SCHEMA_VERSION),
    form: FinancialFormMetadataSchema,
    telemetry: TelemetrySummarySchema,
    friction: FrictionScoreResponseSchema,
    consecutiveHighWindows: z.number().int().min(2).max(100),
    independentSignal: IndependentTaskSignalSchema,
  })
  .strict()
  .superRefine(({ friction }, context) => {
    if (friction.level !== "high" || !friction.eligibleForAdaptation) {
      context.addIssue({
        code: "custom",
        message: "Adaptation requests require an eligible high friction score",
        path: ["friction"],
      });
    }
  });

export type AdaptationRequest = z.infer<typeof AdaptationRequestSchema>;

const adaptiveUiStepSchema = z
  .object({
    id: enumValues(APPROVED_STEP_IDS),
    title: nonBlankText(60),
    description: nonBlankText(180),
    fieldIds: z.array(enumValues(FIELD_IDS)).min(1).max(FINANCIAL_FORM_FIELDS.length),
  })
  .strict();

export const AdaptiveUiPlanSchema = z
  .object({
    schemaVersion: z.literal(ADAPTIVE_UI_SCHEMA_VERSION),
    title: nonBlankText(80),
    introduction: nonBlankText(200),
    steps: z.array(adaptiveUiStepSchema).min(3).max(5),
  })
  .strict()
  .superRefine(({ steps }, context) => {
    const stepIds = new Set<string>();
    for (const [index, step] of steps.entries()) {
      if (stepIds.has(step.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate step ID: ${step.id}`,
          path: ["steps", index, "id"],
        });
      }
      stepIds.add(step.id);
    }

    const coverage = getFieldCoverageIssues(steps.flatMap((step) => step.fieldIds));
    for (const fieldId of coverage.unknown) {
      context.addIssue({
        code: "custom",
        message: `Unknown field ID: ${fieldId}`,
        path: ["steps"],
      });
    }
    for (const fieldId of coverage.duplicate) {
      context.addIssue({
        code: "custom",
        message: `Field ID must appear exactly once: ${fieldId}`,
        path: ["steps"],
      });
    }
    for (const fieldId of coverage.missing) {
      context.addIssue({
        code: "custom",
        message: `Missing field ID: ${fieldId}`,
        path: ["steps"],
      });
    }
  });

export type AdaptiveUiPlan = z.infer<typeof AdaptiveUiPlanSchema>;

export type FieldCoverageIssues = {
  unknown: string[];
  duplicate: string[];
  missing: FinancialFieldId[];
};

export function getFieldCoverageIssues(
  fieldIds: readonly string[],
): FieldCoverageIssues {
  const approvedIds = new Set<string>(FIELD_IDS);
  const seen = new Set<string>();
  const unknown = new Set<string>();
  const duplicate = new Set<string>();

  for (const fieldId of fieldIds) {
    if (!approvedIds.has(fieldId)) {
      unknown.add(fieldId);
    } else if (seen.has(fieldId)) {
      duplicate.add(fieldId);
    }
    seen.add(fieldId);
  }

  return {
    unknown: [...unknown],
    duplicate: [...duplicate],
    missing: FIELD_IDS.filter((fieldId) => !seen.has(fieldId)),
  };
}

export function assertExactFieldCoverage(
  fieldIds: readonly string[],
): void {
  const issues = getFieldCoverageIssues(fieldIds);
  if (
    issues.unknown.length > 0 ||
    issues.duplicate.length > 0 ||
    issues.missing.length > 0
  ) {
    throw new FieldCoverageError(issues);
  }
}

export function validateAdaptiveUiPlan(input: unknown): AdaptiveUiPlan {
  const plan = AdaptiveUiPlanSchema.parse(input);
  assertExactFieldCoverage(plan.steps.flatMap((step) => step.fieldIds));
  return plan;
}

export class FieldCoverageError extends Error {
  readonly issues: FieldCoverageIssues;

  constructor(issues: FieldCoverageIssues) {
    super("Adaptive UI plan must contain every approved field exactly once");
    this.name = "FieldCoverageError";
    this.issues = issues;
  }
}

export const ClientEventSchema = z.enum([
  "telemetry.summary",
  "adaptation.request",
]);

export const ServerEventSchema = z.enum([
  "friction.score",
  "adaptation.plan",
  "error",
]);

const envelopeBase = {
  protocolVersion: z.literal(CONTRACT_VERSION),
  requestId: z.uuid(),
};

export const ClientMessageSchema = z.discriminatedUnion("event", [
  z
    .object({
      ...envelopeBase,
      event: z.literal("telemetry.summary"),
      payload: TelemetrySummarySchema,
    })
    .strict(),
  z
    .object({
      ...envelopeBase,
      event: z.literal("adaptation.request"),
      payload: AdaptationRequestSchema,
    })
    .strict(),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const StandardErrorResponseSchema = z
  .object({
    code: z.enum([
      "INVALID_MESSAGE",
      "MESSAGE_TOO_LARGE",
      "UNSUPPORTED_VERSION",
      "INVALID_TELEMETRY",
      "INVALID_ADAPTATION_REQUEST",
      "GENERATION_FAILED",
      "INTERNAL_ERROR",
    ]),
    message: z.string().trim().min(1).max(240),
    retryable: z.boolean(),
  })
  .strict();

export type StandardErrorResponse = z.infer<
  typeof StandardErrorResponseSchema
>;

export const ServerMessageSchema = z
  .discriminatedUnion("event", [
    z
      .object({
        ...envelopeBase,
        event: z.literal("friction.score"),
        payload: FrictionScoreResponseSchema,
      })
      .strict(),
    z
      .object({
        ...envelopeBase,
        event: z.literal("adaptation.plan"),
        payload: AdaptiveUiPlanSchema,
      })
      .strict(),
    z
      .object({
        ...envelopeBase,
        event: z.literal("error"),
        payload: StandardErrorResponseSchema,
      })
      .strict(),
  ])
  .superRefine((message, context) => {
    if (message.event === "adaptation.plan") {
      const issues = getFieldCoverageIssues(
        message.payload.steps.flatMap((step) => step.fieldIds),
      );
      if (
        issues.unknown.length > 0 ||
        issues.duplicate.length > 0 ||
        issues.missing.length > 0
      ) {
        context.addIssue({
          code: "custom",
          message: "Adaptive UI plan must include every approved field exactly once",
          path: ["payload", "steps"],
        });
      }
    }
  });

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type MessageInputErrorCode =
  | "INVALID_MESSAGE"
  | "MESSAGE_TOO_LARGE";

export class MessageInputError extends Error {
  readonly code: MessageInputErrorCode;

  constructor(code: MessageInputErrorCode, message: string) {
    super(message);
    this.name = "MessageInputError";
    this.code = code;
  }
}

export type MessageInput = string | Uint8Array | ArrayBuffer;

function decodeBoundedMessage(input: MessageInput): unknown {
  let text: string;
  if (typeof input === "string") {
    text = input;
    if (new TextEncoder().encode(text).byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) {
      throw new MessageInputError("MESSAGE_TOO_LARGE", "WebSocket message exceeds 16 KiB");
    }
  } else if (input instanceof Uint8Array || input instanceof ArrayBuffer) {
    const bytes =
      input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) {
      throw new MessageInputError("MESSAGE_TOO_LARGE", "WebSocket message exceeds 16 KiB");
    }
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new MessageInputError("INVALID_MESSAGE", "WebSocket message must be valid UTF-8");
    }
  } else {
    throw new MessageInputError("INVALID_MESSAGE", "WebSocket message must be text or UTF-8 bytes");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MessageInputError("INVALID_MESSAGE", "WebSocket message must contain valid JSON");
  }
}

export function parseClientMessage(
  input: MessageInput,
): ClientMessage {
  const parsed = ClientMessageSchema.safeParse(decodeBoundedMessage(input));
  if (!parsed.success) {
    throw new MessageInputError("INVALID_MESSAGE", "Invalid client message envelope or payload");
  }
  return parsed.data;
}

export function parseServerMessage(
  input: MessageInput,
): ServerMessage {
  const parsed = ServerMessageSchema.safeParse(decodeBoundedMessage(input));
  if (!parsed.success) {
    throw new MessageInputError("INVALID_MESSAGE", "Invalid server message envelope or payload");
  }
  return parsed.data;
}
