# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses semantic versioning.

## [0.1.0] - 2026-06-09

### Added
- Initial `pi-agent-system` package plan.
- System prompt template rendering through Pi's `before_agent_start` hook.
- Path helpers for global agent directory, package root, and partial precedence.

### Changed
- Guarded optional runtime template fields for live sessions without model, context usage, or session details.
