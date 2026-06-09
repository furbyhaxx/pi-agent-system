# pi-agent-system

`pi-agent-system` renders Pi `SYSTEM.md` files as Handlebars templates and provides an ejectable default system prompt with partials.

## Install

```bash
pi install git:github.com/furbyhaxx/pi-agent-system
```

## What it does

- Treats the loaded `SYSTEM.md` as a Handlebars template before each agent turn while preserving Pi's native appended sections for custom prompts.
- Uses the bundled `templates/default.SYSTEM.md` when no custom `SYSTEM.md` is loaded.
- The bundled runtime section shows TUI terminal size when available and uses `?` placeholders instead of blank context-usage fields.
- The bundled tool section renders `Tool Usage Guidelines` with one subsection per active tool and that tool's own prompt guidelines.
- Injects a serializable context with Pi metadata, runtime details, model/session data, tools, skills, context files, default prompt parts, and appended system prompt text.
- Loads reusable partials from bundled, global, and project roots; later roots override earlier roots.
- Provides `/system-prompt:*` commands to preview, inspect, validate, eject, and reload prompt templates.
- If template rendering fails, Pi is notified and the native system prompt is used for that turn.

## Commands

- `/system-prompt:preview` — render the current system prompt template and show it in the editor when UI is available.
- `/system-prompt:vars` — show a redacted JSON snapshot of template variables.
- `/system-prompt:doctor` — check bundled template/partial files and validate rendering of the active template source.
- `/system-prompt:eject [--project|--global] [--force]` — copy the bundled `SYSTEM.md`, partials, and an ejected-template README into project `.pi/` scope by default, or global agent scope with `--global`; refuse overwrites unless `--force` or confirmed interactively.
- `/system-prompt:reload` — run Pi's reload flow for extensions, skills, prompts, and themes.

## Template variables

Templates receive a plain JSON-safe object with these top-level keys:

- `pi` — package metadata and Pi documentation paths: `packageName`, `version`, and `docs`.
- `runtime` — current `cwd`, `date`, optional `mode`, optional `thinkingLevel`, optional `terminal` dimensions, optional raw `contextUsage`, plus bundled-template-friendly `modeDisplay` and `contextUsageDisplay` values.
- `model` — active model metadata when available: `id`, `name`, `api`, `provider`, `reasoning`, `input`, `cost`, `contextWindow`, and `maxTokens`.
- `session` — current session metadata when available, including `id` and `name`.
- `tools` — active tool names, all tool details, normalized active tool details (with per-tool `promptGuidelines`), `byName` lookup, prompt `snippets`, and aggregated tool `guidelines`.
- `skills` — all loaded skills, model-visible skills, and formatted skills XML.
- `contextFiles` — loaded project context files with `path` and `content`.
- `defaultPrompt` — Pi's native prompt as `nativeFull` plus reusable `parts`: `identity`, `availableTools`, `guidelines`, `piDocs`, `projectContextXml`, `skillsXml`, and `runtimeFooter`.
- `appendSystemPrompt` — additional system prompt text supplied by Pi or other extensions, when present.

Example:

```handlebars
{{> policy/identity}}

Current repo: {{runtime.cwd}}
Active tools: {{join tools.active ", "}}

{{#if appendSystemPrompt}}
{{{appendSystemPrompt}}}
{{/if}}
```

## Partials

Partials are discovered recursively from these roots, in ascending precedence:

1. Bundled: `templates/partials/`
2. Global: `${PI_CODING_AGENT_DIR:-~/.pi/agent}/system-prompt/partials/`
3. Project: `.pi/system-prompt/partials/`

Partial names are root-relative paths without file extensions, using `/` separators; for example `policy/identity.md` is used as `{{> policy/identity}}`. Supported partial file extensions are `.md`, `.hbs`, `.handlebars`, `.prompt`, and `.partial`.

Partials intentionally inherit the full template context. This means `{{> policy/model}}` can read values such as `model.provider`, `runtime.cwd`, or `tools.active` without passing an explicit partial context.

Use `/system-prompt:eject` to copy the bundled `templates/default.SYSTEM.md` and `templates/partials/` into editable project or global locations.

## Security

Templates and partials are trusted prompt code loaded from trusted package, global agent, or project locations. Review templates before installing or ejecting them into a shared project.

The template context is sanitized through a JSON round-trip so functions and prototype data are stripped before rendering. Secrets, API keys, auth headers, and environment variables are never exposed in the template context.
