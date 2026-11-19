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

## Week 2 - Day 2 - Task 2A: Interaction friction score and trigger

- Added a deterministic, provisional IFS formula with centralized weights,
  normalization counts, score bands, click/hesitation thresholds, pointer
  sample minimum, window continuity, and cooldown policy. The WebSocket
  contract version was raised to 1.1 for the new telemetry and score response
  fields.
- Preserved existing focus-to-change duration metrics and added an aggregate
  counter for focus held at least 12 seconds without change before blur.
  Repeated-click detection now uses the specified 1.2-second window.
- Added pointer-feature exclusion and weight renormalization for unavailable
  corrections or fewer than ten mouse samples. Pointer speed is not recorded
  or scored.
- Added typed score explanations and automatic/manual trigger eligibility,
  consecutive-window hysteresis, independent task-signal tracking, 90-second
  cooldown, automatic opt-out, manual “Simplify now,” and same-window restore
  suppression.
- Wired local automatic/manual simplification and restore controls into the
  renderer; no telemetry or form values are sent to a provider.
- Verification: `npm test` (39 tests), `npm run typecheck`, and `npm run lint`
  passed.

## Week 2 - Day 3 - Task 2B: Frontend telemetry WebSocket integration

- Added a standalone Node `ws` service on `/telemetry`, with a 16 KiB frame
  limit, shared Zod message validation, bounded summary counts, stale-window
  rejection, request-ID deduplication, and per-connection trigger state.
- The Vite client sends only one aggregate summary per five-second interval,
  correlates responses, prevents overlapping requests, surfaces connection
  status, and reconnects with bounded backoff. Form controls remain usable
  while the service is disconnected.
- The service returns the shared IFS response and trigger eligibility. It
  keeps state in memory only; plan generation and `adaptation.request` remain
  disabled. No form values, typed text, identifiers, or raw pointer
  coordinates are transmitted.
- Added real WebSocket integration coverage for low/high scores, high-friction
  trigger hysteresis, pointer-only exclusion, malformed/oversized/stale
  messages, request correlation/deduplication, and client reconnect behavior.
- Verification: `npm test` (47 tests), `npm run typecheck`, `npm run lint`,
  `npm run build`, and `git diff --check` all passed.

## Week 2 - Task 2C day 4: Structured AI generation pipeline

- Added a server-only, deterministic mock-first generation interface with an
  optional LangChain `ChatOpenAI` structured-output adapter using `gpt-4o` by
  default.
- Live prompts include only the fixed form ID, schema version, approved field
  metadata, and aggregate friction reasons. The system prompt forbids fields,
  controls, validation changes, executable code, financial decisions, and
  submission actions.
- Provider responses are parsed through Zod and the existing exact-once field
  coverage validator. Missing credentials, provider failures, timeouts, and
  malformed output return a safe approved-field mock fallback.
- Added provider-mocked tests for default mock mode, payload boundaries,
  malformed output, missing credentials, and provider failure. No paid model
  call is required by CI.
- Verification: `npm test`, `npm run typecheck`, `npm run lint`, and
  `npm run build`.

## Next

Wait for the user's next implementation task. Do not begin a later task or
week without an explicit request.
