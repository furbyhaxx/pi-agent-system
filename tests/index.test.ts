import { strict as assert } from "node:assert";
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
});
