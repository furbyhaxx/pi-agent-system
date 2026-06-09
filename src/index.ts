import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { registerSystemPromptCommands } from "./commands.ts";
import { DEFAULT_TEMPLATE_RELATIVE_PATH } from "./constants.ts";
import { buildTemplateContext } from "./context.ts";
import { buildDefaultPromptParts } from "./default-prompt.ts";
import { getAgentDir, getPackageRoot, getPartialRoots } from "./paths.ts";
import { createRenderer } from "./renderer.ts";
import type {
  SystemPromptTemplateContext,
  TemplateModelContext,
  TemplateSessionContext,
  TemplateToolContext,
} from "./types.ts";

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toTemplateModelContext(ctx: ExtensionContext): TemplateModelContext | undefined {
  const model = ctx.model;
  if (!model) return undefined;

  return {
    id: model.id,
    name: model.name,
    api: model.api,
    provider: model.provider,
    reasoning: model.reasoning,
    input: model.input,
    cost: model.cost,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
  };
}

function toTemplateSessionContext(ctx: ExtensionContext): TemplateSessionContext {
  return {
    id: ctx.sessionManager.getSessionId(),
    name: ctx.sessionManager.getSessionName(),
  };
}

function toTemplateToolContext(tool: ToolInfo): TemplateToolContext {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    promptGuidelines: tool.promptGuidelines,
    sourceInfo: tool.sourceInfo,
  };
}

async function readPackageVersion(packageRoot: string): Promise<string> {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
    version?: unknown;
  };
  return typeof packageJson.version === "string" ? packageJson.version : "0.0.0";
}

function templateReferences(source: string, markers: readonly string[]): boolean {
  return markers.some((marker) => source.includes(marker));
}

function getTerminalContext(mode: string): { width?: number; height?: number } | undefined {
  if (mode !== "tui") return undefined;
  return {
    width: process.stdout.columns,
    height: process.stdout.rows,
  };
}

function renderCustomPromptWithNativeAppends(
  source: string,
  rendered: string,
  context: SystemPromptTemplateContext,
): string {
  const parts = context.defaultPrompt.parts;
  let prompt = rendered;

  if (
    context.appendSystemPrompt &&
    !templateReferences(source, ["appendSystemPrompt", "defaultPrompt.nativeFull"])
  ) {
    prompt += `\n\n${context.appendSystemPrompt}`;
  }

  if (
    parts.projectContextXml &&
    !templateReferences(source, [
      "contextFiles",
      "defaultPrompt.nativeFull",
      "defaultPrompt.parts.projectContextXml",
      "projectContextXml",
      "pi/project-context",
    ])
  ) {
    prompt += `\n\n${parts.projectContextXml}`;
  }

  if (
    parts.skillsXml &&
    !templateReferences(source, [
      "defaultPrompt.nativeFull",
      "defaultPrompt.parts.skillsXml",
      "skills.xml",
      "skills.all",
      "skills.visible",
      "pi/available-skills",
    ])
  ) {
    prompt += `\n\n${parts.skillsXml}`;
  }

  if (
    !templateReferences(source, [
      "defaultPrompt.nativeFull",
      "defaultPrompt.parts.runtimeFooter",
      "runtime.date",
      "runtime.cwd",
      "runtime/context",
    ])
  ) {
    prompt += `\n${parts.runtimeFooter}`;
  }

  return prompt;
}

/** Register the system prompt template renderer extension. */
export default function piAgentSystem(pi: ExtensionAPI): void {
  const packageRoot = getPackageRoot(import.meta.url);
  const agentDir = getAgentDir();

  registerSystemPromptCommands(pi, { packageRoot, agentDir });

  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const cwd = event.systemPromptOptions.cwd;
      const date = currentDate();
      const selectedTools = event.systemPromptOptions.selectedTools ?? pi.getActiveTools();
      const toolSnippets = event.systemPromptOptions.toolSnippets ?? {};
      const promptGuidelines = event.systemPromptOptions.promptGuidelines ?? [];
      const contextFiles = event.systemPromptOptions.contextFiles ?? [];
      const skills = event.systemPromptOptions.skills ?? [];
      const defaultPrompt = buildDefaultPromptParts({
        nativeFull: event.systemPrompt,
        cwd,
        date,
        selectedTools,
        toolSnippets,
        promptGuidelines,
        contextFiles,
        skills,
      });
      const context = buildTemplateContext({
        piVersion: await readPackageVersion(packageRoot),
        piDocs: {
          readme: getReadmePath(),
          docs: getDocsPath(),
          examples: getExamplesPath(),
        },
        cwd,
        date,
        mode: ctx.mode,
        thinkingLevel: String(pi.getThinkingLevel()),
        terminal: getTerminalContext(ctx.mode),
        contextUsage: ctx.getContextUsage(),
        model: toTemplateModelContext(ctx),
        session: toTemplateSessionContext(ctx),
        allTools: pi.getAllTools().map(toTemplateToolContext),
        activeTools: selectedTools,
        toolSnippets,
        promptGuidelines,
        skills,
        contextFiles,
        defaultPrompt,
        appendSystemPrompt: event.systemPromptOptions.appendSystemPrompt,
      });
      const templateSource =
        event.systemPromptOptions.customPrompt ??
        (await readFile(join(packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH), "utf8"));
      const renderer = await createRenderer({
        partialRoots: getPartialRoots({ packageRoot, agentDir, cwd }),
      });
      const rendered = renderer.render(templateSource, context);

      return {
        systemPrompt:
          event.systemPromptOptions.customPrompt === undefined
            ? rendered
            : renderCustomPromptWithNativeAppends(templateSource, rendered, context),
      };
    } catch {
      if (ctx.ui) {
        ctx.ui.notify(
          "System prompt template render failed; falling back to Pi default prompt.",
        );
      }
      return { systemPrompt: event.systemPrompt };
    }
  });
}
