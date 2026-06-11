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
- Injects a serializable context with Pi metadata, runtime details (including git status and remotes), host machine details, model/session data, tools, skills, scope-split context files, default prompt parts, and appended system prompt sources.
- Exposes safe Handlebars helpers including `contains` (membership in arrays, strings, or objects), `xml`, `hasTool`, `default`, `json`, `join`, `eq`, `and`, `or`, `not`, `indent`, `trim`, `lower`, and `upper`.
- Surfaces appended system prompt content as an iterable `appendSystem.entries` list with per-source attribution, so each appended `APPEND_SYSTEM.md` file or inline source can be handled individually.
- Loads reusable partials from bundled, global, and project roots; later roots override earlier roots.
- Provides `/system-prompt:*` commands to preview, inspect, validate, eject, and reload prompt templates using the same runtime-context shaping as live prompt rendering.
- If template rendering fails, Pi is notified and the native system prompt is used for that turn.

## Commands

- `/system-prompt:preview [path]` — render the current system prompt template. With a `path` (or `--out <path>`/`-o <path>`) the rendered prompt is written to that file; otherwise it is shown in the editor when UI is available.
- `/system-prompt:vars [path]` — show a JSON snapshot of template variables. With a `path` (or `--out <path>`/`-o <path>`) the snapshot is written to that file. Non-env values are shown in full; `host.env` values are sanitized so host conditionals remain useful without dumping obvious credentials.
- `/system-prompt:doctor` — check bundled template/partial files and validate rendering of the active template source.
- `/system-prompt:eject [--project|--global] [--force]` — copy the bundled `SYSTEM.md`, partials, and an ejected-template README into project `.pi/` scope by default, or global agent scope with `--global`; refuse overwrites unless `--force` or confirmed interactively.
- `/system-prompt:reload` — run Pi's reload flow for extensions, skills, prompts, and themes.

## Template variables

Templates receive a plain JSON-safe object with these top-level keys:

- `pi` — Pi's own package metadata and documentation paths: `packageName` (for example `@earendil-works/pi-coding-agent`), `version`, and `docs`. This is Pi metadata, not this extension's package metadata.
- `runtime` — current `cwd`, `date`, optional `mode`, optional `thinkingLevel`, optional `terminal` dimensions, optional raw `contextUsage`, bundled-template-friendly `modeDisplay` and `contextUsageDisplay`, plus `isGit` and `git.remotes` (`{ name, url }` entries) for the working directory.
- `model` — active model metadata when available: `id`, `name`, `api`, `provider`, `reasoning`, `input` (modality list, e.g. `["text", "image"]`), `cost`, `contextWindow`, and `maxTokens`.
- `host` — host machine details when gathered: `uname`, `os`, `arch`, `hostname`, `cpu`, `memory`, `shell` (`{ name, version }`), `gpu` (array of all detected GPUs), `env` (sanitized environment-variable map), and `remote` (derived SSH/remote facts such as `connected`, `viaSsh`, `remoteAddress`, `hostAddress`, and `recommendedBindAddress`).
- `session` — current session metadata when available, including `id` and `name`.
- `tools` — active tool names, all tool details, normalized active tool details (with per-tool `promptGuidelines`), `byName` lookup, prompt `snippets`, and aggregated tool `guidelines`.
- `skills` — all loaded skills, model-visible skills as `visible`, and the backwards-compatible preformatted `xml` string. The bundled template builds the available-skills XML with a Handlebars loop over `skills.visible`.
- `contextFiles` — loaded context files split by scope: `all`, `user` (global agent scope), and `project` (workspace scope). Each entry has `path` and `content`.
- `defaultPrompt` — Pi's native prompt as `nativeFull` plus reusable `parts`: `identity`, `availableTools`, `guidelines`, `piDocs`, `projectContextXml`, `skillsXml`, and `runtimeFooter`.
- `appendSystemPrompt` — combined appended system prompt text supplied by Pi or other extensions, when present.
- `appendSystem` — iterable view of appended prompt sources: `present`, `text`, `count`, and `entries` (`{ source, kind, content }`, where `kind` is `"file"` or `"inline"`). Sources from project/global `APPEND_SYSTEM.md` files are attributed to their path; any unattributed remainder (CLI `--append-system-prompt`, extensions) is kept as a single inline entry.

Example:

```handlebars
{{> policy/identity}}

Current repo: {{runtime.cwd}}
Active tools: {{join tools.active ", "}}

{{#if (contains model.input "image")}}
You can read images directly with the read tool.
{{/if}}

{{#if appendSystem.present}}
{{#each appendSystem.entries}}
<append source="{{source}}">
{{{content}}}
</append>
{{/each}}
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

The template context is sanitized through a JSON round-trip so functions and prototype data are stripped before rendering. `host.env` includes environment-variable names and sanitized values for template conditionals; obvious credential-like keys/values are replaced with `[redacted N chars]`, while normal host/session variables such as `PATH`, `SHELL`, `SSH_CLIENT`, and `SSH_CONNECTION` remain usable.
