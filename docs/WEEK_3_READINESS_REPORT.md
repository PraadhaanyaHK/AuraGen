# Week 3 Readiness Review

**Review date:** 2026-11-27
**Scope:** Resilience, context continuity, security boundaries, accessibility,
and synthetic pilot readiness after Week 3.

## Readiness summary

Week 3 is ready to hand off as a synthetic research demo after fixing one stale
response race. This is not a production security certification or approval for
real financial data, applications, or decisions.

## Checklist

| Area | Result | Evidence |
|---|---|---|
| Values, touched state, and errors across layouts | Pass | One React Hook Form instance uses `shouldUnregister: false`; regression coverage preserves an invalid, blurred value and its error across both layout transitions. |
| Wizard navigation and restoration | Pass | Step progress, Back/Continue, second-plan handling, focus restoration, and returning to the original form are covered by renderer tests. |
| Generation failure recovery | Pass | A failed generation returns the UI to the original layout without losing entered values; the original form remains usable. |
| Timeouts and bounded retries | Pass | Provider requests are abortable with a per-attempt timeout; only transient failures/timeouts retry. Retries are capped at two, with regression tests for timeout, retry classification, and the cap. |
| Stale response handling | Pass after fix | Request correlation rejects stale plan responses. Cancellation now also invalidates a pending telemetry score, preventing it from initiating generation after restore/reset/manual simplification. |
| Security regression suite | Pass | Coverage includes origin rejection, loopback-only binding, forged eligibility, one-use authorization, prompt-injection-shaped context, malformed/oversized messages, and oversized provider output. |
| Generated code execution | Pass | Plans are schema-validated data rendered through approved field components. Source scan found no `eval`, `new Function`, `dangerouslySetInnerHTML`, or `innerHTML` assignment. The separate Babel AST static-analysis demo is not implemented. |
| Telemetry privacy | Pass | Telemetry and provider context are aggregate metadata only; form values and raw pointer coordinates are not sent. Tests use sentinel values and inspect serialized summaries. |
| Keyboard and reduced motion | Pass | Automated keyboard/focus/reduced-motion tests pass. A browser check with reduced motion enabled successfully navigated wizard steps by keyboard and restored the original form with focus. |
| Reproducible pilot and limitations | Pass | Synthetic scenarios and expected scores/adaptation counts are executable in `tests/pilot.test.ts` and documented in `docs/PILOT_CALIBRATION.md`. The document states that timings are scripted, not human-study results. |

## Week 3 defect fixed

The client previously canceled an outstanding generation request when the
user restored the original form, but did not invalidate an in-flight telemetry
score request. A delayed eligible score could therefore start a new generation
and unexpectedly switch the restored form back to the wizard. Cancellation
now clears the score request correlation and timer as well as generation
correlation. A regression test reproduces the delayed response and confirms
that it cannot trigger a new plan.

## Verification

Final local checks:

- `npm.cmd test` — 82 tests passed across 8 files.
- `npm.cmd run lint` — passed with zero warnings.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run build` — passed.
- `git diff --check` — passed.
- Browser reduced-motion keyboard/focus check — passed.

The shared browser page's telemetry WebSocket was unavailable during the manual
check (`ws://127.0.0.1:8081/telemetry` refused the connection). Offline behavior
kept the form usable; WebSocket integration behavior was verified separately
by the test suite.

## Remaining limitations

- No recruited participant study, observed completion-time distribution,
  false-positive rate estimate, or statistical power. The IFS remains a
  provisional UX heuristic.
- No screen-reader audit or physical touch-device validation was performed.
- The Babel AST static-analysis demonstration, production API, TLS,
  authentication, rate limiting, and production monitoring are not provided.
- Live-provider behavior was tested with injected providers, not live
  credentials or a paid provider call. Provider data-handling policies remain
  external to this prototype.
- The loopback/origin checks are not user authentication; a local process can
  connect. Do not enter real financial or identifying information.

## Disposition

Week 3 review is complete. The prototype is ready for Week 4 planning only
after the user's instructions; this review does not start Week 4 work.
