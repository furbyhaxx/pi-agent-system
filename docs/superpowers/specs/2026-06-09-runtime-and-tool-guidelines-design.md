# Runtime and Tool Guidelines Prompt Design

## Goal

Adjust the bundled `@furbyhaxx/pi-agent-system` prompt so the runtime footer is more readable and the tool guidance is organized around each active tool.

## Requested behavior

1. Show terminal size alongside TUI mode.
   - Render `Mode: tui (WIDTHxHEIGHT)` when width and height are available.
   - Render `Mode: tui (?x?)` when the session is in TUI mode but terminal dimensions are unavailable.
2. Show placeholder values for missing context-usage fields instead of leaving blank gaps.
   - Example shape: `Context usage: ? / 500000 tokens (?)`.
3. Do not show a `Pi package: ...` line in the system prompt.
4. Replace the separate active-tools list and aggregated tool-guidelines list with a single `Tool Usage Guidelines` section.
   - Show only active tools.
   - Give each active tool its own subsection.
   - Under each tool, render its description and that tool's own prompt guidelines.
   - Newly activated tools must appear automatically on the next render.

## Design

### Runtime context rendering

Keep runtime data construction in `src/context.ts` and runtime display logic in `templates/partials/runtime/context.md`.

Add a small runtime view model for prompt rendering so the template does not need to infer placeholder behavior itself. The runtime section should always render stable human-readable strings for:
- mode
- optional terminal size when mode is `tui`
- context usage with `?` placeholders for any missing values

The raw runtime data can stay available for custom templates, but the bundled template should prefer the normalized display-oriented values.

### Tool Usage Guidelines section

Replace the current bundled partial split:
- `templates/partials/pi/default-tools.md`
- `templates/partials/pi/default-guidelines.md`

with a tool-centric section that renders from active-tool details.

Each tool subsection should include:
- tool name
- tool description when available
- that tool's `promptGuidelines` entries when present

This keeps tool guidance attached to the tool that owns it instead of mixing all guidelines into one unrelated flat list.

### No package line

Remove the `Pi package: ...` line from the bundled runtime partial. Package metadata can remain in the template context for custom templates unless implementation work finds a reason to remove it from context too.

## Impacted files

- `src/types.ts`
- `src/context.ts`
- `templates/partials/runtime/context.md`
- `templates/default.SYSTEM.md`
- `templates/partials/pi/default-tools.md`
- `templates/partials/pi/default-guidelines.md`
- relevant tests in `tests/context.test.ts`, `tests/renderer.test.ts`, and any prompt entrypoint coverage needed
- `README.md`
- `CHANGELOG.md`

## Testing

Add or update tests for:
- TUI mode rendering with terminal size
- TUI mode rendering with unknown terminal size placeholders
- context usage rendering with missing values represented as `?`
- absence of `Pi package: ...` in bundled prompt output
- `Tool Usage Guidelines` rendering one subsection per active tool
- tool descriptions and tool-specific guidelines staying attached to the correct active tool

## Non-goals

- No redesign of custom-template behavior beyond exposing any small additional runtime/tool fields needed for the bundled template.
- No changes to partial inheritance behavior.
- No changes to command behavior unless tests expose a direct dependency.
