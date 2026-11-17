# AuraGen work log

This is the durable, concise progress history for new workspace conversations.
It is not a verbatim transcript.

## Week 1 - Day 1 - Task 1A: Foundation and shared contracts

- Kept a single root TypeScript package; did not introduce a monorepo.
- Added the canonical ten-field synthetic form catalogue and shared metadata,
  telemetry, friction, adaptation, adaptive-plan, WebSocket, and error
  contracts in `src/contracts.ts`.
- Added strict Zod validation, JSON Schema, exact-once field coverage checks,
  documentation, and contract tests.
- Verified with typecheck, lint, and 14 tests in the Day 1 session.
- Base commit present before Day 2 work: `80b1ab7` (`chore: establish AuraGen
  Week 1 contracts`).

## Week 1 - Day 2 - Task 1B: Original form and renderer foundation

- Added the responsive four-section original form, visible synthetic Research
  Demo disclaimer, accessible helpers and validation messages, and the
  temporary four-step wizard presentation.
- Added an application-owned component registry for all ten catalogue IDs.
  Input types and validation bounds are derived from the shared catalogue.
- Kept one React Hook Form instance above both layouts with
  `shouldUnregister: false`; no backend submission was added.
- Added renderer tests for field coverage and input types, validation,
  wizard-step validation, and value preservation when switching layouts.
- Updated the README with local run instructions.
- Latest verification: `npm test` (18 tests), `npm run typecheck`,
  `npm run lint`, and `npm run build` all passed.

## Week 1 - Task 1C: Browser telemetry tracker

- Added a reusable in-memory telemetry service and React hook scoped to the
  financial form; it publishes a rolling 30-second aggregate summary every
  five seconds and clears timers/state on disable or unmount.
- Tracks focus, blur, value-free input-change occurrences, validation failures,
  repeated clicks, field switches, focus-to-first-change/blur duration,
  wizard backtracking, and mouse-only movement-direction corrections.
- Added a local summary inspector; no network, WebSocket, or persistence
  integration was added.
- Telemetry contract summaries contain timestamps, counters, and aggregate
  hesitation-duration metrics only. Raw typed values and pointer coordinates
  are not read by or retained in the tracker.
- Known thresholds: repeated clicks are consecutive clicks on the same form
  field/action within 1 second; mouse corrections are direction reversals
  within 500 milliseconds. Hesitation is measured from focus to first change,
  or to blur if no change occurred. Wizard backtracks are counted only when
  navigating to a lower step index. Validation failures count once per failed
  field blur when its current value is invalid, and once per failed submit or
  wizard-step validation attempt (not once per invalid field in a submission).
- Added deterministic timestamped event helpers and focused tests.

## Week 2 - Task 1D: Backend foundation and security prototypes

- Added a Node.js/Express API with `/health`, strict `/api/generate`, and a
  `/ws` skeleton using `ws`, 16 KiB frame limits, Zod message validation, and
  an integration hook.
- Added a strict generator input containing canonical form metadata and
  aggregate friction reasons only. The deterministic mock provider remains
  the default; generated plans pass the shared Zod schema and exact-once field
  coverage check before returning. No live key or browser secret is required.
- Added malformed plan fixtures and backend/API tests, including rejection of
  value-bearing or extra-property generation requests.
- Added an internal Babel Parser/Traverse audit for JavaScript/JSX syntax and
  selected suspicious constructs. The report is static analysis only; audited
  source is never executed.
- Updated API build/run scripts, setup docs, and contract documentation.
- Verification: `npm test` (34 tests), `npm run typecheck`, `npm run lint`,
  `npm run build`, and compiled API health/generation plus AST smoke checks all
  passed. `npm audit --omit=dev` reported no production advisories; the full
  dependency tree has seven moderate development-dependency advisories.

## Week 1 readiness review (including existing Week 2 Day 1 foundation)

- Reviewed the form catalogue and validations against the approved synthetic
  form specification; contract schemas/types, plan coverage, original and
  wizard behavior, local telemetry, backend, mock generation, and static audit
  all passed.
- Fixed two contract/source-of-truth defects: derive section names from the
  canonical field catalogue, and enforce the documented 0–1000 telemetry
  counter bounds in Zod. Added boundary and successful/invalid original-form
  submission tests.
- Verification: `npm test` (35 tests), `npm run typecheck`, `npm run lint`,
  and `npm run build` passed. A compiled-server smoke check confirmed startup,
  `/health`, valid exact-once mock generation, and that the AST audit does not
  execute side-effecting input.
- Remaining debt is planned scope, not a Week 1 blocker: friction scoring and
  browser/backend integration are not implemented; the Babel audit checks
  selected patterns only and is not a security guarantee. The previously
  recorded seven moderate development-dependency advisories were not
  re-audited during this review.

## Next

Wait for the user's next implementation task. Do not begin a later task or
week without an explicit request.
