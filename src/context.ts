import type {
  ActiveToolTemplateContext,
  AppendSource,
  AppendSystemContext,
  AppendSystemEntry,
  BuildTemplateContextInput,
  ContextFilesContext,
  ProjectContextFile,
  SystemPromptTemplateContext,
} from "./types.ts";

/** Convert rich runtime values into plain JSON-safe template data. */
export function sanitizeForTemplate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function displayValue(value: number | string | null | undefined): string {
  return value === undefined || value === null || value === "" ? "?" : String(value);
}

function buildModeDisplay(input: BuildTemplateContextInput): string | undefined {
  if (!input.mode) return undefined;
  if (input.mode !== "tui") return input.mode;

  return `tui (${displayValue(input.terminal?.width)}x${displayValue(input.terminal?.height)})`;
}

function buildContextUsageDisplay(input: BuildTemplateContextInput): {
  tokens: string;
  contextWindow: string;
  percent: string;
} {
  return {
    tokens: displayValue(input.contextUsage?.tokens),
    contextWindow: displayValue(input.contextUsage?.contextWindow ?? input.model?.contextWindow),
    percent: displayValue(input.contextUsage?.percent),
  };
}

function isUnderRoot(path: string, root: string): boolean {
  if (!root) return false;
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`) || path.startsWith(`${normalizedRoot}\\`);
}

/** Split loaded context files into user (global) and project (workspace) scopes. */
export function classifyContextFiles(
  files: readonly ProjectContextFile[],
  agentDir?: string,
): ContextFilesContext {
  const all = files.map((file) => ({ path: file.path, content: file.content }));
  const user = agentDir ? all.filter((file) => isUnderRoot(file.path, agentDir)) : [];
  const userPaths = new Set(user.map((file) => file.path));
  const project = all.filter((file) => !userPaths.has(file.path));
  return { all, user, project };
}

/**
 * Attribute combined appended prompt text to its discovered source files,
 * keeping any unattributed remainder as a single inline entry.
 */
export function buildAppendSystemEntries(
  combined: string | undefined,
  sources: readonly AppendSource[],
): AppendSystemEntry[] {
  const text = (combined ?? "").trim();
  if (text.length === 0) return [];

  const entries: AppendSystemEntry[] = [];
  let remaining = combined ?? "";

  for (const source of sources) {
    const content = source.content.trim();
    if (content.length > 0 && remaining.includes(content)) {
      entries.push({ source: source.source, kind: "file", content: source.content.trimEnd() });
      remaining = remaining.replace(content, "").trim();
    }
  }

  if (remaining.trim().length > 0) {
    entries.push({
      source: "inline (--append-system-prompt or extension)",
      kind: "inline",
      content: remaining.trim(),
    });
  }

  return entries;
}

function buildAppendSystem(
  combined: string | undefined,
  sources: readonly AppendSource[],
): AppendSystemContext {
  const entries = buildAppendSystemEntries(combined, sources);
  const text = combined ?? "";
  return {
    present: entries.length > 0,
    text,
    count: entries.length,
    entries,
  };
}

/** Build the full Handlebars context used by SYSTEM.md templates. */
export function buildTemplateContext(
  input: BuildTemplateContextInput,
): SystemPromptTemplateContext {
  const model = input.model;
  const git = input.git ?? { isGit: false, remotes: [] };
  const allTools = input.allTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptGuidelines: tool.promptGuidelines ?? [],
    sourceInfo: tool.sourceInfo,
  }));
  const activeTools: ActiveToolTemplateContext[] = input.activeTools.map((name) => {
    const tool = allTools.find((entry) => entry.name === name);
    return {
      name,
      description: tool?.description,
      promptGuidelines: tool?.promptGuidelines ?? [],
    };
  });
  const context = {
    pi: { packageName: input.piPackageName, version: input.piVersion, docs: input.piDocs },
    runtime: {
      cwd: input.cwd,
      date: input.date,
      mode: input.mode,
      modeDisplay: buildModeDisplay(input),
      thinkingLevel: input.thinkingLevel,
      terminal: input.terminal,
      contextUsage: input.contextUsage,
      contextUsageDisplay: buildContextUsageDisplay(input),
      isGit: git.isGit,
      git: { remotes: git.remotes },
    },
    model: model
      ? {
          id: model.id,
          name: model.name,
          api: model.api,
          provider: model.provider,
          reasoning: model.reasoning,
          input: model.input,
          cost: model.cost,
          contextWindow: model.contextWindow,
          maxTokens: model.maxTokens,
        }
      : undefined,
    host: input.host,
    session: input.session,
    tools: {
      active: input.activeTools,
      all: allTools,
      activeDetails: activeTools,
      byName: Object.fromEntries(allTools.map((tool) => [tool.name, tool])),
      snippets: input.toolSnippets,
      guidelines: input.promptGuidelines,
    },
    skills: {
      all: input.skills,
      visible: input.skills.filter((skill) => !skill.disableModelInvocation),
      xml: input.defaultPrompt.parts.skillsXml,
    },
    contextFiles: classifyContextFiles(input.contextFiles, input.agentDir),
    defaultPrompt: input.defaultPrompt,
    appendSystemPrompt: input.appendSystemPrompt,
    appendSystem: buildAppendSystem(input.appendSystemPrompt, input.appendSources ?? []),
  };

  return sanitizeForTemplate(context);
}
