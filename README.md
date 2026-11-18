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
   IFS, trigger guards, and the aggregate-summary WebSocket connection.
2. **Code-Gen Agent** — API and WebSocket gateway, mock-first structured plan
   generation, and a server-side provider adapter.
3. **Schema and Security Gate** — shared TypeScript/Zod contracts,
   JSON Schema, field-coverage validation, and separate Babel AST static
   analysis.
4. **Dynamic Renderer** — original form and adaptive wizard using approved
   components and one persistent form state.

These are sequential workstreams for one developer, not separate team owners.

## Current repository stage

The repository includes shared contracts, the original synthetic form
renderer, and a separate telemetry WebSocket service:

- The canonical ten-field synthetic form catalogue and safe metadata shape.
- Versioned Zod contracts for telemetry, friction responses, adaptation
  requests, adaptive UI plans, WebSocket messages, and errors.
- Provisional Interaction Friction Score calculation with explained features,
  consecutive-window trigger guards, cooldown, manual simplification, and
  restore suppression.
- A 16 KiB WebSocket message limit and exact-once field coverage validation.
- An original four-section React form and a temporary wizard preview. Both use
  one React Hook Form instance and the same approved field-component registry.
- Contract documentation, a portable adaptive-plan JSON Schema, and focused
  contract and renderer tests.

The WebSocket telemetry service scores aggregate summaries and returns the
provisional friction response. It runs separately from the Vite frontend.
Adaptation-plan generation is not enabled yet. Provisional score weights and
trigger thresholds are documented in
[docs/FRICTION_SCORING.md](docs/FRICTION_SCORING.md).

## Development

Requirements: Node.js 20 or newer and npm 10 or newer.

```sh
npm install
# Terminal 1
npm run dev:ws
# Terminal 2
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

Run the WebSocket service and Vite frontend in separate terminals. The
service listens on `127.0.0.1:8081` by default; configure it with
`TELEMETRY_WS_HOST` and `TELEMETRY_WS_PORT`. Set
`VITE_TELEMETRY_WS_URL` to override the frontend WebSocket URL. The frontend
continues to work if the service is unavailable and reconnects automatically.

Open the local URL printed by Vite (by default
`http://127.0.0.1:5173/`) to see the original form. Use the **Wizard preview**
switch above the form to preview the temporary step-by-step layout, or choose
**Simplify now** for a manual simplification. Automatic simplification can be
paused with its checkbox; restoring the original layout suppresses the current
window. The same form values are retained when switching layouts.

See [docs/CONTRACTS.md](docs/CONTRACTS.md) for message ownership, event names,
versioning, and payload boundaries. See
[docs/FINANCIAL_FORM_SPEC.md](docs/FINANCIAL_FORM_SPEC.md) for the approved
synthetic form fields and constraints.
