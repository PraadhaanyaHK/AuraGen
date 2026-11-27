import {
  Component,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  LazyMotion,
  MotionConfig,
  domAnimation,
  m,
  useReducedMotion,
} from "framer-motion";
import {
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import {
  FINANCIAL_FORM_FIELDS,
  FINANCIAL_FORM_SECTIONS,
  validateAdaptiveUiPlan,
  type AdaptiveUiPlan,
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
  resolveRegisteredField,
  type FormValues,
} from "./fieldRegistry.js";
import {
  createFallbackAdaptiveUiPlan,
  resolveApprovedFieldIds,
} from "./adaptivePlan.js";
import {
  useFinancialFormTelemetry,
  type FinancialFormTelemetryEvents,
} from "./telemetry.js";
import { useTelemetrySocket } from "./telemetrySocket.js";

type Presentation = "original" | "wizard";

type RendererBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError: () => void;
};

export class AdaptiveRendererErrorBoundary extends Component<
  RendererBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    console.error("Adaptive renderer failed");
    this.props.onError();
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

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
    const invalidField = FINANCIAL_FORM_FIELDS.find(
      (definition) => form.getFieldState(definition.id).invalid,
    );
    if (invalidField) {
      form.setFocus(invalidField.id);
    }
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
function WizardForm({
  form,
  telemetry,
  plan,
  stepIndex,
  setStepIndex,
  completedSteps,
  setCompletedSteps,
  onValidationFailure,
  onAnimationFailure,
}: {
  form: UseFormReturn<FormValues>;
  telemetry: FinancialFormTelemetryEvents;
  plan: AdaptiveUiPlan;
  stepIndex: number;
  setStepIndex: (index: number) => void;
  completedSteps: ReadonlySet<number>;
  setCompletedSteps: (steps: ReadonlySet<number>) => void;
  onValidationFailure: () => void;
  onAnimationFailure: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const stepTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.14, ease: "easeOut" as const };
  const step = plan.steps[stepIndex]!;
  const currentFieldIds = resolveApprovedFieldIds(step.fieldIds);
  const fields = currentFieldIds
    .map((fieldId) => resolveRegisteredField(fieldId))
    .filter((field): field is NonNullable<typeof field> => field !== undefined);
  if (fields.length !== currentFieldIds.length) {
    throw new Error("Adaptive plan contains an unsupported field component");
  }
  const isLastStep = stepIndex === plan.steps.length - 1;

  const goNext = async () => {
    telemetry.click("wizard-continue");
    let valid: boolean;
    try {
      valid = await form.trigger(currentFieldIds);
    } catch {
      onValidationFailure();
      return;
    }
    if (valid) {
      setCompletedSteps(new Set([...completedSteps, stepIndex]));
      setStepIndex(Math.min(stepIndex + 1, plan.steps.length - 1));
    } else {
      telemetry.validationFailure();
      const focusInvalidField = () => {
        const invalidId = currentFieldIds.find(
          (fieldId) => form.getFieldState(fieldId).invalid,
        );
        if (invalidId) {
          document.getElementById(invalidId)?.focus();
        }
      };
      try {
        window.requestAnimationFrame(focusInvalidField);
      } catch {
        focusInvalidField();
        onAnimationFailure();
      }
    }
  };

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [stepIndex, plan.title]);

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
      <div className="wizard-progress">
        <span>
          Step {stepIndex + 1} of {plan.steps.length}
        </span>
        <progress
          value={stepIndex + 1}
          max={plan.steps.length}
          aria-label={`Wizard progress, step ${stepIndex + 1} of ${plan.steps.length}`}
        />
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Step {stepIndex + 1} of {plan.steps.length}: {step.title}
      </p>
      <m.section
        key={stepIndex}
        className="form-section"
        aria-labelledby="wizard-step-title"
        aria-describedby="wizard-step-description"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stepTransition}
      >
        <h2 id="wizard-step-title" ref={stepHeadingRef} tabIndex={-1}>
          {step.title}
        </h2>
        <p className="step-description" id="wizard-step-description">
          {step.description}
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
      </m.section>
      <div className="wizard-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={stepIndex === 0}
          onClick={() => {
            telemetry.click("wizard-back");
            telemetry.wizardNavigation(stepIndex, Math.max(stepIndex - 1, 0));
            setStepIndex(Math.max(stepIndex - 1, 0));
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
  const prefersReducedMotion = useReducedMotion() ?? false;
  const layoutTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: "easeOut" as const };
  const [presentation, setPresentation] = useState<Presentation>("original");
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const presentationHeadingRef = useRef<HTMLHeadingElement>(null);
  const { summary, events } = useFinancialFormTelemetry();
  const {
    connectionStatus,
    frictionResponse: serverFrictionResponse,
    adaptationPlan,
    generationError,
    cancelAdaptationRequest,
    sendAdaptationRequest,
  } = useTelemetrySocket(summary);
  const [triggerState, setTriggerState] = useState(
    createAdaptationTriggerState,
  );
  const triggerStateRef = useRef<AdaptationTriggerState>(triggerState);
  const pendingAutomaticAdaptationRef = useRef(false);
  const [frictionResponse, setFrictionResponse] =
    useState<FrictionScoreResponse | null>(null);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [activePlan, setActivePlan] =
    useState<AdaptiveUiPlan>(createFallbackAdaptiveUiPlan);
  const form = useForm<FormValues>({
    shouldUnregister: false,
    mode: "onBlur",
  });

  useEffect(() => {
    if (presentation === "original") {
      presentationHeadingRef.current?.focus();
    }
  }, [presentation]);

  useEffect(() => {
    if (serverFrictionResponse === null) {
      return;
    }

    setFrictionResponse(serverFrictionResponse);
    if (serverFrictionResponse.eligibleForAdaptation) {
      if (triggerStateRef.current.automaticAdaptationOverridden) {
        pendingAutomaticAdaptationRef.current = true;
      } else {
        sendAdaptationRequest(
          serverFrictionResponse,
          triggerStateRef.current.consecutiveHighWindows,
          presentation,
          activePlan,
        );
      }
    }
  }, [serverFrictionResponse]);

  useEffect(() => {
    if (adaptationPlan === null) {
      return;
    }
    try {
      const nextPlan = validateAdaptiveUiPlan(adaptationPlan.plan);
      setActivePlan(nextPlan);
      setWizardStepIndex((current) =>
        Math.min(current, nextPlan.steps.length - 1),
      );
      setPresentation("wizard");
    } catch {
      setActivePlan(createFallbackAdaptiveUiPlan());
      setPresentation("original");
      console.warn("Ignoring invalid adaptive UI plan", {
        event: "adaptation.plan",
      });
    }
  }, [adaptationPlan]);

  useEffect(() => {
    if (generationError !== null) {
      setActivePlan(createFallbackAdaptiveUiPlan());
      setPresentation("original");
    }
  }, [generationError]);

  const simplifyNow = () => {
    cancelAdaptationRequest();
    setRendererError(null);
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
      setActivePlan(createFallbackAdaptiveUiPlan());
      setPresentation("wizard");
    }
  };

  const restoreOriginal = () => {
    cancelAdaptationRequest();
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
    <MotionConfig reducedMotion="user">
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
            onClick={simplifyNow}
          >
            Simplify now
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={restoreOriginal}
          >
            Restore original
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              cancelAdaptationRequest();
              form.reset();
              setActivePlan(createFallbackAdaptiveUiPlan());
              setPresentation("original");
            }}
          >
            Reset fields
          </button>
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

      <LazyMotion features={domAnimation}>
        <m.div
          className="presentation-content"
          layout="position"
          transition={layoutTransition}
        >
          <div className="form-heading">
            <div>
              <h2 ref={presentationHeadingRef} tabIndex={-1}>
                {presentation === "original"
                  ? "Personal loan details"
                  : "Step-by-step preview"}
              </h2>
              <p>
                {presentation === "original"
                  ? "Complete the fields you want to explore."
                  : "The same approved fields, shown a section at a time."}
              </p>
            </div>
            <span className="field-count">
              {FINANCIAL_FORM_FIELDS.length} demo fields
            </span>
          </div>

          {presentation === "original" ? (
            <OriginalForm form={form} telemetry={events} />
          ) : (
            <AdaptiveRendererErrorBoundary
              fallback={<OriginalForm form={form} telemetry={events} />}
              onError={() => {
                setRendererError(
                  "The adaptive layout could not be displayed. The original form is unchanged.",
                );
                setPresentation("original");
              }}
            >
              <WizardForm
                form={form}
                telemetry={events}
                plan={activePlan}
                stepIndex={wizardStepIndex}
                setStepIndex={setWizardStepIndex}
                completedSteps={completedSteps}
                setCompletedSteps={setCompletedSteps}
                onValidationFailure={() => {
                  setRendererError(
                    "The current step could not be validated. The original form is unchanged.",
                  );
                  setPresentation("original");
                }}
                onAnimationFailure={() =>
                  setRendererError(
                    "Step focus animation is unavailable. Keyboard navigation remains available.",
                  )
                }
              />
            </AdaptiveRendererErrorBoundary>
          )}
        </m.div>
      </LazyMotion>

      <p className="telemetry-status" role="status" aria-live="polite">
        Telemetry service: {connectionStatus}
      </p>
      {generationError !== null && (
        <p className="telemetry-status" role="status">
          Plan unavailable: {generationError} The original form remains available.
        </p>
      )}
      {rendererError !== null && (
        <p className="telemetry-status" role="status">
          {rendererError}
        </p>
      )}
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
    </MotionConfig>
  );
}
