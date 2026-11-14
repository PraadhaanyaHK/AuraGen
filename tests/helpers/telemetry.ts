import type { FinancialFieldId } from "../../src/contracts.js";
import {
  FinancialFormTelemetry,
  type PointerMovementSample,
  type TelemetryClickTarget,
} from "../../src/telemetry.js";

export function simulateFocus(
  telemetry: FinancialFormTelemetry,
  fieldId: FinancialFieldId,
  at: number,
): void {
  telemetry.focus(fieldId, at);
}

export function simulateBlur(
  telemetry: FinancialFormTelemetry,
  fieldId: FinancialFieldId,
  at: number,
): void {
  telemetry.blur(fieldId, at);
}

export function simulateInputChange(
  telemetry: FinancialFormTelemetry,
  fieldId: FinancialFieldId,
  at: number,
): void {
  telemetry.inputChange(fieldId, at);
}

export function simulateClick(
  telemetry: FinancialFormTelemetry,
  target: TelemetryClickTarget,
  at: number,
): void {
  telemetry.click(target, at);
}

export function simulateValidationFailure(
  telemetry: FinancialFormTelemetry,
  at: number,
): void {
  telemetry.validationFailure(at);
}

export function simulateWizardNavigation(
  telemetry: FinancialFormTelemetry,
  fromStep: number,
  toStep: number,
  at: number,
): void {
  telemetry.wizardNavigation(fromStep, toStep, at);
}

export function simulatePointerMovement(
  telemetry: FinancialFormTelemetry,
  sample: PointerMovementSample,
  at: number,
): void {
  telemetry.pointerMove(sample, at);
}
