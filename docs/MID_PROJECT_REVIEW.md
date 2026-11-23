# Mid-Project Review - Week 2 MVP Audit

## Audit date

2026-11-21

## Architecture summary

AuraGen is a Vite/React TypeScript client with a separate Node/WebSocket
telemetry service.

- `src/contracts.ts` owns the canonical ten-field catalogue and Zod contracts.
- `src/fieldRegistry.tsx` maps approved field IDs to application-owned React
  components.
- `src/App.tsx` keeps one React Hook Form instance with `shouldUnregister:
  false`; it owns original and wizard presentation state.
- `src/telemetry.ts` tracks privacy-safe aggregate interaction counters locally.
- `src/friction.ts` and `src/frictionPolicy.ts` calculate the provisional IFS
  and enforce consecutive-window, independent-signal, cooldown, override, and
  restore policies.
- `src/telemetrySocket.ts` sends aggregate summaries, correlates responses,
  reconnects with bounded backoff, and requests approved-plan generation.
- `server/telemetryWebSocket.ts` validates 16 KiB bounded messages, stale
  summaries, duplicate request IDs, score state, and adaptation requests.
- `server/generation.ts` provides deterministic mock generation and an optional
  server-side OpenAI adapter.
- `src/adaptivePlan.ts` creates the approved fallback plan.
- `docs/ADAPTIVE_UI_SCHEMA.json` provides the portable JSON Schema artifact.

## End-to-end demonstration steps

1. Run `npm.cmd run dev:ws` and `npm.cmd run dev`.
2. Open `http://127.0.0.1:5173/`.
3. Confirm the original form and all ten catalogue fields.
4. Enter synthetic values. Trigger the validation action and blur invalid
   values to demonstrate on-blur and submit validation.
5. Open Local interaction summary and confirm only aggregate counts and
   hesitation-duration metrics appear.
6. Produce two consecutive 30-second high IFS windows with an independent
   task signal to demonstrate automatic eligibility.
7. Use Simplify now to demonstrate manual fallback wizard activation.
8. Navigate Back/Continue and Restore original; confirm values remain in place.
9. Confirm WebSocket status becomes connected and that invalid frames receive
   an `INVALID_MESSAGE` or `INVALID_TELEMETRY` error.
10. In mock mode, confirm adaptation returns the four-step prebuilt plan.
11. If configured only in the server process, set `AURAGEN_GENERATION_MODE=live`
    and `OPENAI_API_KEY`; otherwise confirm missing credentials return a safe
    fallback.

## Screenshots to capture

1. Original form with the research disclaimer and all ten fields.
2. A validation error and the preserved field-label/helper text.
3. The local telemetry inspector showing aggregate-only data.
4. The IFS explanation panel at low, moderate, or high score.
5. The four-step fallback wizard.
6. The wizard showing a value entered before switching layouts.
7. Restored original layout showing the same entered value.
8. Telemetry service connected/disconnected status.
9. A failed or malformed plan view showing the original-layout fallback.

Screenshots were captured during the browser demonstration for:

- The original form and synthetic disclaimer.
- The fallback wizard presentation with a preserved value.

## Test report

Executed commands:

- `npm.cmd test`: 7 test files passed, 55 tests passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; 119 modules transformed.
- Vite HTTP probe: `http://127.0.0.1:5173/` returned 200 OK.
- WebSocket runtime probe: connected; invalid envelope rejected with
  `INVALID_MESSAGE`; 95/100 first window waited for the second window; 95/100
  second window was eligible.
- Mock generation runtime probe: mock mode, 4 steps, 10 field references,
  no fallback.
- Live missing-key probe: no `OPENAI_API_KEY`, live mode returned
  `missing-credentials` with fallback.
- Browser runtime probe: original form loaded with all ten fields; entering
  `7` in Years in current work, switching to Wizard preview, and restoring
  preserved `7`.

## Implemented versus incomplete features

Implemented:

- Canonical ten-field original form and application-owned controls.
- Shared Zod contracts and exact-once field coverage.
- Form validation and wizard-step validation.
- Privacy-safe local rolling telemetry.
- IFS formula, bands, trigger state, independent signal, cooldown, override,
  restore suppression, and pointer exclusion.
- WebSocket envelope validation, stale/oversized/duplicate handling,
  reconnect behavior, and mock adaptation response.
- Deterministic mock generation and optional live provider adapter.
- Plan validation and fallback wizard rendering.
- One central form state and value preservation across layouts.
- Automatic and manual simplification controls.

Incomplete or not demonstrated as implemented:

- A Babel parser/traverse AST static-analysis demonstration is not present in
  the package or source. It must not be represented as completed.
- No live provider credential was configured in the audit environment.
- The mock/live end-to-end browser trigger was not left running with a real
  provider; the provider-mocked tests and live missing-key path were run.

## Fixes made during the audit

1. Automatic adaptation now derives the independent task signal from the
   scored friction response. This allows a streak to send adaptation when the
   signal occurred in the previous high window while the current summary may
   contain no independent signal.
2. Manual Simplify now activates the approved fallback plan directly instead of
   sending an adaptation request that automatic/eligible validation may reject.
3. Form tests now isolate the browser WebSocket dependency with a deterministic
   disconnected mock, avoiding native WebSocket event errors in Vitest.

## Known limitations

- IFS weights and thresholds are provisional.
- Telemetry and trigger state are in memory only.
- The WebSocket service is a local development service, not durable storage.
- Live provider calls depend on server credentials and can incur provider
  cost.
- The application does not submit a real loan or make lending decisions.
- Provider and plan failures fall back to the prebuilt four-step plan.
- The static Babel AST demonstration remains incomplete.

## Why approved JSON plans are rendered instead of arbitrary JSX

Generated plans are data-only JSON shaped by Zod and exact-once field coverage.
They may contain only a title, introduction, step IDs/titles/descriptions, and
approved field IDs. They cannot define components, controls, labels, validation,
required status, styling, submission behavior, JavaScript, JSX, imports, or
financial logic.

The renderer resolves each field ID through `src/fieldRegistry.tsx` and renders
only application-owned React components. Unknown fields, unsupported components,
schema violations, missing fields, and duplicate fields are rejected. If plan
generation or validation fails, the application uses `createFallbackAdaptiveUiPlan`,
which contains the same ten approved fields exactly once. This preserves form
behavior and values while preventing model output from becoming executable code.
