import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { COMMAND_PREFIX, DEFAULT_TEMPLATE_RELATIVE_PATH, USER_PARTIALS_DIR } from "./constants.ts";
import { buildTemplateContext } from "./context.ts";
import { buildDefaultPromptParts } from "./default-prompt.ts";
import { getPartialRoots } from "./paths.ts";
import { createRenderer } from "./renderer.ts";
import type {
  SystemPromptEjectOptions,
  SystemPromptEjectTargets,
  TemplateModelContext,
  TemplateSessionContext,
  TemplateToolContext,
} from "./types.ts";

const SNAPSHOT_STRING_LIMIT = 500;
const SECRET_KEY_PATTERN = /(?:api|auth|password|secret|token|key|credential|header)/i;

/** Paths required by the system prompt command namespace. */
export interface SystemPromptCommandPaths {
  /** Installed package root containing bundled templates. */
  packageRoot: string;
  /** Pi global agent directory. */
  agentDir: string;
}

/** Parse `/system-prompt:eject` flags into eject options. */
export function parseEjectArgs(args: string): SystemPromptEjectOptions {
  const options: SystemPromptEjectOptions = { scope: "project", force: false };

  for (const arg of args.split(/\s+/).filter(Boolean)) {
    if (arg === "--project") options.scope = "project";
    if (arg === "--global") options.scope = "global";
    if (arg === "--force") options.force = true;
  }

  return options;
}

/** Build the file and directory targets for a system prompt eject operation. */
export function buildEjectTargets(input: {
  scope: SystemPromptEjectOptions["scope"];
  cwd: string;
  agentDir: string;
}): SystemPromptEjectTargets {
  const baseDir = input.scope === "global" ? input.agentDir : join(input.cwd, ".pi");

  return {
    systemPrompt: join(baseDir, "SYSTEM.md"),
    partialsDir: join(baseDir, USER_PARTIALS_DIR),
    readme: join(baseDir, "system-prompt", "README.md"),
  };
}

function currentDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toTemplateModelContext(ctx: ExtensionCommandContext): TemplateModelContext | undefined {
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

function toTemplateSessionContext(ctx: ExtensionCommandContext): TemplateSessionContext {
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

async function buildCurrentTemplateData(
  pi: ExtensionAPI,
  paths: SystemPromptCommandPaths,
  ctx: ExtensionCommandContext,
): Promise<{ source: string; context: unknown }> {
  const options = ctx.getSystemPromptOptions();
  const cwd = options.cwd ?? ctx.cwd;
  const date = currentDate();
  const selectedTools = options.selectedTools ?? pi.getActiveTools();
  const toolSnippets = options.toolSnippets ?? {};
  const promptGuidelines = options.promptGuidelines ?? [];
  const contextFiles = options.contextFiles ?? [];
  const skills = options.skills ?? [];
  const defaultPrompt = buildDefaultPromptParts({
    nativeFull: ctx.getSystemPrompt(),
    cwd,
    date,
    selectedTools,
    toolSnippets,
    promptGuidelines,
    contextFiles,
    skills,
  });

  return {
    source:
      options.customPrompt ??
      (await readFile(join(paths.packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH), "utf8")),
    context: buildTemplateContext({
      piVersion: await readPackageVersion(paths.packageRoot),
      piDocs: {
        readme: getReadmePath(),
        docs: getDocsPath(),
        examples: getExamplesPath(),
      },
      cwd,
      date,
      mode: ctx.mode,
      thinkingLevel: String(pi.getThinkingLevel()),
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
      appendSystemPrompt: options.appendSystemPrompt,
    }),
  };
}

function redactValue(value: unknown, key = ""): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return "[redacted]";
  if (typeof value === "string") {
    return value.length > SNAPSHOT_STRING_LIMIT ? `[redacted: ${value.length} characters]` : value;
  }
  if (Array.isArray(value)) {
    return value.length > 5
      ? `[redacted: array with ${value.length} entries]`
      : value.map((entry) => redactValue(entry));
  }
  if (!value || typeof value !== "object") return value;

  const redacted = Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey),
    ]),
  );
  const redactedLength = JSON.stringify(redacted).length;

  return key && redactedLength > SNAPSHOT_STRING_LIMIT
    ? `[redacted: object with ${redactedLength} characters]`
    : redacted;
}

function buildContextSnapshot(context: unknown): string {
  if (!context || typeof context !== "object") return JSON.stringify(context, null, 2);

  const entries = Object.entries(context).map(([key, value]) => {
    if (key === "contextFiles") return [key, "[redacted: context file contents]"];
    return [key, redactValue(value, key)];
  });

  return JSON.stringify(Object.fromEntries(entries), null, 2);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function confirmOverwrite(
  ctx: ExtensionCommandContext,
  options: SystemPromptEjectOptions,
  existingTargets: readonly string[],
): Promise<boolean> {
  if (options.force || existingTargets.length === 0) return true;
  if (!ctx.hasUI) return false;

  return ctx.ui.confirm(
    "Overwrite system prompt files?",
    `These targets already exist:\n${existingTargets.join("\n")}`,
  );
}

async function ejectSystemPrompt(
  paths: SystemPromptCommandPaths,
  ctx: ExtensionCommandContext,
  options: SystemPromptEjectOptions,
): Promise<SystemPromptEjectTargets | undefined> {
  const targets = buildEjectTargets({ scope: options.scope, cwd: ctx.cwd, agentDir: paths.agentDir });
  const existingTargets = (
    await Promise.all(
      [targets.systemPrompt, targets.partialsDir, targets.readme].map(async (target) =>
        (await pathExists(target)) ? target : undefined,
      ),
    )
  ).filter((target): target is string => Boolean(target));

  if (!(await confirmOverwrite(ctx, options, existingTargets))) return undefined;

  await mkdir(dirname(targets.systemPrompt), { recursive: true });
  await mkdir(dirname(targets.readme), { recursive: true });
  await cp(join(paths.packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH), targets.systemPrompt, {
    force: options.force || existingTargets.length > 0,
  });
  await cp(join(paths.packageRoot, "templates", "partials"), targets.partialsDir, {
    recursive: true,
    force: options.force || existingTargets.length > 0,
  });
  await writeFile(
    targets.readme,
    "# Ejected system prompt\n\nEdit `../SYSTEM.md` and the partials in `partials/` to customize pi-agent-system.\n",
    "utf8",
  );

  return targets;
}

async function renderCurrentPrompt(
  pi: ExtensionAPI,
  paths: SystemPromptCommandPaths,
  ctx: ExtensionCommandContext,
): Promise<string> {
  const data = await buildCurrentTemplateData(pi, paths, ctx);
  const renderer = await createRenderer({
    partialRoots: getPartialRoots({ packageRoot: paths.packageRoot, agentDir: paths.agentDir, cwd: ctx.cwd }),
  });

  return renderer.render(data.source, data.context);
}

/** Register `/system-prompt:*` commands for preview, vars, doctor, eject, and reload. */
export function registerSystemPromptCommands(pi: ExtensionAPI, paths: SystemPromptCommandPaths): void {
  pi.registerCommand(`${COMMAND_PREFIX}:preview`, {
    description: "Render and preview the current system prompt template",
    handler: async (_args, ctx) => {
      const rendered = await renderCurrentPrompt(pi, paths, ctx);
      if (ctx.hasUI) {
        await ctx.ui.editor("Rendered system prompt", rendered);
      } else {
        ctx.ui.notify(`Rendered system prompt (${rendered.length} characters).`, "info");
      }
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:vars`, {
    description: "Show a redacted JSON snapshot of system prompt template variables",
    handler: async (_args, ctx) => {
      const data = await buildCurrentTemplateData(pi, paths, ctx);
      const snapshot = buildContextSnapshot(data.context);
      if (ctx.hasUI) {
        await ctx.ui.editor("System prompt variables", snapshot);
      } else {
        ctx.ui.notify(snapshot, "info");
      }
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:doctor`, {
    description: "Validate bundled system prompt template and partials",
    handler: async (_args, ctx) => {
      const bundledTemplate = join(paths.packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH);
      const bundledPartials = join(paths.packageRoot, "templates", "partials");
      const errors: string[] = [];

      if (!(await pathExists(bundledTemplate))) errors.push(`Missing template: ${bundledTemplate}`);
      if (!(await pathExists(bundledPartials))) errors.push(`Missing partials: ${bundledPartials}`);

      if (errors.length === 0) {
        try {
          const data = await buildCurrentTemplateData(pi, paths, ctx);
          const renderer = await createRenderer({
            partialRoots: getPartialRoots({ packageRoot: paths.packageRoot, agentDir: paths.agentDir, cwd: ctx.cwd }),
          });
          renderer.render(await readFile(bundledTemplate, "utf8"), data.context);
        } catch (error) {
          errors.push(`Render failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      ctx.ui.notify(
        errors.length === 0
          ? "System prompt template doctor passed."
          : `System prompt template doctor found issues:\n${errors.join("\n")}`,
        errors.length === 0 ? "info" : "error",
      );
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:eject`, {
    description: "Copy bundled SYSTEM.md, partials, and README into project or global scope",
    handler: async (args, ctx) => {
      const options = parseEjectArgs(args);
      const targets = await ejectSystemPrompt(paths, ctx, options);

      if (!targets) {
        ctx.ui.notify("System prompt eject cancelled to avoid overwriting existing files.", "warning");
        return;
      }

      ctx.ui.notify(
        `Ejected system prompt files to ${options.scope} scope:\n${targets.systemPrompt}\n${targets.partialsDir}\n${targets.readme}`,
        "info",
      );
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:reload`, {
    description: "Reload extensions, skills, prompts, and themes",
    handler: async (_args, ctx) => {
      await ctx.reload();
      return;
    },
  });
}
