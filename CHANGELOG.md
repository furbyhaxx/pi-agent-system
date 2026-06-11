# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses semantic versioning.

## [0.2.0] - 2026-06-11

### Added
- `contains` Handlebars helper for membership checks across arrays, strings, and object keys/values.
- `xml` Handlebars helper for safe XML text nodes in templates rendered with global escaping disabled.
- Runtime git context: `runtime.isGit` and `runtime.git.remotes` (`{ name, url }`) for the working directory.
- Host machine context (`host`): `uname`, `os`, `arch`, `hostname`, `cpu`, `memory`, `shell` (`name`/`version`), `gpu` (all detected GPUs), sanitized `env`, and derived SSH/remote connection facts, gathered once per process.
- Scope-split context files: `contextFiles.all`, `contextFiles.user` (global agent scope), and `contextFiles.project` (workspace scope).
- Iterable appended system prompt view (`appendSystem`) with `present`, `text`, `count`, and `entries` (`{ source, kind, content }`), attributing project/global `APPEND_SYSTEM.md` files to their path and keeping CLI/extension remainder as an inline entry.
- New bundled partial `nukii/89-append-system-prompt` plus the bundled `nukii/**` partial set used by the default `SYSTEM.md`.
- `/system-prompt:preview [path]` and `/system-prompt:vars [path]` can save their output to a file via a positional path or `--out`/`-o`/`--file`.

### Changed
- `/system-prompt:vars` no longer redacts non-env template values; `host.env` values are sanitized independently so normal host conditionals remain useful while obvious credential values are replaced.
- `pi.packageName` and `pi.version` now describe Pi's own package (`@earendil-works/pi-coding-agent`) instead of this extension package.
- `contextFiles` template variable is now an object (`{ all, user, project }`) instead of a flat array; the bundled `pi/project-context` partial iterates `contextFiles.all`.
- `host.gpu` is now an array of all detected GPUs instead of a single optional string.
- The bundled default `SYSTEM.md` now renders appended system prompts per-source with attribution instead of dumping a single combined string.
- The bundled available-skills section now builds XML with a Handlebars loop over `skills.visible` instead of dumping the preformatted `skills.xml` string.
- The bundled runtime/env section now shows whether the user is connected remotely and includes a bind-address hint for SSH sessions.

## [0.1.0] - 2026-06-09

### Added
- Initial Pi package scaffold with TypeScript, npm metadata, package manifest, tests, MIT license, and package conventions.
- Reconstructed Pi default prompt parts for templates, including native prompt text, tool listings, guidelines, Pi docs, project context XML, skills XML, and runtime footer.
- Isolated Handlebars renderer with Markdown-safe output, safe helpers, strict rendering, and inherited-context partials.
- Recursive partial discovery for bundled, global, and project partial roots with project overrides.
- JSON-safe template context builder for Pi metadata, runtime, model, session, tools, skills, context files, default prompt parts, and appended system prompt text.
- Ejectable bundled `templates/default.SYSTEM.md` and policy, Pi-context, and runtime partials.
- Extension entrypoint using Pi's `before_agent_start` hook to render loaded `SYSTEM.md` templates or the bundled default template.
- Namespaced `/system-prompt:*` commands for previewing, inspecting variables, doctor checks, ejecting templates/partials, and reloading Pi resources.
- Eject helpers for project and global scopes, including overwrite protection and `--force` support.

### Fixed
- Falls back to Pi's native system prompt and notifies the user when template rendering fails.
- Preserves Pi's native appended prompt, project context, skills, and runtime footer sections when rendering custom `SYSTEM.md` templates.
- Validates the active custom template source in `/system-prompt:doctor` instead of always rendering the bundled default template.
- Shows TUI terminal size in the bundled runtime section and uses `?` placeholders instead of blank context-usage values.
- Removes the bundled `Pi package: ...` line from the default runtime section.
- Replaces the disconnected bundled tool list and guideline list with per-tool `Tool Usage Guidelines` subsections for active tools.
- Aligns `/system-prompt:preview`, `/system-prompt:vars`, and `/system-prompt:doctor` with live prompt rendering for TUI terminal-size context.
