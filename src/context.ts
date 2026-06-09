import { PACKAGE_NAME } from "./constants.ts";
import type {
  ActiveToolTemplateContext,
  BuildTemplateContextInput,
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

/** Build the full Handlebars context used by SYSTEM.md templates. */
export function buildTemplateContext(
  input: BuildTemplateContextInput,
): SystemPromptTemplateContext {
  const model = input.model;
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
    pi: { packageName: PACKAGE_NAME, version: input.piVersion, docs: input.piDocs },
    runtime: {
      cwd: input.cwd,
      date: input.date,
      mode: input.mode,
      modeDisplay: buildModeDisplay(input),
      thinkingLevel: input.thinkingLevel,
      terminal: input.terminal,
      contextUsage: input.contextUsage,
      contextUsageDisplay: buildContextUsageDisplay(input),
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
    contextFiles: input.contextFiles,
    defaultPrompt: input.defaultPrompt,
    appendSystemPrompt: input.appendSystemPrompt,
  };

  return sanitizeForTemplate(context);
}
