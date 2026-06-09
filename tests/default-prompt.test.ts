import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { buildDefaultPromptParts } from "../src/default-prompt.ts";

void describe("buildDefaultPromptParts", () => {
  void it("exposes default Pi prompt sections separately and as nativeFull", () => {
    const parts = buildDefaultPromptParts({
      nativeFull: "native prompt from pi",
      cwd: "/repo",
      date: "2026-06-09",
      selectedTools: ["read", "bash", "edit", "write"],
      toolSnippets: {
        read: "Read files",
        bash: "Run commands",
        edit: "Edit files",
        write: "Write files",
      },
      promptGuidelines: ["Use read for file contents."],
      contextFiles: [{ path: "/repo/AGENTS.md", content: "Project rule" }],
      skills: [
        {
          name: "demo",
          description: "Demo skill",
          filePath: "/skills/demo/SKILL.md",
          baseDir: "/skills/demo",
          sourceInfo: {
            path: "/skills/demo/SKILL.md",
            source: "test",
            scope: "temporary",
            origin: "top-level",
          },
          disableModelInvocation: false,
        },
      ],
    });

    assert.equal(parts.nativeFull, "native prompt from pi");
    assert.match(parts.parts.identity, /expert coding assistant/);
    assert.match(parts.parts.availableTools, /- read: Read files/);
    assert.match(parts.parts.guidelines, /Use read for file contents/);
    assert.match(parts.parts.piDocs, /Pi documentation/);
    assert.match(parts.parts.projectContextXml, /<project_context>/);
    assert.match(parts.parts.skillsXml, /<available_skills>/);
    assert.match(parts.parts.runtimeFooter, /Current date: 2026-06-09/);
  });

  void it("omits skills XML when read is inactive", () => {
    const parts = buildDefaultPromptParts({
      nativeFull: "native",
      cwd: "/repo",
      date: "2026-06-09",
      selectedTools: ["bash"],
      toolSnippets: {},
      promptGuidelines: [],
      contextFiles: [],
      skills: [
        {
          name: "demo",
          description: "Demo skill",
          filePath: "/skills/demo/SKILL.md",
          baseDir: "/skills/demo",
          sourceInfo: {
            path: "/skills/demo/SKILL.md",
            source: "test",
            scope: "temporary",
            origin: "top-level",
          },
          disableModelInvocation: false,
        },
      ],
    });

    assert.equal(parts.parts.skillsXml, "");
  });
});
