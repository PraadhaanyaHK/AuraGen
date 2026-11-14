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

## Next

Wait for the user's next implementation task. Do not begin a later task or
week without an explicit request.
