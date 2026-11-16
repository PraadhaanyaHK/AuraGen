import { z } from "zod";
import {
  ADAPTIVE_UI_SCHEMA_VERSION,
  APPROVED_STEP_IDS,
  FINANCIAL_FORM_SECTIONS,
  FinancialFormMetadataSchema,
  FrictionScoreResponseSchema,
  validateAdaptiveUiPlan,
  type AdaptiveUiPlan,
} from "../src/contracts.js";

const frictionReasonSchema =
  FrictionScoreResponseSchema.shape.observedSignals.element;

export const UiPlanGenerationRequestSchema = z
  .object({
    metadata: FinancialFormMetadataSchema,
    frictionReasons: z.array(frictionReasonSchema).max(6),
  })
  .strict()
  .superRefine(({ frictionReasons }, context) => {
    if (new Set(frictionReasons).size !== frictionReasons.length) {
      context.addIssue({
        code: "custom",
        message: "Friction reasons must not contain duplicates",
        path: ["frictionReasons"],
      });
    }
  });

export type UiPlanGenerationRequest = z.infer<
  typeof UiPlanGenerationRequestSchema
>;

export interface UiPlanGenerationProvider {
  generatePlan(input: UiPlanGenerationRequest): Promise<unknown>;
}

export class InvalidGenerationRequestError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "Generation request must contain only approved metadata and aggregate friction reasons",
      options,
    );
    this.name = "InvalidGenerationRequestError";
  }
}

export class GenerationProviderError extends Error {
  constructor(options?: ErrorOptions) {
    super("The UI-plan provider failed", options);
    this.name = "GenerationProviderError";
  }
}

export class InvalidGeneratedPlanError extends Error {
  constructor(options?: ErrorOptions) {
    super("The UI-plan provider returned an invalid plan", options);
    this.name = "InvalidGeneratedPlanError";
  }
}

const STEP_DESCRIPTIONS = [
  "Tell us about your work.",
  "Share the monthly amounts in this synthetic demo.",
  "Review existing monthly commitments.",
  "Choose the amount, period, and purpose for this demo request.",
] as const;

export class DeterministicMockProvider implements UiPlanGenerationProvider {
  async generatePlan(input: UiPlanGenerationRequest): Promise<unknown> {
    return {
      schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
      title: "A simpler way to explore the form",
      introduction:
        "This step-by-step layout keeps the same approved demo fields.",
      steps: FINANCIAL_FORM_SECTIONS.map((section, index) => ({
        id: APPROVED_STEP_IDS[index]!,
        title: section,
        description: STEP_DESCRIPTIONS[index]!,
        fieldIds: input.metadata.fields
          .filter((field) => field.section === section)
          .map(({ id }) => id),
      })),
    };
  }
}

export const mockPlanProvider = new DeterministicMockProvider();

export async function generateUiPlan(
  input: unknown,
  provider: UiPlanGenerationProvider = mockPlanProvider,
): Promise<AdaptiveUiPlan> {
  let request: UiPlanGenerationRequest;
  try {
    request = UiPlanGenerationRequestSchema.parse(input);
  } catch (error) {
    throw new InvalidGenerationRequestError({ cause: error });
  }

  let candidate: unknown;
  try {
    candidate = await provider.generatePlan(request);
  } catch (error) {
    throw new GenerationProviderError({ cause: error });
  }

  try {
    const plan = validateAdaptiveUiPlan(candidate);
    if (plan.schemaVersion !== request.metadata.schemaVersion) {
      throw new Error(
        "Generated plan schema version does not match the form metadata",
      );
    }
    return plan;
  } catch (error) {
    throw new InvalidGeneratedPlanError({ cause: error });
  }
}
