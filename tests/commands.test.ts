import { strict as assert } from "node:assert";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildEjectTargets, parseEjectArgs } from "../src/commands.ts";

void describe("command helpers", () => {
  void it("parses project eject arguments", () => {
    assert.deepEqual(parseEjectArgs("--project"), { scope: "project", force: false });
  });

  void it("parses global force eject arguments", () => {
    assert.deepEqual(parseEjectArgs("--global --force"), { scope: "global", force: true });
  });

  void it("defaults eject arguments to project scope without force", () => {
    assert.deepEqual(parseEjectArgs(""), { scope: "project", force: false });
  });

  void it("builds project eject target paths", () => {
    assert.deepEqual(
      buildEjectTargets({ scope: "project", cwd: "/repo", agentDir: "/agent" }),
      {
        systemPrompt: join("/repo", ".pi", "SYSTEM.md"),
        partialsDir: join("/repo", ".pi", "system-prompt", "partials"),
        readme: join("/repo", ".pi", "system-prompt", "README.md"),
      },
    );
  });

  void it("builds global eject target paths", () => {
    assert.deepEqual(
      buildEjectTargets({ scope: "global", cwd: "/repo", agentDir: "/agent" }),
      {
        systemPrompt: join("/agent", "SYSTEM.md"),
        partialsDir: join("/agent", "system-prompt", "partials"),
        readme: join("/agent", "system-prompt", "README.md"),
      },
    );
  });
});
