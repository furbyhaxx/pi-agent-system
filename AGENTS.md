# AGENTS.md: pi-agent-system

## Rules for AI agents
- Keep the package entrypoint at `src/index.ts`.
- Use NodeNext-style internal imports with explicit `.ts` specifiers.
- Keep Pi API glue in `src/index.ts` and `src/commands.ts`; keep renderer/context/default-prompt logic pure and unit-testable.
- Public exported types, functions, and constants must have concise JSDoc.
- If template context shape, helpers, partial naming, command behavior, or default templates change, update `README.md`, `CHANGELOG.md`, and tests in the same change.
- Handlebars partials intentionally inherit context; do not change `explicitPartialContext: false` without user approval.
- Use `/system-prompt:*` command names only.
- Do not expose secrets, API keys, auth headers, or tokens in template context. Environment variables may be exposed only through sanitized prompt context.
- Use conventional commit messages.
