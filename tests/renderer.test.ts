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
      '{{default missing "fallback"}} {{#if (hasTool tools "read")}}read{{/if}} {{#if (contains inputs "image")}}image{{/if}} {{xml label}}',
      { missing: undefined, tools: { active: ["read"] }, inputs: ["text", "image"], label: "a < b & c" },
    );

    assert.equal(rendered, "fallback read image a &lt; b &amp; c");
  });

  void it("renders the bundled default system prompt with inherited partial context", async () => {
    const templateRoot = join(process.cwd(), "templates");
    const template = await readFile(join(templateRoot, "default.SYSTEM.md"), "utf8");
    const renderer = await createRenderer({ partialRoots: [join(templateRoot, "partials")] });

    const rendered = renderer.render(template, {
      appendSystemPrompt: "Append this system prompt.",
      appendSystem: {
        present: true,
        text: "Append this system prompt.",
        count: 1,
        entries: [
          {
            source: "/repo/.pi/APPEND_SYSTEM.md",
            kind: "file",
            content: "Append this system prompt.",
          },
        ],
      },
      contextFiles: {
        all: [
          { path: "/agent/AGENTS.md", content: "User instructions" },
          { path: "/repo/AGENTS.md", content: "Project instructions" },
        ],
        user: [{ path: "/agent/AGENTS.md", content: "User instructions" }],
        project: [{ path: "/repo/AGENTS.md", content: "Project instructions" }],
      },
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
      host: {
        uname: "Linux dev 6.1.0 x86_64",
        os: "Debian GNU/Linux 12",
        arch: "x64",
        hostname: "dev",
        cpu: "Test CPU (8 cores)",
        memory: "16 GiB",
        shell: { name: "bash", version: "5.2" },
        gpu: ["Test GPU 1", "Test GPU 2"],
        env: { PATH: "/usr/bin", SSH_CONNECTION: "203.0.113.10 55555 192.0.2.5 22" },
        remote: {
          connected: true,
          viaSsh: true,
          sshConnection: "203.0.113.10 55555 192.0.2.5 22",
          remoteAddress: "203.0.113.10",
          hostAddress: "192.0.2.5",
          recommendedBindAddress: "0.0.0.0",
          hint: "The user appears to be connected over SSH. When starting servers the user should reach from their remote client, bind to 0.0.0.0 or 192.0.2.5 instead of localhost.",
        },
      },
      model: {
        id: "test-model",
        name: "Test Model",
        provider: "test-provider",
        input: ["text", "image"],
        contextWindow: 500000,
      },
      pi: {
        packageName: "@earendil-works/pi-coding-agent",
        version: "0.79.0",
        docs: { readme: "/pi/README.md", docs: "/pi/docs", examples: "/pi/examples" },
      },
      runtime: {
        cwd: "/repo",
        date: "2026-06-09",
        mode: "tui",
        thinkingLevel: "medium",
        contextUsage: { tokens: null, contextWindow: 500000, percent: null },
        terminal: { width: 120, height: 40 },
        modeDisplay: "tui (120x40)",
        contextUsageDisplay: { tokens: "?", contextWindow: "500000", percent: "?" },
        isGit: true,
        git: { remotes: [{ name: "origin", url: "https://example.com/repo.git" }] },
      },
      session: { id: "session-123", name: "Bundled template test" },
      skills: {
        all: [
          {
            name: "visible-skill",
            description: "Visible <skill>",
            filePath: "/skills/visible/SKILL.md",
          },
        ],
        visible: [
          {
            name: "visible-skill",
            description: "Visible <skill>",
            filePath: "/skills/visible/SKILL.md",
          },
        ],
        xml: "<available_skills><skill name=\"visible-skill\" /></available_skills>",
      },
      tools: {
        active: ["read", "bash"],
        activeDetails: [
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
        all: [],
        byName: {},
        snippets: {},
        guidelines: ["Prefer read for file contents."],
      },
    });

    assert.match(rendered, /You are Nukii/);
    assert.match(rendered, /# Harness/);
    assert.match(rendered, /Action Safety/);
    assert.match(rendered, /# Tool Usage Guidelines/);
    assert.match(rendered, /## `read`/);
    assert.match(rendered, /Use read to inspect files instead of shelling out\./);
    assert.match(rendered, /## `bash`/);
    assert.match(rendered, /Inspect before running risky commands\./);
    assert.match(rendered, /# Appended Instructions/);
    assert.match(rendered, /<nu:append source="\/repo\/\.pi\/APPEND_SYSTEM\.md" kind="file">/);
    assert.match(rendered, /Append this system prompt\./);
    assert.match(rendered, /<user_instructions path="\/agent\/AGENTS\.md">/);
    assert.match(rendered, /<project_instructions path="\/repo\/AGENTS\.md">/);
    assert.match(rendered, /cwd is a git repo: Yes/);
    assert.match(rendered, /- \*\*origin\*\*: `https:\/\/example\.com\/repo\.git`/);
    assert.match(rendered, /Host: Linux dev 6\.1\.0 x86_64/);
    assert.match(rendered, /OS: Debian GNU\/Linux 12/);
    assert.match(rendered, /Shell: bash \(5\.2\)/);
    assert.match(rendered, /User connected remotely: true/);
    assert.match(rendered, /Remote user\/server hint: The user appears to be connected over SSH/);
    assert.match(rendered, /GPUs:\n- Test GPU 1\n- Test GPU 2/);
    assert.match(rendered, /You are able to read and understand images/);
    assert.match(rendered, /Mode: tui \(120x40\)/);
    assert.match(rendered, /Context usage: \? \/ 500000 tokens \(\?\)/);
    assert.doesNotMatch(rendered, /Pi package:/);
    assert.match(rendered, /Current date: 2026-06-09/);
    assert.match(rendered, /Current working directory: \/repo/);
    assert.match(rendered, /<available_skills>/);
    assert.match(rendered, /<name>visible-skill<\/name>/);
    assert.match(rendered, /<description>Visible &lt;skill&gt;<\/description>/);
    assert.match(rendered, /<location>\/skills\/visible\/SKILL\.md<\/location>/);
  });

  void it("renders the bundled default with optional live fields absent", async () => {
    const templateRoot = join(process.cwd(), "templates");
    const template = await readFile(join(templateRoot, "default.SYSTEM.md"), "utf8");
    const renderer = await createRenderer({ partialRoots: [join(templateRoot, "partials")] });

    const rendered = renderer.render(template, {
      appendSystem: { present: false, text: "", count: 0, entries: [] },
      contextFiles: { all: [], user: [], project: [] },
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
      host: {
        uname: "Linux dev 6.1.0 x86_64",
        os: "Debian GNU/Linux 12",
        arch: "x64",
        hostname: "dev",
        cpu: "Test CPU (8 cores)",
        memory: "16 GiB",
        shell: { name: "bash", version: "5.2" },
        gpu: [],
        env: { PATH: "/usr/bin" },
        remote: { connected: false, viaSsh: false },
      },
      model: {
        id: "test-model",
        name: "Test Model",
        provider: "test-provider",
        input: ["text"],
        contextWindow: 500000,
      },
      pi: {
        packageName: "@earendil-works/pi-coding-agent",
        version: "0.79.0",
        docs: { readme: "/pi/README.md", docs: "/pi/docs", examples: "/pi/examples" },
      },
      runtime: {
        cwd: "/repo",
        date: "2026-06-09",
        mode: "tui",
        terminal: {},
        modeDisplay: "tui (?x?)",
        contextUsageDisplay: { tokens: "?", contextWindow: "?", percent: "?" },
        isGit: false,
        git: { remotes: [] },
      },
      skills: { all: [], visible: [], xml: "" },
      tools: {
        active: [],
        activeDetails: [],
        all: [],
        byName: {},
        snippets: {},
        guidelines: [],
      },
    });

    assert.match(rendered, /You are Nukii/);
    assert.match(rendered, /Current date: 2026-06-09/);
    assert.match(rendered, /Current working directory: \/repo/);
    assert.match(rendered, /cwd is a git repo: No/);
    assert.match(rendered, /User connected remotely: false/);
    assert.match(rendered, /Mode: tui \(\?x\?\)/);
    assert.match(rendered, /Context usage: \? \/ \? tokens \(\?\)/);
    assert.match(rendered, /You are not able to read or understand images/);
    assert.doesNotMatch(rendered, /# Appended Instructions/);
    assert.doesNotMatch(rendered, /GPUs:/);
    assert.doesNotMatch(rendered, /Pi package:/);
  });
});
