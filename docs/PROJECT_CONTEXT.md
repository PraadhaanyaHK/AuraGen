# AuraGen project context

This file carries forward durable project context between conversations. The
work log records completed tasks and verification; the chat history itself is
not stored verbatim here.

## Project and collaboration

AuraGen is a solo, four-week engineering project exploring a self-healing
generative interface guided by interaction friction. The user is the only
human developer. The four modules below are logical workstreams, not separate
team members. Work sequentially and implement only the task explicitly
requested; do not advance to future tasks on your own.

The goal is a synthetic personal-loan form that can later observe aggregate
interaction friction, calculate an explainable Interaction Friction Score,
and, after sustained evidence, request a constrained UI plan. A renderer may
rearrange approved fields into a wizard while preserving the same form values.
The LLM may return data-only plans, never executable React or JavaScript.

## Logical workstreams

1. **Friction Engine:** local telemetry aggregation, explainable scoring,
   trigger guards, and the aggregate-summary WebSocket connection.
2. **Code-Gen Agent:** API/WebSocket gateway, constrained plan generation,
   server-side provider adapter, and deterministic mock generation by default.
3. **Schema and Security Gate:** shared TypeScript/Zod contracts, JSON Schema,
   exact-once field coverage, and a separate Babel AST static-analysis demo.
4. **Dynamic Renderer:** original form and wizard layouts using one central
   React Hook Form instance and approved application-owned components.

## Non-negotiable safety and design boundaries

- The demo is synthetic. It must not submit a real loan application, assess
  creditworthiness, make lending decisions, contact a lender, or process
  transactions.
- Do not collect names, contact details, government IDs, bank account numbers,
  passwords, or real financial records.
- Never send form values, typed characters, personal identifiers, real
  financial records, or raw pointer coordinates to an API or AI provider.
- Keep secrets server-side. Do not put credentials in source, context files,
  or `NEXT_PUBLIC_` variables.
- Use a deterministic mock by default; live providers require explicit
  configuration.
- Accept constrained structured JSON plans, never generated executable code.
  Validate the plan and exact-once field coverage before rendering.
- Only application-owned components may render fields. AI plans cannot define
  controls, field definitions, validation, required status, or submission
  behavior.
- Keep a safe original-layout fallback if later generation, validation, or
  rendering fails.
- Preserve values with one central form-state instance and
  `shouldUnregister: false`.

## Canonical form and contracts

`src/contracts.ts` is the canonical source for the ten approved synthetic
fields, their stable IDs, labels, sections, control types, select options, and
validation rules. Do not duplicate or rename these definitions. See
`docs/FINANCIAL_FORM_SPEC.md` for the readable table and notes.

The WebSocket contract version is `1.1`; adaptive UI plan/schema version is
`1.0`. Adaptive UI plans contain 3-5 steps, approved step IDs (`step-1` through
`step-5`), and must include each approved field exactly once. Metadata sent to
a generator describes the form but never contains entered values.

The source specification does not define whether fields are required or
optional. Do not add a requiredness rule or indicator unless a future approved
specification defines it.

## Current repository and development

The repository is a single root package, not a monorepo. The current renderer
is a Vite/React application; it includes an original one-page form and a
temporary hardcoded wizard preview using the shared catalogue and field
registry. Local provisional friction scoring and automatic/manual adaptation
triggers are implemented. A separate, non-persistent WebSocket service now
accepts aggregate summaries, validates and scores them, and returns trigger
eligibility. Adaptive-plan generation and the broader API service remain
unimplemented.

Use Node.js 20+ and npm 10+. Common checks:

```sh
npm run dev
npm run dev:ws
npm test
npm run typecheck
npm run lint
npm run build
```

See `docs/WORK_LOG.md` for task progress and the latest verified checks. Update
that log when a task is completed. This context is a concise project record,
not a complete verbatim archive of past chats.

## Git workflow

The user has chosen module-specific branches, worked sequentially by the solo
developer. Use these names:

- `module/friction-engine`
- `module/code-gen-agent`
- `module/schema-security-gate`
- `module/dynamic-renderer`

Start module work from the latest `main`, complete and verify it on its module
branch, then merge it to `main` before starting another module. The branches
are organizational boundaries, not separate owners. Do not implement modules
or merge branches until the user requests that work.
