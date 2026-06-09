# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses semantic versioning.

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
