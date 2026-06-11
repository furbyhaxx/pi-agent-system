import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import { getDocsPath, getExamplesPath, getReadmePath } from "@earendil-works/pi-coding-agent";
import { COMMAND_PREFIX, DEFAULT_TEMPLATE_RELATIVE_PATH, USER_PARTIALS_DIR } from "./constants.ts";
import { buildTemplateContext } from "./context.ts";
import { buildDefaultPromptParts } from "./default-prompt.ts";
import { discoverAppendSources, getGitContext, getHostContext } from "./environment.ts";
import { getPartialRoots } from "./paths.ts";
import { createRenderer } from "./renderer.ts";
import type {
  SystemPromptEjectOptions,
  SystemPromptEjectTargets,
  TemplateModelContext,
  TemplateSessionContext,
  TemplateToolContext,
} from "./types.ts";

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

  const piPackage = await readPiPackageInfo();

  return {
    source:
      options.customPrompt ??
      (await readFile(join(paths.packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH), "utf8")),
    context: buildTemplateContext({
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
      appendSystemPrompt: options.appendSystemPrompt,
      agentDir: paths.agentDir,
      host: getHostContext(),
      git: getGitContext(cwd),
      appendSources: await discoverAppendSources({ cwd, agentDir: paths.agentDir }),
    }),
  };
}

function buildContextSnapshot(context: unknown): string {
  return JSON.stringify(context, null, 2);
}

/** Parse optional output-path arguments for dump-capable commands. */
export function parseDumpArgs(args: string): { path?: string } {
  const tokens = args.split(/\s+/).filter(Boolean);
  const positional: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--out" || token === "-o" || token === "--file") {
      const next = tokens[index + 1];
      if (next) {
        positional.push(next);
        index += 1;
      }
      continue;
    }
    if (token.startsWith("--out=")) {
      positional.push(token.slice("--out=".length));
      continue;
    }
    positional.push(token);
  }

  const path = positional[0];
  return path ? { path } : {};
}

async function dumpToFile(cwd: string, path: string, content: string): Promise<string> {
  const resolved = isAbsolute(path) ? path : resolve(cwd, path);
  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf8");
  return resolved;
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
    description: "Render the system prompt template; pass a path to save it to a file",
    handler: async (args, ctx) => {
      const rendered = await renderCurrentPrompt(pi, paths, ctx);
      const { path } = parseDumpArgs(args);

      if (path) {
        const saved = await dumpToFile(ctx.cwd, path, rendered);
        ctx.ui.notify(`Saved rendered system prompt (${rendered.length} characters) to ${saved}.`, "info");
        return;
      }

      if (ctx.hasUI) {
        await ctx.ui.editor("Rendered system prompt", rendered);
      } else {
        ctx.ui.notify(`Rendered system prompt (${rendered.length} characters).`, "info");
      }
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:vars`, {
    description: "Show a JSON snapshot of system prompt template variables; pass a path to save it",
    handler: async (args, ctx) => {
      const data = await buildCurrentTemplateData(pi, paths, ctx);
      const snapshot = buildContextSnapshot(data.context);
      const { path } = parseDumpArgs(args);

      if (path) {
        const saved = await dumpToFile(ctx.cwd, path, snapshot);
        ctx.ui.notify(`Saved system prompt variables (${snapshot.length} characters) to ${saved}.`, "info");
        return;
      }

      if (ctx.hasUI) {
        await ctx.ui.editor("System prompt variables", snapshot);
      } else {
        ctx.ui.notify(snapshot, "info");
      }
    },
  });

  pi.registerCommand(`${COMMAND_PREFIX}:doctor`, {
    description: "Validate active system prompt template and partials",
    handler: async (_args, ctx) => {
      const bundledTemplate = join(paths.packageRoot, DEFAULT_TEMPLATE_RELATIVE_PATH);
      const bundledPartials = join(paths.packageRoot, "templates", "partials");
      const hasCustomPrompt = ctx.getSystemPromptOptions().customPrompt !== undefined;
      const errors: string[] = [];

      if (!hasCustomPrompt && !(await pathExists(bundledTemplate))) errors.push(`Missing template: ${bundledTemplate}`);
      if (!(await pathExists(bundledPartials))) errors.push(`Missing partials: ${bundledPartials}`);

      try {
        const data = await buildCurrentTemplateData(pi, paths, ctx);
        const renderer = await createRenderer({
          partialRoots: getPartialRoots({ packageRoot: paths.packageRoot, agentDir: paths.agentDir, cwd: ctx.cwd }),
        });
        renderer.render(data.source, data.context);
      } catch (error) {
        errors.push(`Render failed: ${error instanceof Error ? error.message : String(error)}`);
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
