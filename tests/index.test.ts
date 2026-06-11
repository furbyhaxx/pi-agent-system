import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piAgentSystem from "../src/index.ts";

type BeforeAgentStartHandler = (
  event: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Promise<BeforeAgentStartEventResult | void> | BeforeAgentStartEventResult | void;

type CommandHandler = (args: string, ctx: Record<string, unknown>) => Promise<void> | void;

type RegisteredCommand = {
  description: string;
  handler: CommandHandler;
};

void describe("piAgentSystem", () => {
  void it("preserves native append sections when rendering a custom prompt", async () => {
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
    const pi = {
      on(event: string, handler: BeforeAgentStartHandler): void {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler;
        }
      },
      getActiveTools: () => ["read"],
      getAllTools: () => [],
      getThinkingLevel: () => "medium",
      registerCommand: () => undefined,
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    assert.ok(beforeAgentStartHandler);

    const cwd = process.cwd();
    const result = await beforeAgentStartHandler(
      {
        type: "before_agent_start",
        prompt: "hello",
        systemPrompt: "Pi native system prompt",
        systemPromptOptions: {
          cwd,
          customPrompt: "Hello {{model.provider}}",
          appendSystemPrompt: "Appended instructions",
          selectedTools: ["read"],
          contextFiles: [{ path: "AGENTS.md", content: "Project rules" }],
          skills: [
            {
              name: "reviewer",
              description: "Review code changes",
              filePath: "/skills/reviewer/SKILL.md",
            },
          ],
        },
      },
      {
        mode: "tui",
        getContextUsage: () => undefined,
        model: { provider: "anthropic" },
        sessionManager: {
          getSessionId: () => "session-123",
          getSessionName: () => "Custom prompt test",
        },
      },
    );

    assert.ok(result);
    const systemPrompt = result.systemPrompt;
    assert.ok(typeof systemPrompt === "string");
    assert.match(systemPrompt, /^Hello anthropic/);
    assert.match(systemPrompt, /Appended instructions/);
    assert.match(systemPrompt, /<project_context>/);
    assert.match(systemPrompt, /<project_instructions path="AGENTS.md">\nProject rules\n<\/project_instructions>/);
    assert.match(systemPrompt, /<available_skills>/);
    assert.match(systemPrompt, /<name>reviewer<\/name>/);
    assert.match(systemPrompt, new RegExp(`Current date: ${new Date().toISOString().slice(0, 10)}`));
    assert.match(systemPrompt, new RegExp(`Current working directory: ${cwd.replace(/\\/g, "/")}`));
    assert.ok(systemPrompt.indexOf("Appended instructions") < systemPrompt.indexOf("<project_context>"));
    assert.ok(systemPrompt.indexOf("<project_context>") < systemPrompt.indexOf("<available_skills>"));
    assert.ok(systemPrompt.indexOf("<available_skills>") < systemPrompt.indexOf("Current date:"));
  });

  void it("renders bundled runtime and tool sections with TUI size and placeholders", async () => {
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
    const pi = {
      on(event: string, handler: BeforeAgentStartHandler): void {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler;
        }
      },
      getActiveTools: () => ["read", "bash"],
      getAllTools: () => [
        {
          name: "read",
          description: "Read file contents",
          promptGuidelines: ["Use read to inspect files instead of shelling out."],
        },
        {
          name: "bash",
          description: "Execute shell commands",
          promptGuidelines: ["Inspect before running risky commands."],
        },
      ],
      getThinkingLevel: () => "medium",
      registerCommand: () => undefined,
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    assert.ok(beforeAgentStartHandler);

    const stdout = process.stdout as typeof process.stdout & { columns?: number; rows?: number };
    const originalColumns = stdout.columns;
    const originalRows = stdout.rows;
    stdout.columns = 120;
    stdout.rows = 40;

    try {
      const result = await beforeAgentStartHandler(
        {
          type: "before_agent_start",
          prompt: "hello",
          systemPrompt: "Pi native system prompt",
          systemPromptOptions: {
            cwd: process.cwd(),
            selectedTools: ["read", "bash"],
            toolSnippets: { read: "Read files", bash: "Run commands" },
          },
        },
        {
          mode: "tui",
          getContextUsage: () => ({ tokens: null, contextWindow: 500000, percent: null }),
          model: { id: "gpt-5-codex", name: "GPT-5 Codex", provider: "openai-codex", input: ["text", "image"], contextWindow: 500000 },
          sessionManager: {
            getSessionId: () => "session-789",
            getSessionName: () => "Bundled prompt test",
          },
        },
      );

      assert.ok(result);
      const systemPrompt = result.systemPrompt;
      assert.ok(typeof systemPrompt === "string");
      assert.match(systemPrompt, /Mode: tui \(120x40\)/);
      assert.match(systemPrompt, /Context usage: \? \/ 500000 tokens \(\?\)/);
      assert.match(systemPrompt, /# Tool Usage Guidelines/);
      assert.match(systemPrompt, /## `read`/);
      assert.match(systemPrompt, /Use read to inspect files instead of shelling out\./);
      assert.match(systemPrompt, /## `bash`/);
      assert.match(systemPrompt, /Inspect before running risky commands\./);
      assert.doesNotMatch(systemPrompt, /Pi package:/);
    } finally {
      stdout.columns = originalColumns;
      stdout.rows = originalRows;
    }
  });

  void it("falls back to COLUMNS and LINES when stdout terminal size is unavailable", async () => {
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
    const pi = {
      on(event: string, handler: BeforeAgentStartHandler): void {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler;
        }
      },
      getActiveTools: () => ["read"],
      getAllTools: () => [
        {
          name: "read",
          description: "Read file contents",
          promptGuidelines: ["Use read to inspect files."],
        },
      ],
      getThinkingLevel: () => "medium",
      registerCommand: () => undefined,
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    assert.ok(beforeAgentStartHandler);

    const stdout = process.stdout as unknown as {
      columns: number | undefined;
      rows: number | undefined;
    };
    const originalColumns = stdout.columns;
    const originalRows = stdout.rows;
    const originalEnvColumns = process.env.COLUMNS;
    const originalEnvLines = process.env.LINES;
    stdout.columns = undefined;
    stdout.rows = undefined;
    process.env.COLUMNS = "214";
    process.env.LINES = "62";

    try {
      const result = await beforeAgentStartHandler(
        {
          type: "before_agent_start",
          prompt: "hello",
          systemPrompt: "Pi native system prompt",
          systemPromptOptions: {
            cwd: process.cwd(),
            selectedTools: ["read"],
            toolSnippets: { read: "Read files" },
          },
        },
        {
          mode: "tui",
          getContextUsage: () => ({ tokens: null, contextWindow: 500000, percent: null }),
          model: { id: "gpt-5-codex", name: "GPT-5 Codex", provider: "openai-codex", input: ["text", "image"], contextWindow: 500000 },
          sessionManager: {
            getSessionId: () => "session-env-size",
            getSessionName: () => "Env size fallback test",
          },
        },
      );

      assert.ok(result);
      const systemPrompt = result.systemPrompt;
      assert.ok(typeof systemPrompt === "string");
      assert.match(systemPrompt, /Mode: tui \(214x62\)/);
    } finally {
      stdout.columns = originalColumns;
      stdout.rows = originalRows;
      if (originalEnvColumns === undefined) delete process.env.COLUMNS;
      else process.env.COLUMNS = originalEnvColumns;
      if (originalEnvLines === undefined) delete process.env.LINES;
      else process.env.LINES = originalEnvLines;
    }
  });

  void it("falls back to the native prompt and notifies when template rendering fails", async () => {
    let beforeAgentStartHandler: BeforeAgentStartHandler | undefined;
    const pi = {
      on(event: string, handler: BeforeAgentStartHandler): void {
        if (event === "before_agent_start") {
          beforeAgentStartHandler = handler;
        }
      },
      getActiveTools: () => [],
      getAllTools: () => [],
      getThinkingLevel: () => "medium",
      registerCommand: () => undefined,
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    assert.ok(beforeAgentStartHandler);

    const notifications: string[] = [];
    const nativeSystemPrompt = "Pi native system prompt";
    const result = await beforeAgentStartHandler(
      {
        type: "before_agent_start",
        prompt: "hello",
        systemPrompt: nativeSystemPrompt,
        systemPromptOptions: {
          cwd: process.cwd(),
          customPrompt: "{{missing.value}}",
        },
      },
      {
        mode: "tui",
        ui: {
          notify(message: string): void {
            notifications.push(message);
          },
        },
        getContextUsage: () => undefined,
        model: undefined,
        sessionManager: {
          getSessionId: () => "session-123",
          getSessionName: () => "Fallback test",
        },
      },
    );

    assert.deepEqual(result, { systemPrompt: nativeSystemPrompt });
    assert.deepEqual(notifications, [
      "System prompt template render failed; falling back to Pi default prompt.",
    ]);
  });

  void it("preview renders TUI terminal size through the command render path", async () => {
    const commands = new Map<string, RegisteredCommand>();
    const pi = {
      on: () => undefined,
      getActiveTools: () => ["read"],
      getAllTools: () => [
        {
          name: "read",
          description: "Read file contents",
          promptGuidelines: ["Use read to inspect files."],
        },
      ],
      getThinkingLevel: () => "medium",
      registerCommand(name: string, command: RegisteredCommand): void {
        commands.set(name, command);
      },
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    const preview = commands.get("system-prompt:preview");
    assert.ok(preview);

    const stdout = process.stdout as typeof process.stdout & { columns?: number; rows?: number };
    const originalColumns = stdout.columns;
    const originalRows = stdout.rows;
    stdout.columns = 214;
    stdout.rows = 62;

    const editors: Array<{ title: string; content: string }> = [];

    try {
      await preview.handler("", {
        cwd: process.cwd(),
        hasUI: true,
        mode: "tui",
        ui: {
          editor(title: string, content: string): Promise<string | undefined> {
            editors.push({ title, content });
            return Promise.resolve(undefined);
          },
          notify: () => undefined,
        },
        getSystemPromptOptions: () => ({
          cwd: process.cwd(),
          selectedTools: ["read"],
          toolSnippets: { read: "Read files" },
        }),
        getSystemPrompt: () => "Pi native system prompt",
        getContextUsage: () => ({ tokens: null, contextWindow: 500000, percent: null }),
        model: { id: "gpt-5-codex", name: "GPT-5 Codex", provider: "openai-codex", input: ["text", "image"], contextWindow: 500000 },
        sessionManager: {
          getSessionId: () => "session-preview",
          getSessionName: () => "Preview test",
        },
      });
    } finally {
      stdout.columns = originalColumns;
      stdout.rows = originalRows;
    }

    assert.equal(editors.length, 1);
    assert.equal(editors[0]?.title, "Rendered system prompt");
    assert.match(editors[0]?.content ?? "", /Mode: tui \(214x62\)/);
  });

  void it("doctor validates the active custom prompt source", async () => {
    const commands = new Map<string, RegisteredCommand>();
    const pi = {
      on: () => undefined,
      getActiveTools: () => [],
      getAllTools: () => [],
      getThinkingLevel: () => "medium",
      registerCommand(name: string, command: RegisteredCommand): void {
        commands.set(name, command);
      },
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    const doctor = commands.get("system-prompt:doctor");
    assert.ok(doctor);

    const notifications: Array<{ message: string; level?: string }> = [];
    await doctor.handler("", {
      cwd: process.cwd(),
      mode: "tui",
      ui: {
        notify(message: string, level?: string): void {
          notifications.push({ message, level });
        },
      },
      getSystemPromptOptions: () => ({
        cwd: process.cwd(),
        customPrompt: "{{missing.value}}",
      }),
      getSystemPrompt: () => "Pi native system prompt",
      getContextUsage: () => undefined,
      model: undefined,
      sessionManager: {
        getSessionId: () => "session-123",
        getSessionName: () => "Doctor test",
      },
    });

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.level, "error");
    assert.match(notifications[0]?.message ?? "", /System prompt template doctor found issues:/);
    assert.match(notifications[0]?.message ?? "", /Render failed:/);
  });

  void it("saves the rendered prompt to a file when preview is given a path", async () => {
    const commands = new Map<string, RegisteredCommand>();
    const pi = {
      on: () => undefined,
      getActiveTools: () => ["read"],
      getAllTools: () => [
        { name: "read", description: "Read file contents", promptGuidelines: ["Use read."] },
      ],
      getThinkingLevel: () => "medium",
      registerCommand(name: string, command: RegisteredCommand): void {
        commands.set(name, command);
      },
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    const preview = commands.get("system-prompt:preview");
    assert.ok(preview);

    const dir = await mkdtemp(join(tmpdir(), "pi-agent-system-preview-"));
    const outPath = join(dir, "nested", "prompt.md");
    const notifications: Array<{ message: string; level?: string }> = [];

    try {
      await preview.handler(`--out ${outPath}`, {
        cwd: process.cwd(),
        hasUI: true,
        mode: "tui",
        ui: {
          editor: () => Promise.resolve(undefined),
          notify(message: string, level?: string): void {
            notifications.push({ message, level });
          },
        },
        getSystemPromptOptions: () => ({
          cwd: process.cwd(),
          selectedTools: ["read"],
          toolSnippets: { read: "Read files" },
        }),
        getSystemPrompt: () => "Pi native system prompt",
        getContextUsage: () => undefined,
        model: { id: "m", name: "Model", provider: "prov", input: ["text"], contextWindow: 200000 },
        sessionManager: {
          getSessionId: () => "session-preview-file",
          getSessionName: () => "Preview file test",
        },
      });

      const saved = await readFile(outPath, "utf8");
      assert.match(saved, /You are Nukii/);
      assert.equal(notifications.length, 1);
      assert.match(notifications[0]?.message ?? "", /Saved rendered system prompt/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  void it("saves a variables snapshot to a file when vars is given a path", async () => {
    const commands = new Map<string, RegisteredCommand>();
    const pi = {
      on: () => undefined,
      getActiveTools: () => ["read"],
      getAllTools: () => [
        { name: "read", description: "Read file contents", promptGuidelines: ["Use read."] },
      ],
      getThinkingLevel: () => "medium",
      registerCommand(name: string, command: RegisteredCommand): void {
        commands.set(name, command);
      },
    };
    piAgentSystem(pi as unknown as ExtensionAPI);

    const vars = commands.get("system-prompt:vars");
    assert.ok(vars);

    const dir = await mkdtemp(join(tmpdir(), "pi-agent-system-vars-"));
    const outPath = join(dir, "vars.json");
    const longGuideline = "x".repeat(800);
    const notifications: Array<{ message: string; level?: string }> = [];

    try {
      await vars.handler(outPath, {
        cwd: process.cwd(),
        hasUI: true,
        mode: "tui",
        ui: {
          editor: () => Promise.resolve(undefined),
          notify(message: string, level?: string): void {
            notifications.push({ message, level });
          },
        },
        getSystemPromptOptions: () => ({
          cwd: process.cwd(),
          selectedTools: ["read"],
          toolSnippets: { read: "Read files" },
          promptGuidelines: [longGuideline],
          appendSystemPrompt: "Append directive content.",
        }),
        getSystemPrompt: () => "Pi native system prompt",
        getContextUsage: () => undefined,
        model: { id: "m", name: "Model", provider: "prov", input: ["text"], contextWindow: 200000 },
        sessionManager: {
          getSessionId: () => "session-vars-file",
          getSessionName: () => "Vars file test",
        },
      });

      const saved = await readFile(outPath, "utf8");
      const parsed = JSON.parse(saved);
      assert.equal(parsed.appendSystemPrompt, "Append directive content.");
      assert.equal(parsed.appendSystem.entries[0].content, "Append directive content.");
      assert.ok(saved.includes(longGuideline), "long non-env values must not be redacted");
      assert.equal(parsed.tools.guidelines[0], longGuideline);
      assert.equal(notifications.length, 1);
      assert.match(notifications[0]?.message ?? "", /Saved system prompt variables/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
