import { PACKAGE_NAME } from "./constants.ts";
import type {
  BuildTemplateContextInput,
  SystemPromptTemplateContext,
} from "./types.ts";

/** Convert rich runtime values into plain JSON-safe template data. */
export function sanitizeForTemplate<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
  const activeTools = input.activeTools.map(
    (name) => allTools.find((tool) => tool.name === name) ?? { name },
  );
  const context = {
    pi: { packageName: PACKAGE_NAME, version: input.piVersion, docs: input.piDocs },
    runtime: {
      cwd: input.cwd,
      date: input.date,
      mode: input.mode,
      thinkingLevel: input.thinkingLevel,
      contextUsage: input.contextUsage,
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
