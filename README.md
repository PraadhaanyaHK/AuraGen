# AuraGen

AuraGen is a solo, four-week engineering project exploring a **self-healing
generative interface guided by interaction friction**.

## Project goal

Build a synthetic personal-loan form that can recognize sustained interaction
difficulty and offer a simpler, step-by-step presentation of the **same
approved fields**. The project will calculate an explainable Interaction
Friction Score (IFS) from aggregated interaction signals and use a validated,
structured UI plan to guide the adaptation.

This is a UX research prototype only. It will not submit a real loan
application, assess creditworthiness, make financial decisions, contact a
lender, or process real financial records.

## Safety and data boundaries

- Never send form values, typed characters, identifiers, or raw pointer
  coordinates to the API or an AI provider.
- Use a deterministic mock generator by default; any live provider remains
  server-side and requires explicit configuration.
- Accept structured JSON UI plans, not generated executable React or JavaScript.
- Validate plans and exact-once field coverage before rendering approved
  components.
- Keep field definitions, validation rules, and submission behavior under
  application control.
- Preserve form values when changing layouts; generated plans may rearrange
  fields but may not redefine them.

## Four logical workstreams

1. **Friction Engine** — privacy-conscious interaction summaries, explainable
   IFS, trigger guards, and later WebSocket integration.
2. **Code-Gen Agent** — API and WebSocket gateway, mock-first structured plan
   generation, and a server-side provider adapter.
3. **Schema and Security Gate** — shared TypeScript/Zod contracts,
   JSON Schema, field-coverage validation, and separate Babel AST static
   analysis.
4. **Dynamic Renderer** — original form and adaptive wizard using approved
   components and one persistent form state.

These are sequential workstreams for one developer, not separate team owners.

## Current repository stage

The repository currently contains the Week 1 shared-contract foundation:

- The canonical ten-field synthetic form catalogue and safe metadata shape.
- Versioned Zod contracts for telemetry, friction responses, adaptation
  requests, adaptive UI plans, WebSocket messages, and errors.
- A 16 KiB WebSocket message limit and exact-once field coverage validation.
- Contract documentation, a portable adaptive-plan JSON Schema, and focused
  contract tests.

The web app, API service, scoring implementation, live generation, and wizard
are not implemented yet. They will be added only as their week/task is
requested; the current small root package avoids introducing a monorepo before
there are applications to share.

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run typecheck
npm run lint
npm test
```

See [docs/CONTRACTS.md](docs/CONTRACTS.md) for message ownership, event names,
versioning, and payload boundaries. See
[docs/FINANCIAL_FORM_SPEC.md](docs/FINANCIAL_FORM_SPEC.md) for the approved
synthetic form fields and constraints.
