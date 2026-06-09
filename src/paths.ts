import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { USER_PARTIALS_DIR } from "./constants.ts";

/** Resolve Pi's global agent directory without hard-coding `~/.pi/agent`. */
export function getAgentDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

/** Resolve this package root from an import meta URL. */
export function getPackageRoot(metaUrl: string): string {
  return dirname(dirname(fileURLToPath(metaUrl)));
}

/** Return partial roots in ascending precedence: bundled, global, project. */
export function getPartialRoots(input: {
  packageRoot: string;
  agentDir: string;
  cwd: string;
}): string[] {
  return [
    join(input.packageRoot, "templates", "partials"),
    join(input.agentDir, USER_PARTIALS_DIR),
    join(input.cwd, ".pi", USER_PARTIALS_DIR),
  ];
}
