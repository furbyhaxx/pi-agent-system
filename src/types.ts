import type { ContextUsage, Skill, SourceInfo } from "@earendil-works/pi-coding-agent";

/** File content loaded into Pi's project context block. */
export interface ProjectContextFile {
  /** Absolute or project-relative file path shown in prompt context. */
  path: string;
  /** Raw instruction content from the context file. */
  content: string;
}

/** Reconstructed subsections of Pi's native system prompt. */
export interface DefaultPromptSectionParts {
  /** Agent identity and Pi harness awareness. */
  identity: string;
  /** Human-readable list of active tools and prompt snippets. */
  availableTools: string;
  /** Aggregated tool and response guidelines. */
  guidelines: string;
  /** Pi documentation paths and reading guidance. */
  piDocs: string;
  /** XML wrapper containing project instruction files. */
  projectContextXml: string;
  /** XML wrapper containing model-invokable skills. */
  skillsXml: string;
  /** Runtime date and current working directory footer. */
  runtimeFooter: string;
}

/** Pi's native prompt plus separately reusable default prompt sections. */
export interface DefaultPromptParts {
  /** Exact native prompt produced by Pi before template rendering. */
  nativeFull: string;
  /** Named default prompt sections available to templates. */
  parts: DefaultPromptSectionParts;
}

/** Input data needed to reconstruct Pi default prompt sections. */
export interface DefaultPromptPartInputs {
  /** Exact native prompt produced by Pi before template rendering. */
  nativeFull: string;
  /** Current working directory for the runtime footer. */
  cwd: string;
  /** Current date string used in the runtime footer. */
  date: string;
  /** Names of tools selected for this prompt. */
  selectedTools: readonly string[];
  /** Prompt snippets keyed by tool name. */
  toolSnippets: Record<string, string>;
  /** Additional prompt guidelines from active tools or extensions. */
  promptGuidelines: readonly string[];
  /** Project context files loaded for the prompt. */
  contextFiles: readonly ProjectContextFile[];
  /** Skills available to the current session. */
  skills: readonly Skill[];
}

/** Serializable model information exposed to system prompt templates. */
export interface TemplateModelContext {
  /** Provider-specific model identifier. */
  id?: string;
  /** Display name for the model. */
  name?: string;
  /** API family used by the model. */
  api?: string;
  /** Provider name for the model. */
  provider?: string;
  /** Reasoning configuration, when available. */
  reasoning?: unknown;
  /** Input capability metadata, when available. */
  input?: unknown;
  /** Cost metadata, when available. */
  cost?: unknown;
  /** Context window size, when available. */
  contextWindow?: number;
  /** Maximum output tokens, when available. */
  maxTokens?: number;
}

/** Serializable session metadata exposed to templates. */
export interface TemplateSessionContext {
  /** Stable session identifier. */
  id?: string;
  /** Human-readable session name. */
  name?: string;
  /** Additional serializable session fields. */
  [key: string]: unknown;
}

/** Serializable tool metadata exposed to templates. */
export interface TemplateToolContext {
  /** Tool name. */
  name: string;
  /** Tool description, when available. */
  description?: string;
  /** Tool parameter schema, when available. */
  parameters?: unknown;
  /** Tool-specific prompt guidelines. */
  promptGuidelines?: readonly string[];
  /** Source metadata for extension-provided tools. */
  sourceInfo?: SourceInfo;
}

/** Input data used to build the full Handlebars system prompt context. */
export interface BuildTemplateContextInput {
  /** Pi package version string. */
  piVersion: string;
  /** Pi documentation metadata exposed to templates. */
  piDocs: Record<string, string>;
  /** Current working directory. */
  cwd: string;
  /** Current date string. */
  date: string;
  /** Runtime mode name, when available. */
  mode?: string;
  /** Active thinking level, when available. */
  thinkingLevel?: string;
  /** Current context usage, when available. */
  contextUsage?: ContextUsage;
  /** Active model metadata, when available. */
  model?: TemplateModelContext;
  /** Current session metadata. */
  session?: TemplateSessionContext;
  /** All registered tool details. */
  allTools: readonly TemplateToolContext[];
  /** Active tool names. */
  activeTools: readonly string[];
  /** Tool prompt snippets keyed by tool name. */
  toolSnippets: Record<string, string>;
  /** Aggregated prompt guidelines. */
  promptGuidelines: readonly string[];
  /** Skills available to the current session. */
  skills: readonly Skill[];
  /** Project context files loaded for the prompt. */
  contextFiles: readonly ProjectContextFile[];
  /** Reconstructed native default prompt sections. */
  defaultPrompt: DefaultPromptParts;
  /** Additional system prompt text appended by Pi or extensions. */
  appendSystemPrompt?: string;
}

/** Full serializable Handlebars context provided to SYSTEM.md templates. */
export interface SystemPromptTemplateContext {
  /** Pi package metadata and docs locations. */
  pi: { packageName: string; version: string; docs: Record<string, string> };
  /** Runtime data such as cwd, date, mode, and context usage. */
  runtime: {
    cwd: string;
    date: string;
    mode?: string;
    thinkingLevel?: string;
    contextUsage?: ContextUsage;
  };
  /** Active model metadata, when available. */
  model?: TemplateModelContext;
  /** Current session metadata, when available. */
  session?: TemplateSessionContext;
  /** Tool lists, lookup tables, snippets, and guidelines. */
  tools: {
    active: readonly string[];
    all: readonly TemplateToolContext[];
    activeDetails: readonly Partial<TemplateToolContext>[];
    byName: Record<string, TemplateToolContext>;
    snippets: Record<string, string>;
    guidelines: readonly string[];
  };
  /** Skill lists and formatted XML. */
  skills: { all: readonly Skill[]; visible: readonly Skill[]; xml: string };
  /** Project context files loaded for the prompt. */
  contextFiles: readonly ProjectContextFile[];
  /** Reconstructed native default prompt sections. */
  defaultPrompt: DefaultPromptParts;
  /** Additional system prompt text appended by Pi or extensions. */
  appendSystemPrompt?: string;
}

/** Supported eject target scope for system prompt files. */
export type SystemPromptEjectScope = "project" | "global";

/** Parsed options for a `/system-prompt:eject` request. */
export interface SystemPromptEjectOptions {
  /** Destination scope for ejected files. */
  scope: SystemPromptEjectScope;
  /** Whether existing files may be overwritten. */
  force: boolean;
}

/** Files and directories targeted by a system prompt eject operation. */
export interface SystemPromptEjectTargets {
  /** Destination SYSTEM.md file path. */
  systemPrompt: string;
  /** Destination partials directory path. */
  partialsDir: string;
  /** Destination README file path for ejected templates. */
  readme: string;
}
