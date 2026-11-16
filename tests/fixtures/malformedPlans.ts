import {
  ADAPTIVE_UI_SCHEMA_VERSION,
  FIELD_IDS,
} from "../../src/contracts.js";

const validSteps = [
  {
    id: "step-1",
    title: "Work",
    description: "Tell us about your work.",
    fieldIds: FIELD_IDS.slice(0, 3),
  },
  {
    id: "step-2",
    title: "Monthly cash flow",
    description: "Share monthly amounts.",
    fieldIds: FIELD_IDS.slice(3, 6),
  },
  {
    id: "step-3",
    title: "Commitments",
    description: "Review existing commitments.",
    fieldIds: FIELD_IDS.slice(6, 8),
  },
  {
    id: "step-4",
    title: "Loan request",
    description: "Review demo request details.",
    fieldIds: FIELD_IDS.slice(8),
  },
];

export const malformedPlans = {
  duplicateField: {
    schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
    title: "A demo plan",
    introduction: "A brief introduction.",
    steps: [
      ...validSteps.slice(0, 3),
      {
        ...validSteps[3]!,
        fieldIds: [...validSteps[3]!.fieldIds, FIELD_IDS[0]],
      },
    ],
  },
  missingField: {
    schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
    title: "A demo plan",
    introduction: "A brief introduction.",
    steps: [
      {
        ...validSteps[0]!,
        fieldIds: validSteps[0]!.fieldIds.slice(1),
      },
      ...validSteps.slice(1),
    ],
  },
  extraProperty: {
    schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
    title: "A demo plan",
    introduction: "A brief introduction.",
    steps: validSteps,
    controls: { employmentStatus: "text" },
  },
};
