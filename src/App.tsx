import { useState } from "react";
import {
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import {
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
} from "./contracts.js";
import {
  getFieldsForSection,
  RegisteredField,
  type FormValues,
} from "./fieldRegistry.js";
import {
  useFinancialFormTelemetry,
  type FinancialFormTelemetryEvents,
} from "./telemetry.js";

type Presentation = "original" | "wizard";

function OriginalForm({
  form,
  telemetry,
}: {
  form: UseFormReturn<FormValues>;
  telemetry: FinancialFormTelemetryEvents;
}) {
  const [checked, setChecked] = useState(false);

  const onValid = () => setChecked(true);
  const onInvalid = () => {
    setChecked(false);
    telemetry.validationFailure();
  };

  return (
    <form
      className="form-card original-form"
      noValidate
      onSubmit={form.handleSubmit(onValid, onInvalid)}
    >
      {FINANCIAL_FORM_SECTIONS.map((section) => (
        <section className="form-section" key={section}>
          <h2>{section}</h2>
          <div className="field-grid">
            {getFieldsForSection(section).map((definition) => (
              <RegisteredField
                key={definition.id}
                definition={definition}
                control={form.control}
                error={form.formState.errors[definition.id]?.message}
                telemetry={telemetry}
              />
            ))}
          </div>
        </section>
      ))}
      <ValidationAction
        checked={checked}
        onClick={() => telemetry.click("check-demo-fields")}
      />
    </form>
  );
}
const WIZARD_STEP_DESCRIPTIONS = [
  "Tell us about your work.",
  "Add your monthly income and expenses.",
  "Share any existing monthly commitments.",
  "Choose the amount, period, and purpose for this demo request.",
] as const;

function WizardForm({
  form,
  telemetry,
}: {
  form: UseFormReturn<FormValues>;
  telemetry: FinancialFormTelemetryEvents;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const section = FINANCIAL_FORM_SECTIONS[stepIndex]!;
  const fields = getFieldsForSection(section);
  const currentFieldIds = fields.map(({ id }) => id);
  const isLastStep = stepIndex === FINANCIAL_FORM_SECTIONS.length - 1;

  const goNext = async () => {
    telemetry.click("wizard-continue");
    const valid = await form.trigger(currentFieldIds);
    if (valid) {
      setStepIndex((current) => Math.min(current + 1, FINANCIAL_FORM_SECTIONS.length - 1));
    } else {
      telemetry.validationFailure();
    }
  };

  return (
    <form
      className="form-card wizard-form"
      noValidate
      onSubmit={form.handleSubmit(
        () => setChecked(true),
        () => {
          setChecked(false);
          telemetry.validationFailure();
        },
      )}
    >
      <div className="wizard-progress" aria-label="Wizard progress">
        <span>
          Step {stepIndex + 1} of {FINANCIAL_FORM_SECTIONS.length}
        </span>
        <progress
          value={stepIndex + 1}
          max={FINANCIAL_FORM_SECTIONS.length}
          aria-label={`Step ${stepIndex + 1} of ${FINANCIAL_FORM_SECTIONS.length}`}
        />
      </div>
      <section className="form-section" aria-labelledby="wizard-step-title">
        <h2 id="wizard-step-title">{section}</h2>
        <p className="step-description">
          {WIZARD_STEP_DESCRIPTIONS[stepIndex]}
        </p>
        <div className="field-grid">
          {fields.map((definition) => (
            <RegisteredField
              key={definition.id}
              definition={definition}
              control={form.control}
              error={form.formState.errors[definition.id]?.message}
              telemetry={telemetry}
            />
          ))}
        </div>
      </section>
      <div className="wizard-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={stepIndex === 0}
          onClick={() => {
            telemetry.click("wizard-back");
            telemetry.wizardNavigation(stepIndex, Math.max(stepIndex - 1, 0));
            setStepIndex((current) => Math.max(current - 1, 0));
          }}
        >
          Back
        </button>
        {isLastStep ? (
          <button
            className="button button-primary"
            type="submit"
            onClick={() => telemetry.click("check-demo-fields")}
          >
            Check demo fields
          </button>
        ) : (
          <button className="button button-primary" type="button" onClick={goNext}>
            Continue
          </button>
        )}
      </div>
      {checked && (
        <p className="success-message" role="status">
          The entered demo values pass validation. Nothing was submitted.
        </p>
      )}
    </form>
  );
}

function ValidationAction({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <div className="form-footer">
      <button className="button button-primary" type="submit" onClick={onClick}>
        Check demo fields
      </button>
      {checked && (
        <p className="success-message" role="status">
          The entered demo values pass validation. Nothing was submitted.
        </p>
      )}
    </div>
  );
}

export function App() {
  const [presentation, setPresentation] = useState<Presentation>("original");
  const { summary, events } = useFinancialFormTelemetry();
  const form = useForm<FormValues>({
    shouldUnregister: false,
    mode: "onBlur",
  });

  return (
    <main className="page-shell">
      <header className="page-header">
        <a className="brand" href="/" aria-label="AuraGen Research Demo home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>AuraGen <span className="brand-subtitle">Research Demo</span></span>
        </a>
        <span className="prototype-tag">SYNTHETIC PROTOTYPE</span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">PERSONAL LOAN APPLICATION · UX RESEARCH</p>
        <h1 id="page-title">A clearer way to explore a loan form.</h1>
        <p className="intro-copy">
          This demo uses sample inputs only. No application is sent and no
          lending decision is made.
        </p>
      </section>

      <aside className="research-disclaimer" aria-label="Research Demo disclaimer">
        <span className="disclaimer-icon" aria-hidden="true">i</span>
        <p>
          <strong>Research Demo:</strong> This form is synthetic. It does not
          submit a real loan application or make lending decisions. Please do
          not enter real financial information.
        </p>
      </aside>

      <div className="layout-toolbar">
        <div>
          <p className="toolbar-label">PRESENTATION</p>
          <p className="toolbar-description">Switch layouts; your entries stay in place.</p>
        </div>
        <div className="presentation-switch" role="group" aria-label="Form presentation">
          <button
            type="button"
            aria-pressed={presentation === "original"}
            onClick={() => setPresentation("original")}
          >
            Original form
          </button>
          <button
            type="button"
            aria-pressed={presentation === "wizard"}
            onClick={() => setPresentation("wizard")}
          >
            Wizard preview
          </button>
        </div>
      </div>

      <div className="form-heading">
        <div>
          <h2>{presentation === "original" ? "Personal loan details" : "Step-by-step preview"}</h2>
          <p>
            {presentation === "original"
              ? "Complete the fields you want to explore."
              : "The same approved fields, shown a section at a time."}
          </p>
        </div>
        <span className="field-count">{FINANCIAL_FORM_FIELDS.length} demo fields</span>
      </div>

      {presentation === "original" ? (
        <OriginalForm form={form} telemetry={events} />
      ) : (
        <WizardForm form={form} telemetry={events} />
      )}

      <details className="telemetry-inspector">
        <summary>Local interaction summary (rolling 30 seconds)</summary>
        <pre aria-label="Local telemetry summary">
          {JSON.stringify(summary, null, 2)}
        </pre>
      </details>

      <footer className="page-footer">
        <span>No backend · No real application · No lending decision</span>
      </footer>
    </main>
  );
}
