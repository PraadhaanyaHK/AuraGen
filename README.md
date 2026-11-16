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

The repository includes the Week 1 shared contracts and the original synthetic
form renderer:

- The canonical ten-field synthetic form catalogue and safe metadata shape.
- Versioned Zod contracts for telemetry, friction responses, adaptation
  requests, adaptive UI plans, WebSocket messages, and errors.
- A 16 KiB WebSocket message limit and exact-once field coverage validation.
- A Node.js/Express API with `/health` and strict `POST /api/generate`
  endpoints, plus a bounded `ws` server skeleton at `/ws`.
- A deterministic mock plan provider used by default. Generation accepts
  approved form metadata and aggregate friction reasons only; it never accepts
  form values and does not require a live provider key.
- A Babel JavaScript/JSX AST audit module for static analysis only. Audited
  source is parsed and traversed, never executed.
- An original four-section React form and a temporary wizard preview. Both use
  one React Hook Form instance and the same approved field-component registry.
- Contract documentation, a portable adaptive-plan JSON Schema, and focused
  contract, backend, AST-audit, and renderer tests.

Friction scoring, browser-to-backend integration, and live generation are not
implemented yet.

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
npm run dev
npm run dev:api
npm run typecheck
npm run lint
npm test
npm run build
```

Run `npm run dev` and `npm run dev:api` in separate terminals. Open the local
URL printed by Vite (by default
`http://127.0.0.1:5173/`) to see the original form. Use the **Wizard preview**
switch above the form to preview the temporary step-by-step layout; the same
form values are retained when switching layouts.

The API listens on `http://127.0.0.1:3001` by default; `PORT` may override the
port. Check `GET /health`. `POST /api/generate` accepts a JSON object with the
canonical `metadata` object and a `frictionReasons` array. The server rejects
additional properties, including form values. `npm run build` also compiles
the API; after building, `npm run start:api` runs the compiled service.

The AST audit is an internal module and is not exposed as a browser endpoint.
Its report is static analysis only, not a security guarantee or permission to
execute source. No source passed to the audit is run or evaluated.

See [docs/CONTRACTS.md](docs/CONTRACTS.md) for message ownership, event names,
versioning, and payload boundaries. See
[docs/FINANCIAL_FORM_SPEC.md](docs/FINANCIAL_FORM_SPEC.md) for the approved
synthetic form fields and constraints.
