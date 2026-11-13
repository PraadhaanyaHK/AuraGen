import { Controller, type Control } from "react-hook-form";
import {
  FINANCIAL_FORM_FIELDS,
  type FinancialFieldId,
} from "./contracts.js";

type CatalogueField = (typeof FINANCIAL_FORM_FIELDS)[number];

export type FormValues = Partial<
  Record<FinancialFieldId, string | number | undefined>
>;

type FieldInputProps = {
  definition: CatalogueField;
  control: Control<FormValues>;
  error?: string;
};

function getHelperText(definition: CatalogueField): string {
  if (definition.validation.kind === "enum") {
    return `Choose one: ${definition.validation.values.join(", ")}.`;
  }

  const { min, max } = definition.validation;
  const range = `Enter a value from ${min.toLocaleString("en-IN")} to ${max.toLocaleString("en-IN")}.`;
  const format =
    definition.controlType === "number" && definition.validation.integer
      ? "Use a whole number. "
      : definition.controlType === "currency"
        ? "Amount in INR. "
        : "";

  return `${format}${range}${
    "instruction" in definition.validation && definition.validation.instruction
      ? ` ${definition.validation.instruction}`
      : ""
  }`;
}

function validateField(
  definition: CatalogueField,
  value: unknown,
): true | string {
  if (value === undefined || value === "") {
    return true;
  }

  if (definition.validation.kind === "enum") {
    return typeof value === "string" &&
      definition.validation.values.some((option) => option === value)
      ? true
      : "Choose one of the listed options.";
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Enter a valid number.";
  }

  if (
    definition.controlType === "number" &&
    definition.validation.integer &&
    !Number.isInteger(value)
  ) {
    return "Enter a whole number.";
  }

  if (value < definition.validation.min) {
    return `Enter at least ${definition.validation.min.toLocaleString("en-IN")}.`;
  }

  if (value > definition.validation.max) {
    return `Enter no more than ${definition.validation.max.toLocaleString("en-IN")}.`;
  }

  return true;
}

function FieldShell({
  definition,
  error,
  children,
}: FieldInputProps & { children: React.ReactNode }) {
  const hintId = `${definition.id}-hint`;
  const errorId = `${definition.id}-error`;

  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={definition.id}>{definition.label}</label>
      {children}
      <p className="field-hint" id={hintId}>
        {getHelperText(definition)}
      </p>
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SelectInput(props: FieldInputProps) {
  const { definition, control, error } = props;
  if (definition.controlType !== "select") {
    throw new Error(`Select input registry mismatch for ${definition.id}.`);
  }

  return (
    <FieldShell {...props}>
      <Controller
        name={definition.id}
        control={control}
        rules={{ validate: (value) => validateField(definition, value) }}
        render={({ field }) => (
          <select
            {...field}
            id={definition.id}
            value={typeof field.value === "string" ? field.value : ""}
            aria-invalid={Boolean(error)}
            aria-describedby={`${definition.id}-hint${error ? ` ${definition.id}-error` : ""}`}
          >
            <option value="">Select an option</option>
            {definition.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      />
    </FieldShell>
  );
}

function NumberInput(props: FieldInputProps) {
  const { definition, control, error } = props;
  if (
    definition.controlType !== "number" ||
    definition.validation.kind !== "number"
  ) {
    throw new Error(`Number input registry mismatch for ${definition.id}.`);
  }

  return (
    <FieldShell {...props}>
      <Controller
        name={definition.id}
        control={control}
        rules={{ validate: (value) => validateField(definition, value) }}
        render={({ field }) => (
          <input
            {...field}
            id={definition.id}
            type="number"
            min={definition.validation.min}
            max={definition.validation.max}
            step={definition.validation.integer ? 1 : "any"}
            value={typeof field.value === "number" ? field.value : ""}
            onChange={(event) =>
              field.onChange(
                event.target.value === "" ? undefined : Number(event.target.value),
              )
            }
            aria-invalid={Boolean(error)}
            aria-describedby={`${definition.id}-hint${error ? ` ${definition.id}-error` : ""}`}
          />
        )}
      />
    </FieldShell>
  );
}

function CurrencyInput(props: FieldInputProps) {
  const { definition, control, error } = props;
  if (
    definition.controlType !== "currency" ||
    definition.validation.kind !== "number"
  ) {
    throw new Error(`Currency input registry mismatch for ${definition.id}.`);
  }

  return (
    <FieldShell {...props}>
      <div className="currency-control">
        <span aria-hidden="true">₹</span>
        <Controller
          name={definition.id}
          control={control}
          rules={{ validate: (value) => validateField(definition, value) }}
          render={({ field }) => (
            <input
              {...field}
              id={definition.id}
              type="number"
              min={definition.validation.min}
              max={definition.validation.max}
              step="any"
              inputMode="decimal"
              value={typeof field.value === "number" ? field.value : ""}
              onChange={(event) =>
                field.onChange(
                  event.target.value === "" ? undefined : Number(event.target.value),
                )
              }
              aria-label={`${definition.label}, INR`}
              aria-invalid={Boolean(error)}
              aria-describedby={`${definition.id}-hint${error ? ` ${definition.id}-error` : ""}`}
            />
          )}
        />
        <span className="currency-code">INR</span>
      </div>
    </FieldShell>
  );
}

const INPUT_COMPONENTS: Record<
  FinancialFieldId,
  React.ComponentType<FieldInputProps>
> = {
  employmentStatus: SelectInput,
  experienceYears: NumberInput,
  monthlyTakeHomeIncome: CurrencyInput,
  otherMonthlyIncome: CurrencyInput,
  monthlyExpenses: CurrencyInput,
  currentMonthlyEmi: CurrencyInput,
  activeLoanCount: NumberInput,
  requestedLoanAmount: CurrencyInput,
  tenureMonths: NumberInput,
  loanPurpose: SelectInput,
};

export function RegisteredField({
  definition,
  control,
  error,
}: FieldInputProps) {
  const InputComponent = INPUT_COMPONENTS[definition.id];
  return (
    <InputComponent
      definition={definition}
      control={control}
      error={error}
    />
  );
}

export function getFieldsForSection(section: string) {
  return FINANCIAL_FORM_FIELDS.filter((field) => field.section === section);
}
