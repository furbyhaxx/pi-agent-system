import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { getAgentDir, getPackageRoot, getPartialRoots } from "../src/paths.ts";

void describe("path helpers", () => {
  void it("resolves the global agent dir from PI_CODING_AGENT_DIR or ~/.pi/agent", () => {
    assert.equal(
      getAgentDir({ PI_CODING_AGENT_DIR: "/custom/agent" }),
      "/custom/agent",
    );
    assert.equal(getAgentDir({}), join(homedir(), ".pi", "agent"));
  });

  void it("resolves the package root from an import.meta.url-style source URL", () => {
    const sourceUrl = pathToFileURL(join(process.cwd(), "src", "paths.ts")).href;

    assert.equal(getPackageRoot(sourceUrl), process.cwd());
  });

  void it("returns partial roots in bundled, global, project precedence order", () => {
    assert.deepEqual(
      getPartialRoots({ packageRoot: "/pkg", agentDir: "/agent", cwd: "/repo" }),
      [
        join("/pkg", "templates", "partials"),
        join("/agent", "system-prompt", "partials"),
        join("/repo", ".pi", "system-prompt", "partials"),
      ],
    );
  });
});
