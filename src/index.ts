import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { registerSystemPromptCommands } from "./commands.ts";
import { DEFAULT_TEMPLATE_RELATIVE_PATH } from "./constants.ts";
import { buildTemplateContext } from "./context.ts";
import { buildDefaultPromptParts } from "./default-prompt.ts";
import { discoverAppendSources, getGitContext, getHostContext } from "./environment.ts";
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

async function readPiPackageInfo(): Promise<{ packageName: string; version: string }> {
  try {
    const packageJson = JSON.parse(await readFile(join(dirname(getReadmePath()), "package.json"), "utf8")) as {
      name?: unknown;
      version?: unknown;
    };
    return {
      packageName: typeof packageJson.name === "string" ? packageJson.name : "@earendil-works/pi-coding-agent",
      version: typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
    };
  } catch {
    return { packageName: "@earendil-works/pi-coding-agent", version: "0.0.0" };
  }
}

function templateReferences(source: string, markers: readonly string[]): boolean {
  return markers.some((marker) => source.includes(marker));
}

function resolveTerminalDimension(
  liveValue: number | undefined,
  envValue: string | undefined,
): number | undefined {
  if (typeof liveValue === "number" && liveValue > 0) return liveValue;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getTerminalContext(mode: string): { width?: number; height?: number } | undefined {
  if (mode !== "tui") return undefined;
  return {
    width: resolveTerminalDimension(process.stdout.columns, process.env.COLUMNS),
    height: resolveTerminalDimension(process.stdout.rows, process.env.LINES),
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
    !templateReferences(source, [
      "appendSystemPrompt",
      "appendSystem",
      "defaultPrompt.nativeFull",
      "nukii/89-append-system-prompt",
    ])
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
      "nukii/90-context-files",
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
      "nukii/",
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
      "nukii/99-env-runtime-self",
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
      const piPackage = await readPiPackageInfo();
      const context = buildTemplateContext({
        piPackageName: piPackage.packageName,
        piVersion: piPackage.version,
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
        agentDir,
        host: getHostContext(),
        git: getGitContext(cwd),
        appendSources: await discoverAppendSources({ cwd, agentDir }),
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
