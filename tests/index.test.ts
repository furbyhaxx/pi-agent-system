import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import type { BeforeAgentStartEventResult, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import piAgentSystem from "../src/index.ts";

type BeforeAgentStartHandler = (
  event: Record<string, unknown>,
  ctx: Record<string, unknown>,
) => Promise<BeforeAgentStartEventResult | void> | BeforeAgentStartEventResult | void;

void describe("piAgentSystem", () => {
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
});
