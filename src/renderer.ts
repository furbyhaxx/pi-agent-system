import Handlebars from "handlebars";
import type { HelperOptions } from "handlebars";
import { discoverPartials } from "./partials.ts";

const KNOWN_HELPERS = {
  if: true,
  unless: true,
  each: true,
  with: true,
  default: true,
  json: true,
  join: true,
  eq: true,
  and: true,
  or: true,
  not: true,
  hasTool: true,
  indent: true,
  trim: true,
  lower: true,
  upper: true,
} as const;

const COMPILE_OPTIONS = {
  noEscape: true,
  strict: true,
  explicitPartialContext: false,
  knownHelpersOnly: true,
  knownHelpers: KNOWN_HELPERS,
  preventIndent: true,
} as const;

const RUNTIME_OPTIONS = {
  allowProtoMethodsByDefault: false,
  allowProtoPropertiesByDefault: false,
  allowCallsToHelperMissing: false,
} as const;

/** Options used to create a system prompt renderer. */
export interface RendererOptions {
  /** Partial roots in ascending precedence; later roots override earlier roots. */
  partialRoots: readonly string[];
}

/** Isolated Handlebars renderer for system prompt templates. */
export interface SystemPromptRenderer {
  /** Render a Handlebars system prompt template with the supplied context. */
  render(source: string, context: unknown): string;
}

function isHelperOptions(value: unknown): value is HelperOptions {
  return Boolean(value && typeof value === "object" && "lookupProperty" in value);
}

function stringify(value: unknown): string {
  return String(value ?? "");
}

function activeToolNames(tools: unknown): readonly string[] {
  if (Array.isArray(tools)) return tools.filter((tool): tool is string => typeof tool === "string");
  if (!tools || typeof tools !== "object" || !("active" in tools)) return [];

  const active = tools.active;
  return Array.isArray(active)
    ? active.filter((tool): tool is string => typeof tool === "string")
    : [];
}

/** Create an isolated Handlebars renderer for system prompt templates. */
export async function createRenderer(
  options: RendererOptions,
): Promise<SystemPromptRenderer> {
  const hbs = Handlebars.create();

  hbs.registerHelper("default", (value: unknown, fallback: unknown) =>
    value === undefined || value === null || value === "" ? fallback : value,
  );
  hbs.registerHelper("json", (value: unknown) => JSON.stringify(value, null, 2));
  hbs.registerHelper("join", (value: unknown, separator: unknown) => {
    const normalizedSeparator = isHelperOptions(separator) ? "\n" : stringify(separator);
    return Array.isArray(value) ? value.map(stringify).join(normalizedSeparator) : "";
  });
  hbs.registerHelper("eq", (left: unknown, right: unknown) => left === right);
  hbs.registerHelper("and", (...args: unknown[]) => args.slice(0, -1).every(Boolean));
  hbs.registerHelper("or", (...args: unknown[]) => args.slice(0, -1).some(Boolean));
  hbs.registerHelper("not", (value: unknown) => !value);
  hbs.registerHelper("hasTool", (tools: unknown, name: unknown) =>
    typeof name === "string" && activeToolNames(tools).includes(name),
  );
  hbs.registerHelper("indent", (value: unknown, spaces: unknown) => {
    const width = typeof spaces === "number" ? spaces : Number(spaces);
    const prefix = " ".repeat(Number.isFinite(width) && width > 0 ? width : 0);
    return stringify(value)
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
  });
  hbs.registerHelper("trim", (value: unknown) => stringify(value).trim());
  hbs.registerHelper("lower", (value: unknown) => stringify(value).toLowerCase());
  hbs.registerHelper("upper", (value: unknown) => stringify(value).toUpperCase());

  for (const partial of await discoverPartials(options.partialRoots)) {
    hbs.registerPartial(partial.name, partial.source);
  }

  return {
    render(source: string, context: unknown): string {
      return hbs.compile(source, COMPILE_OPTIONS)(context, RUNTIME_OPTIONS);
    },
  };
}
