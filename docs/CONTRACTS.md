# AuraGen shared contracts

This document defines the first shared contract version for the synthetic
personal-loan demo. The executable definitions live in `src/contracts.ts`;
the JSON Schema artifact is `docs/ADAPTIVE_UI_SCHEMA.json`. Do not create a
second field catalogue in an app or service.

## Contract and protocol versions

- `CONTRACT_VERSION` (`1.1`) versions WebSocket envelopes and their payload
  shapes. Version 1.1 adds the prolonged-unchanged-hesitation telemetry count
  and explained friction-score eligibility.
- `ADAPTIVE_UI_SCHEMA_VERSION` (`1.0`) versions the approved form metadata and
  adaptive UI plan.
- Envelopes with an unsupported protocol version and plans with an unsupported
  schema version are rejected. A future incompatible change must introduce a
  new version and update the TypeScript/Zod contract, JSON Schema and tests
  together.

## Financial form field catalogue and metadata

`FINANCIAL_FORM_FIELDS` is the only source of truth for the ten stable IDs,
labels, sections, control types, options and validation constraints.
`FIELD_IDS` and `FIELD_METADATA` are derived from it.

`FinancialFormMetadata` contains only the fixed form ID, schema version, and
approved field IDs/labels/sections/control types. It deliberately omits input
values, validation rules, identifiers and free-form user data. The backend may
use this metadata to describe the form to a generator; it must never accept
model-provided controls or validation rules. The metadata schema checks each
field against the canonical catalogue rather than trusting a client-supplied
definition.

## Telemetry summary

The browser produces a local `TelemetrySummary` for one 30-second window using
aggregate counters only. It sends one summary every five seconds to the
separate WebSocket service; no individual browser events are transmitted. The
summary must not contain field values, typed characters, personal identifiers
or raw pointer coordinates. Counts are bounded to 0–1000; the window end
cannot precede its start.
The `prolongedUnchangedHesitations` counter records focus durations of at least
12 seconds only when the field blurs without a value change; the original
focus-to-first-change duration aggregate remains separate.

## Friction score response

The `FrictionScoreResponse` contains a provisional, deterministic Interaction
Friction Score, normalized feature values, per-feature explanations, and
automatic/manual trigger eligibility. It is not a probability or a direct
measure of emotion. Scoring weights, normalization counts, thresholds, and
trigger behavior are documented in [FRICTION_SCORING.md](./FRICTION_SCORING.md).
Automatic eligibility requires two consecutive high windows, an independent
task signal, no active cooldown, no user override, and no restore suppression.

## Adaptation request

The `AdaptationRequest` contract is reserved for a future generation
integration. The telemetry service currently returns trigger eligibility in
the friction score response and does not send or accept adaptation requests.
When enabled, the request must contain approved metadata, aggregate telemetry,
the friction response, at least two consecutive high windows, and one
independent task signal. It must not contain form values.

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

The server generation adapter is mock-first. Live mode uses the server-side
`OPENAI_API_KEY` and optional `OPENAI_MODEL` (`gpt-4o` by default), sends only
the form ID, schema version, approved field metadata, and aggregate friction
reasons, and requests a LangChain structured output schema. The response is
still parsed through Zod and the exact-once invariant. Missing credentials,
provider errors, timeouts, and malformed responses return a safe deterministic
fallback rather than breaking mock mode. No form values are sent to the
provider.

## WebSocket message envelopes

Every message is a strict JSON object with `protocolVersion`, a UUID
`requestId`, an event name and the event-specific payload. Unknown event names
and additional properties are rejected.

| Direction | Event | Payload | Sender → consumer |
|---|---|---|---|
| Client → server | `telemetry.summary` | `TelemetrySummary` | Browser → WebSocket service |
| Client → server | `adaptation.request` | `AdaptationRequest` | Reserved; not enabled by the telemetry service |
| Server → client | `friction.score` | `FrictionScoreResponse` | WebSocket service → browser |
| Server → client | `adaptation.plan` | `AdaptiveUiPlan` | API → browser |
| Server → client | `error` | `StandardErrorResponse` | API → browser |

Both `parseClientMessage` and `parseServerMessage` check a maximum encoded
message size of 16 KiB before JSON parsing, then validate the strict envelope
and payload. Server-side WebSocket handlers must call `parseClientMessage` for
every inbound client frame; the browser must call `parseServerMessage` for
every inbound server frame. Invalid frames are rejected, not coerced.

The telemetry service scopes trigger hysteresis and duplicate request tracking
to the live socket session and keeps no telemetry on disk. Request IDs are
echoed for response correlation; stale summaries are rejected. The browser
ignores responses for a superseded request or connection and retries after a
disconnect. Automatic adaptation eligibility is returned in the score
response; the separate adaptation/generation request is not enabled here.

## Standard error response

The server sends `StandardErrorResponse` in the `error` event. It contains a
bounded machine-readable code, a short user-safe message and a retryable flag.
It must not include stack traces, secrets, form values or unbounded provider
output.

## Source and consumer map

| Contract | Defined/validated in | Producer | Consumer |
|---|---|---|---|
| Field catalogue and metadata | `src/contracts.ts` | Shared package | Web app, API, generator |
| Telemetry summary | `src/contracts.ts` | Web app | WebSocket service / friction engine |
| Friction response | `src/contracts.ts` | WebSocket service / friction engine | Web app |
| Adaptation request | `src/contracts.ts` | Web app | API / generation service |
| Adaptive UI plan and coverage gate | `src/contracts.ts`, JSON Schema | Generation service | API and web renderer |
| Message envelopes and errors | `src/contracts.ts` | Web app / API | API / web app |

This repository currently keeps the contracts as a small root TypeScript
package. App and service workspaces should be introduced only when those
applications are actually added.
