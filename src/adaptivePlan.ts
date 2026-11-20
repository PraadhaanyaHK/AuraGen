import {
  ADAPTIVE_UI_SCHEMA_VERSION,
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
  validateAdaptiveUiPlan,
  type AdaptiveUiPlan,
  type FinancialFieldId,
} from "./contracts.js";

export function createFallbackAdaptiveUiPlan(): AdaptiveUiPlan {
  return validateAdaptiveUiPlan({
    schemaVersion: ADAPTIVE_UI_SCHEMA_VERSION,
    title: "A simpler way to review your demo details",
    introduction:
      "This prebuilt presentation keeps every approved field and no model output is executed.",
    steps: FINANCIAL_FORM_SECTIONS.map((section, index) => ({
      id: `step-${index + 1}`,
      title: section,
      description: `Review the ${section.toLowerCase()} details for this demo.`,
      fieldIds: FINANCIAL_FORM_FIELDS.filter(
        (field) => field.section === section,
      ).map((field) => field.id),
    })),
  });
}

export function resolveApprovedFieldIds(
  fieldIds: readonly string[],
): FinancialFieldId[] {
  const resolved: FinancialFieldId[] = [];
  for (const fieldId of fieldIds) {
    const field = FINANCIAL_FORM_FIELDS.find((item) => item.id === fieldId);
    if (field === undefined) {
      throw new Error(`Unknown approved field ID: ${fieldId}`);
    }
    resolved.push(field.id);
  }
  return resolved;
}
