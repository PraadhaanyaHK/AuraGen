# AuraGen workspace instructions

- Read `docs/PROJECT_CONTEXT.md` and `docs/WORK_LOG.md` before starting work in
  this repository.
- The user is the sole developer. The four AuraGen modules are logical
  workstreams, not separate people or parallel owners.
- Work sequentially and implement only the task the user requests. Do not start
  future weeks or tasks without explicit direction.
- Inspect the worktree before editing. Preserve user changes and do not include
  unrelated files in commits.
- Keep the ten approved form field IDs, labels, controls, options, and
  validation rules sourced from `FINANCIAL_FORM_FIELDS` in
  `src/contracts.ts`. Do not create another catalogue or let generated UI
  redefine controls, validation, required status, or submission behavior.
- Keep form values local. Never send values, typed characters, identifiers,
  real financial records, or raw pointer coordinates to an API or AI provider.
- This is a synthetic UX research demo: no real applications, lending
  decisions, financial transactions, or personal identifiers.
- Run the smallest relevant tests and checks; report what ran and any failures.
- Do not commit or push unless the user asks.
