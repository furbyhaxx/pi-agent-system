import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildTemplateContext, sanitizeForTemplate } from "../src/context.ts";
import type { BuildTemplateContextInput } from "../src/types.ts";

void describe("buildTemplateContext", () => {
  void it("exposes safe runtime, model, session, tool, skill, context, and default prompt data", () => {
    const input: BuildTemplateContextInput = {
      piVersion: "0.79.0",
      piDocs: { readme: "/pi/README.md", docs: "/pi/docs", examples: "/pi/examples" },
      cwd: "/repo",
      date: "2026-06-09",
      mode: "default",
      thinkingLevel: "medium",
      contextUsage: { tokens: 1234, contextWindow: 8000, percent: 0.15425 },
      model: {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        api: "anthropic.messages",
        provider: "anthropic",
        reasoning: { effort: "medium" },
        input: { vision: true },
        cost: { input: 3, output: 15 },
        contextWindow: 200000,
        maxTokens: 8192,
      },
      session: { id: "session-123", name: "Implement context" },
      allTools: [
        {
          name: "read",
          description: "Read files",
          parameters: { type: "object" },
          promptGuidelines: ["Use read for file contents."],
          sourceInfo: {
            path: "builtin/read",
            source: "builtin",
            scope: "temporary",
            origin: "top-level",
          },
        },
        { name: "bash", description: "Run shell commands" },
        { name: "write", description: "Write files" },
      ],
      activeTools: ["read", "bash", "missing-active"],
      toolSnippets: { read: "Read files", bash: "Run commands" },
      promptGuidelines: ["Prefer rg over grep."],
      skills: [
        {
          name: "visible-skill",
          description: "Visible skill",
          filePath: "/skills/visible/SKILL.md",
          baseDir: "/skills/visible",
          sourceInfo: {
            path: "/skills/visible/SKILL.md",
            source: "test",
            scope: "temporary",
            origin: "top-level",
          },
          disableModelInvocation: false,
        },
        {
          name: "hidden-skill",
          description: "Hidden skill",
          filePath: "/skills/hidden/SKILL.md",
          baseDir: "/skills/hidden",
          sourceInfo: {
            path: "/skills/hidden/SKILL.md",
            source: "test",
            scope: "temporary",
            origin: "top-level",
          },
          disableModelInvocation: true,
        },
      ],
      contextFiles: [{ path: "/repo/AGENTS.md", content: "Project instructions" }],
      defaultPrompt: {
        nativeFull: "native prompt",
        parts: {
          identity: "identity",
          availableTools: "tools",
          guidelines: "guidelines",
          piDocs: "pi docs",
          projectContextXml: "<project_context />",
          skillsXml: "<available_skills>visible-skill</available_skills>",
          runtimeFooter: "Current date: 2026-06-09\nCurrent working directory: /repo",
        },
      },
      appendSystemPrompt: "Append this system prompt.",
    };

    const context = buildTemplateContext(input);

    assert.equal(context.pi.packageName, "@furbyhaxx/pi-agent-system");
    assert.equal(context.pi.version, "0.79.0");
    assert.deepEqual(context.pi.docs, input.piDocs);
    assert.equal(context.runtime.cwd, "/repo");
    assert.equal(context.runtime.date, "2026-06-09");
    assert.equal(context.runtime.contextUsage?.tokens, 1234);
    assert.equal(context.model?.provider, "anthropic");
    assert.equal(context.model?.maxTokens, 8192);
    assert.equal(context.session?.id, "session-123");
    assert.equal(context.session?.name, "Implement context");
    assert.deepEqual(context.tools.active, ["read", "bash", "missing-active"]);
    assert.deepEqual(
      context.tools.all.map((tool) => tool.name),
      ["read", "bash", "write"],
    );
    assert.equal(context.tools.activeDetails[0]?.description, "Read files");
    assert.deepEqual(context.tools.activeDetails[2], {
      name: "missing-active",
      promptGuidelines: [],
    });
    assert.equal(context.tools.byName.read.description, "Read files");
    assert.deepEqual(context.tools.snippets, input.toolSnippets);
    assert.deepEqual(context.tools.guidelines, ["Prefer rg over grep."]);
    assert.deepEqual(
      context.skills.all.map((skill) => skill.name),
      ["visible-skill", "hidden-skill"],
    );
    assert.deepEqual(
      context.skills.visible.map((skill) => skill.name),
      ["visible-skill"],
    );
    assert.equal(context.skills.xml, "<available_skills>visible-skill</available_skills>");
    assert.deepEqual(context.contextFiles, [
      { path: "/repo/AGENTS.md", content: "Project instructions" },
    ]);
    assert.deepEqual(context.defaultPrompt, input.defaultPrompt);
    assert.equal(context.appendSystemPrompt, "Append this system prompt.");
  });

  void it("normalizes runtime display values and active tool guideline defaults", () => {
    const input = {
      piVersion: "0.79.0",
      piDocs: { readme: "/pi/README.md", docs: "/pi/docs", examples: "/pi/examples" },
      cwd: "/repo",
      date: "2026-06-09",
      mode: "tui",
      thinkingLevel: "high",
      contextUsage: { tokens: null, contextWindow: 500000, percent: null },
      model: {
        id: "gpt-5.4",
        provider: "openai-codex",
        contextWindow: 500000,
      },
      session: { id: "session-456", name: "Display context" },
      allTools: [
        {
          name: "read",
          description: "Read files",
          promptGuidelines: ["Use read for file contents."],
        },
      ],
      activeTools: ["read", "write"],
      toolSnippets: {},
      promptGuidelines: [],
      skills: [],
      contextFiles: [],
      defaultPrompt: {
        nativeFull: "native prompt",
        parts: {
          identity: "identity",
          availableTools: "tools",
          guidelines: "guidelines",
          piDocs: "pi docs",
          projectContextXml: "",
          skillsXml: "",
          runtimeFooter: "Current date: 2026-06-09\nCurrent working directory: /repo",
        },
      },
      terminal: { width: 120, height: 40 },
    } as unknown as BuildTemplateContextInput;

    const context = buildTemplateContext(input);
    const runtime = context.runtime as typeof context.runtime & {
      terminal?: { width?: number; height?: number };
      modeDisplay?: string;
      contextUsageDisplay?: { tokens: string; contextWindow: string; percent: string };
    };

    assert.equal(runtime.terminal?.width, 120);
    assert.equal(runtime.terminal?.height, 40);
    assert.equal(runtime.modeDisplay, "tui (120x40)");
    assert.deepEqual(runtime.contextUsageDisplay, {
      tokens: "?",
      contextWindow: "500000",
      percent: "?",
    });
    assert.deepEqual(context.tools.activeDetails[0]?.promptGuidelines, ["Use read for file contents."]);
    assert.deepEqual(context.tools.activeDetails[1], {
      name: "write",
      promptGuidelines: [],
    });
  });
});

void describe("sanitizeForTemplate", () => {
  void it("strips functions, symbols, undefined values, and prototype data via JSON conversion", () => {
    class SecretBox {
      public safe = "visible";
      public fn = () => "hidden";

      public get secret(): string {
        return "prototype-secret";
      }
    }

    const value = Object.assign(new SecretBox(), {
      nested: { keep: true, drop: undefined, method: () => "hidden" },
      list: [1, undefined, () => "hidden", Symbol("hidden")],
    });

    const sanitized = sanitizeForTemplate(value) as unknown as {
      safe: string;
      fn?: unknown;
      secret?: unknown;
      nested: { keep: boolean; drop?: unknown; method?: unknown };
      list: Array<unknown>;
    };

    assert.deepEqual(sanitized, {
      safe: "visible",
      nested: { keep: true },
      list: [1, null, null, null],
    });
    assert.equal(Object.getPrototypeOf(sanitized), Object.prototype);
    assert.equal("secret" in sanitized, false);
    assert.equal("fn" in sanitized, false);
  });
});
