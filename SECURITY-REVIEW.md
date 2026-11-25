# AuraGen Security Review

## Scope and conclusion

This is a security review of the synthetic prototype's browser telemetry,
WebSocket service, optional LLM provider, plan validation, and renderer. It is
not a security certification or a claim that the system is completely secure.

One medium-severity WebSocket authorization issue and one moderate
development-dependency risk were found and fixed. The service now accepts
only configured browser origins, refuses non-loopback binding, and authorizes
adaptation generation from server-maintained scoring state rather than
client-supplied eligibility. The eligible score is consumed once and is the
score passed to generation.

## Findings

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| 1 | 🟡 MEDIUM | `server/telemetryWebSocket.ts` | 64-76, 112-133 (before fix) | The WebSocket accepted cross-origin connections and trusted client-supplied adaptation eligibility, allowing an unearned request to invoke configured paid generation. | 8/10 |
| 2 | 🟡 MEDIUM | `package-lock.json` | 1598 (before fix) | The development lint dependency chain resolved vulnerable `minimatch` 10.2.6, exposing local lint/tooling runs to a glob-parts denial of service. | 9/10 |

**Status:** Both findings are fixed. Handshakes require an exact allowed
Origin; the service is restricted to loopback binds. Adaptation requests now
require a current server-scored eligible window and cannot reuse that
eligibility. Updating the lint toolchain removed the vulnerable transitive
dependency; the subsequent full `npm audit` reported zero vulnerabilities.

## Verification checklist

1. **Form values and typed characters in telemetry:** Telemetry records event
   counters and hesitation durations only. The telemetry tests enter a
   sentinel value and verify it is absent from the exposed summary.
2. **Raw pointer coordinates:** Pointer movement direction is reduced to
   aggregate correction counts in memory. Pointer coordinates and movement
   deltas are not in the telemetry contract or WebSocket payload, and no
   telemetry persistence is implemented.
3. **Sensitive data in LLM prompts or logs:** The generation payload is built
   from the canonical form metadata, bounded aggregate friction context,
   presentation mode, and prior plan labels. It does not accept form values.
   Application logs contain fixed messages and safe event/error metadata, not
   request bodies, provider output, or form values.
4. **WebSocket validation and size limits:** The server enforces a 16 KiB
   frame limit and parses all client envelopes through the strict shared Zod
   schema before handling them. Browser Origin checks and loopback binding
   further constrain access.
5. **Generated-plan validation:** Provider and mock plans pass the shared Zod
   plan validator before being returned. The browser validates the plan again
   before rendering.
6. **Exact-once approved fields:** Plans are checked against the ten IDs in
   `src/contracts.ts`; each must appear exactly once.
7. **Unknown, missing, duplicate, or excessive fields:** Strict schemas and
   exact-coverage checks reject these cases. Step count, step IDs, field IDs,
   and text lengths are bounded.
8. **Overlong or malformed model output:** Live completion is limited to 512
   tokens; the provider call has a timeout; serialized output is capped at
   16 KiB; and plan text fields have explicit length bounds. Invalid output
   falls back to the approved plan.
9. **Prompt injection in metadata:** Context is marked as untrusted in the
   system prompt. Even if injected text persuades a model to add fields,
   executable content, or submission behavior, strict schema and exact-field
   validation reject the result and retain the fallback.
10. **Model control over behavior:** Model output contains presentation text
    and approved field IDs only. Field controls and validation come from the
    application-owned catalogue and registry; no model output defines
    calculations or submission actions. The form is a demo and does not submit
    applications.
11. **Dynamic code execution:** No `eval()`, `new Function()`,
    `dangerouslySetInnerHTML`, generated JSX execution, or equivalent
    application-path mechanism was found in the reviewed source.
12. **Babel AST feature:** A Babel AST static-analysis demonstration is not
    implemented in this prototype. It is not part of, nor a runtime
    alternative to, the constrained renderer.
13. **API keys:** `OPENAI_API_KEY` is read by the server-side generation
    module. The browser code does not import server modules or receive the key.
    Live mode is opt-in; deterministic mock generation is the default.
14. **Development audit endpoints:** No separate HTTP audit endpoint exists.
    The WebSocket service is local-only and now rejects non-loopback binds.
15. **Dependency and configuration risks:** `package-lock.json` records the
    installed dependency tree, while `package.json` uses semver ranges. The
    initial `npm audit` reported seven moderate findings in the development
    lint dependency chain (`typescript-eslint` to `minimatch`). The lint
    dependency was upgraded to `typescript-eslint` 8.74.0; the follow-up audit
    reported zero vulnerabilities. No automated dependency-update or
    vulnerability-monitoring workflow is configured, so rerun dependency
    checks and review lockfile changes before deployment.
    `AURAGEN_GENERATION_MODE=live` can incur provider costs; keep
    `OPENAI_API_KEY` server-side. The optional
    `TELEMETRY_WS_ALLOWED_ORIGINS` setting must contain exact HTTP(S) origins,
    not wildcards. The service intentionally does not support remote binding.

## Prototype limitations

- The Origin check is a browser cross-origin defense, not client
  authentication. The loopback-only bind is essential; a local process can
  still connect.
- There is no TLS, user authentication, rate limiting, durable audit trail,
  production monitoring, or deployment hardening.
- A compromised browser, extension, local process, dependency, or provider is
  outside this prototype's protections. Form values necessarily exist in
  browser memory while being entered; users must not enter real financial or
  identifying information.
- Provider data handling is subject to the configured provider and its
  applicable policies. No live credentials or provider call were used in
  verification.
- This synthetic demo does not perform real financial calculations, make
  lending decisions, submit applications, or process transactions.

## Regression coverage

Security-specific tests cover disallowed WebSocket origins, non-loopback bind
rejection, forged eligibility without a server-scored trigger, one-time
eligibility use, prompt-injection-shaped context, and oversized model output.
Existing contract, telemetry, generation, and renderer tests cover the
remaining boundaries listed above.
