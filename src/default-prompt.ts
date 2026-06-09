import {
  formatSkillsForPrompt,
  getDocsPath,
  getExamplesPath,
  getReadmePath,
  type Skill,
} from "@earendil-works/pi-coding-agent";
import type { DefaultPromptPartInputs, DefaultPromptParts } from "./types.ts";

function buildAvailableTools(
  selectedTools: readonly string[],
  toolSnippets: Record<string, string>,
): string {
  const visible = selectedTools.filter((name) => Boolean(toolSnippets[name]));
  if (visible.length === 0) return "Available tools:\n(none)";

  return `Available tools:\n${visible.map((name) => `- ${name}: ${toolSnippets[name]}`).join("\n")}`;
}

function buildGuidelines(
  selectedTools: readonly string[],
  promptGuidelines: readonly string[],
): string {
  const guidelines = new Set<string>();
  const has = (name: string) => selectedTools.includes(name);

  if (has("bash") && !has("grep") && !has("find") && !has("ls")) {
    guidelines.add("Use bash for file operations like ls, rg, find");
  }

  for (const guideline of promptGuidelines) {
    const trimmed = guideline.trim();
    if (trimmed.length > 0) guidelines.add(trimmed);
  }

  guidelines.add("Be concise in your responses");
  guidelines.add("Show file paths clearly when working with files");

  return `Guidelines:\n${Array.from(guidelines)
    .map((guideline) => `- ${guideline}`)
    .join("\n")}`;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildProjectContextXml(
  contextFiles: DefaultPromptPartInputs["contextFiles"],
): string {
  if (contextFiles.length === 0) return "";

  const body = contextFiles
    .map(
      (file) =>
        `<project_instructions path="${escapeXmlAttribute(file.path)}">\n${file.content}\n</project_instructions>`,
    )
    .join("\n\n");

  return `<project_context>\n\nProject-specific instructions and guidelines:\n\n${body}\n\n</project_context>`;
}

function buildSkillsXml(selectedTools: readonly string[], skills: readonly Skill[]): string {
  if (!selectedTools.includes("read")) return "";
  return formatSkillsForPrompt([...skills]).trim();
}

/** Build Pi's default prompt sections as reusable template parts. */
export function buildDefaultPromptParts(
  input: DefaultPromptPartInputs,
): DefaultPromptParts {
  const identity =
    "You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.";
  const piDocs = `Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):\n- Main documentation: ${getReadmePath()}\n- Additional docs: ${getDocsPath()}\n- Examples: ${getExamplesPath()} (extensions, custom tools, SDK)`;
  const runtimeFooter = `Current date: ${input.date}\nCurrent working directory: ${input.cwd.replace(/\\/g, "/")}`;

  return {
    nativeFull: input.nativeFull,
    parts: {
      identity,
      availableTools: buildAvailableTools(input.selectedTools, input.toolSnippets),
      guidelines: buildGuidelines(input.selectedTools, input.promptGuidelines),
      piDocs,
      projectContextXml: buildProjectContextXml(input.contextFiles),
      skillsXml: buildSkillsXml(input.selectedTools, input.skills),
      runtimeFooter,
    },
  };
}
