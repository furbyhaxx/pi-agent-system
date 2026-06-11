import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  buildAppendSystemEntries,
  buildTemplateContext,
  classifyContextFiles,
  sanitizeForTemplate,
} from "../src/context.ts";
import type { BuildTemplateContextInput } from "../src/types.ts";

void describe("buildTemplateContext", () => {
  void it("exposes safe runtime, model, session, tool, skill, context, and default prompt data", () => {
    const input: BuildTemplateContextInput = {
      piPackageName: "@earendil-works/pi-coding-agent",
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
      contextFiles: [
        { path: "/repo/AGENTS.md", content: "Project instructions" },
        { path: "/agent/AGENTS.md", content: "User instructions" },
      ],
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
      agentDir: "/agent",
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
          hint: "SSH hint",
        },
      },
      git: { isGit: true, remotes: [{ name: "origin", url: "https://example.com/repo.git" }] },
      appendSources: [{ source: "/agent/APPEND_SYSTEM.md", content: "Append this system prompt." }],
    };

    const context = buildTemplateContext(input);

    assert.equal(context.pi.packageName, "@earendil-works/pi-coding-agent");
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
    assert.deepEqual(context.contextFiles.all, [
      { path: "/repo/AGENTS.md", content: "Project instructions" },
      { path: "/agent/AGENTS.md", content: "User instructions" },
    ]);
    assert.deepEqual(context.contextFiles.user, [
      { path: "/agent/AGENTS.md", content: "User instructions" },
    ]);
    assert.deepEqual(context.contextFiles.project, [
      { path: "/repo/AGENTS.md", content: "Project instructions" },
    ]);
    assert.equal(context.runtime.isGit, true);
    assert.deepEqual(context.runtime.git.remotes, [
      { name: "origin", url: "https://example.com/repo.git" },
    ]);
    assert.equal(context.host?.os, "Debian GNU/Linux 12");
    assert.equal(context.host?.shell.name, "bash");
    assert.deepEqual(context.host?.gpu, ["Test GPU 1", "Test GPU 2"]);
    assert.equal(context.host?.env.SSH_CONNECTION, "203.0.113.10 55555 192.0.2.5 22");
    assert.equal(context.host?.remote.connected, true);
    assert.equal(context.host?.remote.recommendedBindAddress, "0.0.0.0");
    assert.equal(context.appendSystemPrompt, "Append this system prompt.");
    assert.equal(context.appendSystem.present, true);
    assert.equal(context.appendSystem.count, 1);
    assert.deepEqual(context.appendSystem.entries, [
      {
        source: "/agent/APPEND_SYSTEM.md",
        kind: "file",
        content: "Append this system prompt.",
      },
    ]);
    assert.deepEqual(context.defaultPrompt, input.defaultPrompt);
  });

  void it("normalizes runtime display values and active tool guideline defaults", () => {
    const input = {
      piPackageName: "@earendil-works/pi-coding-agent",
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

void describe("classifyContextFiles", () => {
  void it("splits files into user and project scope by agent directory", () => {
    const result = classifyContextFiles(
      [
        { path: "/agent/AGENTS.md", content: "user" },
        { path: "/repo/AGENTS.md", content: "project" },
        { path: "/repo/pkg/AGENTS.md", content: "nested project" },
      ],
      "/agent",
    );

    assert.deepEqual(
      result.user.map((file) => file.path),
      ["/agent/AGENTS.md"],
    );
    assert.deepEqual(
      result.project.map((file) => file.path),
      ["/repo/AGENTS.md", "/repo/pkg/AGENTS.md"],
    );
    assert.equal(result.all.length, 3);
  });

  void it("treats all files as project scope when no agent directory is given", () => {
    const result = classifyContextFiles([{ path: "/repo/AGENTS.md", content: "x" }]);
    assert.equal(result.user.length, 0);
    assert.equal(result.project.length, 1);
  });
});

void describe("buildAppendSystemEntries", () => {
  void it("attributes combined text to matching source files", () => {
    const entries = buildAppendSystemEntries("Project rules\n\nGlobal rules", [
      { source: "/repo/.pi/APPEND_SYSTEM.md", content: "Project rules" },
      { source: "/agent/APPEND_SYSTEM.md", content: "Global rules" },
    ]);

    assert.deepEqual(entries, [
      { source: "/repo/.pi/APPEND_SYSTEM.md", kind: "file", content: "Project rules" },
      { source: "/agent/APPEND_SYSTEM.md", kind: "file", content: "Global rules" },
    ]);
  });

  void it("keeps unattributed remainder as a single inline entry", () => {
    const entries = buildAppendSystemEntries("From file\n\nFrom extension", [
      { source: "/agent/APPEND_SYSTEM.md", content: "From file" },
    ]);

    assert.equal(entries.length, 2);
    assert.equal(entries[0]?.kind, "file");
    assert.equal(entries[1]?.kind, "inline");
    assert.equal(entries[1]?.content, "From extension");
  });

  void it("returns an empty list when there is no appended text", () => {
    assert.deepEqual(buildAppendSystemEntries(undefined, []), []);
    assert.deepEqual(buildAppendSystemEntries("   ", []), []);
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
