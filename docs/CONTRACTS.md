# AuraGen shared contracts

This document defines the first shared contract version for the synthetic
personal-loan demo. The executable definitions live in `src/contracts.ts`;
the JSON Schema artifact is `docs/ADAPTIVE_UI_SCHEMA.json`. Do not create a
second field catalogue in an app or service.

## Contract and protocol versions

- `CONTRACT_VERSION` (`1.0`) versions WebSocket envelopes.
- `ADAPTIVE_UI_SCHEMA_VERSION` (`1.0`) versions the approved form metadata and
  adaptive UI plan.
- Envelopes with an unsupported protocol version and plans with an unsupported
  schema version are rejected. A future incompatible change must introduce a
  new version and update the TypeScript/Zod contract, JSON Schema and tests
  together.

## Financial form field catalogue and metadata

`FINANCIAL_FORM_FIELDS` is the only source of truth for the ten stable IDs,
labels, sections, control types, options and validation constraints.
`FIELD_IDS`, `FIELD_METADATA`, and `FINANCIAL_FORM_SECTIONS` are derived from it.

`FinancialFormMetadata` contains only the fixed form ID, schema version, and
approved field IDs/labels/sections/control types. It deliberately omits input
values, validation rules, identifiers and free-form user data. The backend may
use this metadata to describe the form to a generator; it must never accept
model-provided controls or validation rules. The metadata schema checks each
field against the canonical catalogue rather than trusting a client-supplied
definition.

## Telemetry summary

The browser sends `TelemetrySummary` to the backend. It describes one 30-second
window using bounded aggregate counters only. It must not contain field values,
typed characters, personal identifiers or raw pointer coordinates. Counts are
bounded to 0–1000; the window end cannot precede its start.

## Friction score response

The backend sends `FrictionScoreResponse` to the browser. The score is an
integer from 0 to 100 with bands 0–34 low, 35–59 moderate and 60–100 high.
Feature values are normalized to 0–1. Adaptation eligibility cannot be true
for a non-high score. The schema defines the response shape, not the scoring
algorithm or trigger implementation.

## Adaptation request

The browser sends `AdaptationRequest` to the backend when the later trigger
logic has enough evidence. It contains approved metadata, aggregate telemetry,
the friction response, at least two consecutive high windows, and one
independent task signal. It contains no form values. The schema validates
eligibility but does not implement trigger guards.

## Adaptive UI plan

The generation service returns an `AdaptiveUiPlan`; the browser validates it
before rendering. Version 1.0 has a bounded title and introduction and 3–5
steps. Each step has a unique approved ID (`step-1` through `step-5`), bounded
title and description, and a non-empty list of approved field IDs.

The separate global coverage invariant requires every approved field ID to
appear exactly once across all steps. Shape validation and this invariant
reject unknown, missing and duplicate IDs. The plan cannot define controls,
validation, required status, executable code, styling, submission behavior or
financial logic. Renderers must resolve IDs through the approved component
registry.

The API's `POST /api/generate` body is a strict object containing only
`metadata` (the canonical `FinancialFormMetadata`) and `frictionReasons` (a
unique list of aggregate reason codes). The mock provider is the default.
Generation validates the input, parses the resulting plan with
`AdaptiveUiPlanSchema`, and checks exact-once field coverage before returning
it. No endpoint accepts entered form values.

## WebSocket message envelopes

Every message is a strict JSON object with `protocolVersion`, a UUID
`requestId`, an event name and the event-specific payload. Unknown event names
and additional properties are rejected.

| Direction | Event | Payload | Sender → consumer |
|---|---|---|---|
| Client → server | `telemetry.summary` | `TelemetrySummary` | Browser → API |
| Client → server | `adaptation.request` | `AdaptationRequest` | Browser → API |
| Server → client | `friction.score` | `FrictionScoreResponse` | API → browser |
| Server → client | `adaptation.plan` | `AdaptiveUiPlan` | API → browser |
| Server → client | `error` | `StandardErrorResponse` | API → browser |

Both `parseClientMessage` and `parseServerMessage` check a maximum encoded
message size of 16 KiB before JSON parsing, then validate the strict envelope
and payload. Server-side WebSocket handlers must call `parseClientMessage` for
every inbound client frame; the browser must call `parseServerMessage` for
every inbound server frame. Invalid frames are rejected, not coerced.
The API WebSocket server binds to `/ws`, enforces the same 16 KiB maximum at
the transport layer, and passes validated messages to an integration hook.
It is a server skeleton; friction scoring and browser integration are not
implemented here.

## Static JavaScript/JSX audit

The internal Babel audit parses JavaScript/JSX source and reports syntax
errors, imports, dynamic evaluation, selected unapproved globals,
network-capable calls, and suspicious JSX. Its output is explicitly
**static analysis only**. Audited source is never executed, evaluated, or
treated as safe based on a successful report.

## Standard error response

The server sends `StandardErrorResponse` in the `error` event. It contains a
bounded machine-readable code, a short user-safe message and a retryable flag.
It must not include stack traces, secrets, form values or unbounded provider
output.

## Source and consumer map

| Contract | Defined/validated in | Producer | Consumer |
|---|---|---|---|
| Field catalogue and metadata | `src/contracts.ts` | Shared package | Web app, API, generator |
| Telemetry summary | `src/contracts.ts` | Web app | API / friction engine |
| Friction response | `src/contracts.ts` | API / friction engine | Web app |
| Adaptation request | `src/contracts.ts` | Web app | API / generation service |
| Adaptive UI plan and coverage gate | `src/contracts.ts`, JSON Schema | Generation service | API and web renderer |
| Message envelopes and errors | `src/contracts.ts` | Web app / API | API / web app |

This repository currently keeps the contracts as a small root TypeScript
package. App and service workspaces should be introduced only when those
applications are actually added.
