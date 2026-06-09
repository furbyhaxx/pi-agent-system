import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
});
