import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createRenderer } from "../src/renderer.ts";

void describe("createRenderer", () => {
  void it("renders markdown without HTML escaping", async () => {
    const renderer = await createRenderer({ partialRoots: [] });

    const rendered = renderer.render("{{value}}", { value: "<tag> & text" });

    assert.equal(rendered, "<tag> & text");
  });

  void it("lets partials inherit the full current context", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-agent-system-"));

    try {
      await mkdir(join(dir, "policy"), { recursive: true });
      await writeFile(
        join(dir, "policy", "model.md"),
        "provider={{model.provider}} cwd={{runtime.cwd}}",
        "utf8",
      );

      const renderer = await createRenderer({ partialRoots: [dir] });
      const rendered = renderer.render("{{> policy/model}}", {
        model: { provider: "anthropic" },
        runtime: { cwd: "/repo" },
      });

      assert.equal(rendered, "provider=anthropic cwd=/repo");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  void it("discovers recursive partials and lets later roots override earlier roots", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-agent-system-"));
    const firstRoot = join(dir, "first");
    const secondRoot = join(dir, "second");

    try {
      await mkdir(join(firstRoot, "policy"), { recursive: true });
      await mkdir(join(secondRoot, "policy"), { recursive: true });
      await writeFile(join(firstRoot, "policy", "model.hbs"), "first", "utf8");
      await writeFile(join(firstRoot, "shared.handlebars"), "shared", "utf8");
      await writeFile(join(secondRoot, "policy", "model.prompt"), "second", "utf8");
      await writeFile(join(secondRoot, "leaf.partial"), "leaf", "utf8");

      const renderer = await createRenderer({ partialRoots: [firstRoot, secondRoot] });
      const rendered = renderer.render("{{> policy/model}} {{> shared}} {{> leaf}}", {});

      assert.equal(rendered, "second shared leaf");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  void it("exposes safe helpers", async () => {
    const renderer = await createRenderer({ partialRoots: [] });

    const rendered = renderer.render(
      '{{default missing "fallback"}} {{#if (hasTool tools "read")}}read{{/if}}',
      { missing: undefined, tools: { active: ["read"] } },
    );

    assert.equal(rendered, "fallback read");
  });

  void it("renders the bundled default system prompt with inherited partial context", async () => {
    const templateRoot = join(process.cwd(), "templates");
    const template = await readFile(join(templateRoot, "default.SYSTEM.md"), "utf8");
    const renderer = await createRenderer({ partialRoots: [join(templateRoot, "partials")] });

    const rendered = renderer.render(template, {
      appendSystemPrompt: "Append this system prompt.",
      contextFiles: [{ path: "/repo/AGENTS.md", content: "Project instructions" }],
      defaultPrompt: {
        nativeFull: "native prompt",
        parts: {
          identity: "identity",
          availableTools: "tools",
          guidelines: "guidelines",
          piDocs: "pi docs",
          projectContextXml: "<project_context />",
          skillsXml: "<available_skills><skill name=\"visible-skill\" /></available_skills>",
          runtimeFooter: "Current date: 2026-06-09\nCurrent working directory: /repo",
        },
      },
      model: { id: "test-model", name: "Test Model", provider: "test-provider" },
      pi: { packageName: "@furbyhaxx/pi-agent-system", version: "0.1.0", docs: {} },
      runtime: {
        cwd: "/repo",
        date: "2026-06-09",
        mode: "default",
        thinkingLevel: "medium",
        contextUsage: { tokens: 1234, contextWindow: 8000, percent: 0.15425 },
      },
      session: { id: "session-123", name: "Bundled template test" },
      skills: {
        all: [],
        visible: [],
        xml: "<available_skills><skill name=\"visible-skill\" /></available_skills>",
      },
      tools: {
        active: ["read", "bash"],
        activeDetails: [
          { name: "read", description: "Read file contents" },
          { name: "bash", description: "Execute shell commands" },
        ],
        all: [],
        byName: {},
        snippets: {},
        guidelines: ["Prefer read for file contents."],
      },
    });

    assert.match(rendered, /You are Pi, an AI coding agent/);
    assert.match(rendered, /Action Safety/);
    assert.match(rendered, /`read`/);
    assert.match(rendered, /Current date: 2026-06-09/);
    assert.match(rendered, /Current working directory: \/repo/);
    assert.match(rendered, /<available_skills><skill name="visible-skill" \/><\/available_skills>/);
  });
});
