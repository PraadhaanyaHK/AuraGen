# Week 1 Readiness Review

**Review date:** 2026-11-17

**Scope:** Week 1 and the existing Week 2 Day 1 foundation, reviewed as one integrated codebase. This review does not authorize or begin later-week implementation.

## Overall result

**PASS — ready for the next approval gate.** All eleven requested checks pass
after the two contract fixes listed below.

## Readiness checks

| # | Check | Result | Evidence and notes |
|---|---|---|---|
| 1 | Ten field IDs and validation rules match the approved specification | **PASS** | The canonical catalogue matches the ten IDs, labels, controls, options, and numeric bounds in [FINANCIAL_FORM_SPEC.md](FINANCIAL_FORM_SPEC.md). |
| 2 | Form definition is the single source of truth | **PASS** | [FINANCIAL_FORM_FIELDS](../src/contracts.ts) owns the field definitions; IDs, metadata, and sections are derived from it. |
| 3 | Shared Zod schemas and TypeScript types agree | **PASS** | Shared contract types are inferred from their Zod schemas. The renderer's `FormValues` type is local; form values are not part of a shared network contract. |
| 4 | Adaptive UI plan schema and exact-once field validation | **PASS** | [AdaptiveUiPlanSchema and validateAdaptiveUiPlan](../src/contracts.ts) validate plan structure and reject missing, duplicate, or unknown field IDs. |
| 5 | Original form renders and validates | **PASS** | [form.test.tsx](../tests/form.test.tsx) covers field rendering, validation errors, invalid submission, and valid submission. |
| 6 | Switching original and wizard shells preserves values | **PASS** | The app uses one React Hook Form instance with `shouldUnregister: false`; layout switching is covered in [form.test.tsx](../tests/form.test.tsx). |
| 7 | Telemetry is locally aggregated and excludes raw coordinates and field contents | **PASS** | [telemetry.ts](../src/telemetry.ts) keeps event deltas in memory and publishes aggregate counters/metrics only. The strict summary schema rejects extra properties. |
| 8 | Backend starts and health endpoint works | **PASS** | The compiled API process started and returned HTTP 200 from `/health`; the integration test also checks the endpoint in [backend.test.ts](../tests/backend.test.ts). |
| 9 | Mock provider returns a valid plan | **PASS** | The compiled endpoint returned a plan with every approved field exactly once. |
| 10 | Babel AST audit is separate and never executes source | **PASS** | [audit.ts](../server/audit.ts) parses and traverses source as static analysis; it is not exposed as an API endpoint. A side-effect probe confirmed the source was not run. |
| 11 | Tests, typecheck, lint, and build status | **PASS** | `npm test` (35 tests), `npm run typecheck`, `npm run lint`, and `npm run build` all passed. |

## Fixes made during review

1. Derived `FINANCIAL_FORM_SECTIONS` from the canonical field catalogue instead
   of maintaining a second manually duplicated section list.
2. Enforced the documented 0–1000 upper bound on each telemetry counter in the
   shared Zod schema, with a boundary test.
3. Added a form test proving invalid original-form submission is blocked and
   valid demo values receive confirmation.

## Technical debt and prioritized follow-up

1. **Re-check dependency advisories before release.** The previous work log
   records seven moderate development-dependency advisories. They were not
   re-audited as part of this review; confirm current advisories before
   prioritizing dependency updates.
2. **Implement only after approval:** friction scoring and browser/backend
   integration are not implemented. They remain later planned work and are
   not Week 1 readiness blockers.
3. **Keep audit claims scoped.** The Babel audit detects selected patterns; it
   is not a comprehensive security scanner or a security guarantee.

## Verification record

- `npm test` — passed, 35 tests.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- Compiled API smoke check — startup, `/health`, and exact-once mock generation
  passed.
- Static audit smoke check — confirmed static-only result and no source
  execution.

No Week 2 features beyond the already-present Day 1 foundation were started.
