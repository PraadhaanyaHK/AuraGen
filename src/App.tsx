import { useEffect, useRef, useState } from "react";
import {
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import {
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
  type FrictionScoreResponse,
} from "./contracts.js";
import {
  createAdaptationTriggerState,
  getFrictionScoreResponse,
  requestManualSimplification,
  restoreOriginalPresentation,
  scoreInteractionFriction,
  setAutomaticAdaptationOverridden,
  type AdaptationTriggerState,
} from "./friction.js";
import {
  getFieldsForSection,
  RegisteredField,
  type FormValues,
} from "./fieldRegistry.js";
import {
  useFinancialFormTelemetry,
  type FinancialFormTelemetryEvents,
} from "./telemetry.js";
import { useTelemetrySocket } from "./telemetrySocket.js";

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
  const {
    connectionStatus,
    frictionResponse: serverFrictionResponse,
  } = useTelemetrySocket(summary);
  const [triggerState, setTriggerState] = useState(
    createAdaptationTriggerState,
  );
  const triggerStateRef = useRef<AdaptationTriggerState>(triggerState);
  const pendingAutomaticAdaptationRef = useRef(false);
  const [frictionResponse, setFrictionResponse] =
    useState<FrictionScoreResponse | null>(null);
  const form = useForm<FormValues>({
    shouldUnregister: false,
    mode: "onBlur",
  });

  useEffect(() => {
    if (serverFrictionResponse === null) {
      return;
    }

    setFrictionResponse(serverFrictionResponse);
    if (serverFrictionResponse.eligibleForAdaptation) {
      if (triggerStateRef.current.automaticAdaptationOverridden) {
        pendingAutomaticAdaptationRef.current = true;
      } else {
        setPresentation("wizard");
      }
    }
  }, [serverFrictionResponse]);

  const simplifyNow = () => {
    const scored = scoreInteractionFriction(summary);
    const evaluation = requestManualSimplification(
      summary,
      scored,
      triggerStateRef.current,
      Date.now(),
    );
    triggerStateRef.current = evaluation.state;
    setTriggerState(evaluation.state);
    setFrictionResponse(evaluation.scoreResponse);
    if (evaluation.triggeredManually) {
      setPresentation("wizard");
    }
  };

  const restoreOriginal = () => {
    const nextState = restoreOriginalPresentation(
      triggerStateRef.current,
      summary.windowEnd,
    );
    triggerStateRef.current = nextState;
    setTriggerState(nextState);
    setFrictionResponse(
      getFrictionScoreResponse(
        summary,
        scoreInteractionFriction(summary),
        nextState,
        Date.now(),
      ),
    );
    setPresentation("original");
  };

  const setAutomaticEnabled = (enabled: boolean) => {
    const nextState = setAutomaticAdaptationOverridden(
      triggerStateRef.current,
      !enabled,
    );
    triggerStateRef.current = nextState;
    setTriggerState(nextState);
    if (enabled && pendingAutomaticAdaptationRef.current) {
      pendingAutomaticAdaptationRef.current = false;
      setPresentation("wizard");
    }
    setFrictionResponse(
      getFrictionScoreResponse(
        summary,
        scoreInteractionFriction(summary),
        nextState,
        Date.now(),
      ),
    );
  };

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
            onClick={() => {
              if (presentation === "wizard") {
                restoreOriginal();
              } else {
                setPresentation("original");
              }
            }}
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
        <div className="adaptation-actions">
          <button
            className="button button-primary"
            type="button"
            disabled={presentation === "wizard"}
            onClick={simplifyNow}
          >
            Simplify now
          </button>
          {presentation === "wizard" && (
            <button
              className="button button-secondary"
              type="button"
              onClick={restoreOriginal}
            >
              Restore original
            </button>
          )}
          <label className="automatic-adaptation-toggle">
            <input
              type="checkbox"
              checked={!triggerState.automaticAdaptationOverridden}
              onChange={(event) => setAutomaticEnabled(event.target.checked)}
            />
            Automatic simplification
          </label>
        </div>
      </div>

      {frictionResponse !== null && (
        <section
          className="friction-score"
          aria-label="Provisional interaction friction score"
        >
          <div className="friction-score-heading">
            <div>
              <p className="toolbar-label">PROVISIONAL INTERACTION FRICTION SCORE</p>
              <strong>
                {frictionResponse.score}/100 · {frictionResponse.level}
              </strong>
            </div>
            <p>
              A research indicator, not a probability or a measure of emotion.
            </p>
          </div>
          <p role="status">
            {frictionResponse.triggerEligibility.automatic
              ? "Automatic simplification is eligible."
              : `Automatic simplification is waiting: ${frictionResponse.triggerEligibility.blockers.join(", ")}.`}
          </p>
          <details>
            <summary>Feature explanations</summary>
            <ul className="friction-explanations">
              {frictionResponse.explanations.map((feature) => (
                <li key={feature.feature}>
                  <strong>
                    {feature.feature.replace(/([A-Z])/g, " $1").toLowerCase()}:
                  </strong>{" "}
                  {feature.explanation}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

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

      <p className="telemetry-status" role="status" aria-live="polite">
        Telemetry service: {connectionStatus}
      </p>
      <details className="telemetry-inspector">
        <summary>Local interaction summary (rolling 30 seconds)</summary>
        <pre aria-label="Local telemetry summary">
          {JSON.stringify(summary, null, 2)}
        </pre>
      </details>

      <footer className="page-footer">
        <span>Aggregate telemetry only · No real application · No lending decision</span>
      </footer>
    </main>
  );
}
