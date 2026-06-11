import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { basename, join } from "node:path";

/** Host machine details exposed to system prompt templates. */
export interface HostContext {
  /** `uname -a`-style string, or an `os`-module fallback. */
  uname: string;
  /** Human-friendly operating system name and version. */
  os: string;
  /** CPU architecture (e.g. `x64`, `arm64`). */
  arch: string;
  /** Machine hostname. */
  hostname: string;
  /** CPU model and core count. */
  cpu: string;
  /** Total system memory, human-readable. */
  memory: string;
  /** Login shell name and detected version. */
  shell: { name: string; version: string };
  /** GPU descriptions detected on the host. */
  gpu: string[];
  /** Sanitized environment variables keyed by variable name. */
  env: Record<string, string>;
  /** Derived remote-login facts. */
  remote: RemoteConnectionContext;
}

/** Derived remote-login facts exposed to templates. */
export interface RemoteConnectionContext {
  /** Whether the environment indicates a remote user connection. */
  connected: boolean;
  /** Whether the remote connection appears to be SSH-based. */
  viaSsh: boolean;
  /** SSH client tuple from `SSH_CLIENT`, when present. */
  sshClient?: string;
  /** SSH connection tuple from `SSH_CONNECTION`, when present. */
  sshConnection?: string;
  /** Remote client address parsed from SSH variables, when present. */
  remoteAddress?: string;
  /** Host address parsed from `SSH_CONNECTION`, when present. */
  hostAddress?: string;
  /** Preferred bind address for servers that must be reachable remotely. */
  recommendedBindAddress?: string;
  /** Prompt-facing hint for agents starting local servers. */
  hint?: string;
}

/** A single named git remote. */
export interface GitRemote {
  /** Remote name (e.g. `origin`). */
  name: string;
  /** Remote fetch URL. */
  url: string;
}

/** Git repository status for the current working directory. */
export interface GitContext {
  /** Whether `cwd` is inside a git work tree. */
  isGit: boolean;
  /** Configured git remotes, deduplicated by name. */
  remotes: GitRemote[];
}

/** A discovered append-system-prompt source and its raw content. */
export interface AppendSource {
  /** Absolute path to the source file. */
  source: string;
  /** Raw file content. */
  content: string;
}

const APPEND_SYSTEM_FILE = "APPEND_SYSTEM.md";

function runCommand(command: string, args: readonly string[], cwd?: string): string | undefined {
  try {
    return execFileSync(command, args, {
      cwd,
      timeout: 1500,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

/** Format a byte count as a human-readable binary size string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unknown";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? value : Number(value.toFixed(1));
  return `${rounded} ${units[unitIndex]}`;
}

/** Extract `PRETTY_NAME` from `/etc/os-release`-style content. */
export function parseOsReleaseName(content: string): string | undefined {
  for (const line of content.split("\n")) {
    const match = line.match(/^PRETTY_NAME="?([^"]+)"?\s*$/);
    if (match) return match[1].trim();
  }
  return undefined;
}

/** Extract a `name`/`version` pair from `--version` style output. */
export function parseShellVersion(output: string): string {
  const firstLine = output.split("\n")[0]?.trim() ?? "";
  const versionMatch = firstLine.match(/\d+\.\d+(?:\.\d+)?/);
  return versionMatch ? versionMatch[0] : firstLine;
}

/** Parse `git remote -v` output into deduplicated named remotes. */
export function parseGitRemotes(output: string): GitRemote[] {
  const remotes = new Map<string, string>();
  for (const line of output.split("\n")) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((?:fetch|push)\)\s*$/);
    if (match && !remotes.has(match[1])) remotes.set(match[1], match[2]);
  }
  return Array.from(remotes, ([name, url]) => ({ name, url }));
}

const SECRET_ENV_KEY_PATTERN =
  /(?:^|_)(?:ACCESS|ACCOUNT|AUTH|BEARER|CERT|CREDENTIAL|COOKIE|KEY|PASS|PASSWORD|PRIVATE|SECRET|SIGNATURE|TOKEN)(?:_|$)|(?:SESSION|API|OPENAI|ANTHROPIC|GEMINI|GOOGLE|GITHUB|GITLAB|AWS|AZURE|CLOUDFLARE|NPM).*(?:SECRET|TOKEN|KEY|COOKIE)/i;

const SECRET_ENV_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\bBasic\s+[A-Za-z0-9+/=-]+/i,
  /\b(?:ghp|gho|ghu|ghs|github_pat|glpat|sk|xox[baprs])-[-_A-Za-z0-9]{16,}\b/i,
] as const;

function looksLikeSecretEnvValue(value: string): boolean {
  if (SECRET_ENV_VALUE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (value.length < 48) return false;
  if (/\s|[/:\\]/.test(value)) return false;
  const uniqueChars = new Set(value).size;
  return uniqueChars >= 18 && /^[A-Za-z0-9_+=.-]+$/.test(value);
}

/** Sanitize a single environment variable value for prompt-template context. */
export function sanitizeEnvValue(key: string, value: string): string {
  if (key.startsWith("SSH_")) return value;
  if (SECRET_ENV_KEY_PATTERN.test(key) || looksLikeSecretEnvValue(value)) {
    return `[redacted ${value.length} chars]`;
  }
  return value;
}

/** Build a sanitized environment-variable map for prompt-template context. */
export function sanitizeEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(env).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === undefined) continue;
    sanitized[key] = sanitizeEnvValue(key, value);
  }
  return sanitized;
}

/** Derive remote-connection facts from environment variables. */
export function detectRemoteConnection(env: NodeJS.ProcessEnv = process.env): RemoteConnectionContext {
  const sshClient = env.SSH_CLIENT;
  const sshConnection = env.SSH_CONNECTION;
  const hasSshEnv = Object.entries(env).some(
    ([key, value]) => key.startsWith("SSH_") && value !== undefined && value !== "",
  );
  const remoteAddress = sshClient?.split(/\s+/)[0] ?? sshConnection?.split(/\s+/)[0];
  const hostAddress = sshConnection?.split(/\s+/)[2];
  const connected = hasSshEnv;
  return {
    connected,
    viaSsh: hasSshEnv,
    sshClient,
    sshConnection,
    remoteAddress,
    hostAddress,
    recommendedBindAddress: connected ? "0.0.0.0" : undefined,
    hint: connected
      ? `The user appears to be connected over SSH. When starting servers the user should reach from their remote client, bind to 0.0.0.0${hostAddress ? ` or ${hostAddress}` : ""} instead of localhost.`
      : undefined,
  };
}

/** Parse host GPU command output into GPU description strings. */
export function parseGpuLines(output: string): string[] {
  const gpus: string[] = [];
  const seen = new Set<string>();
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const description = line.includes(": ") ? line.split(": ").slice(1).join(": ").trim() : line;
    const value = description || line;
    if (value && !seen.has(value)) {
      seen.add(value);
      gpus.push(value);
    }
  }
  return gpus;
}

function detectOsName(): string {
  if (process.platform === "linux" && existsSync("/etc/os-release")) {
    try {
      const pretty = parseOsReleaseName(readFileSync("/etc/os-release", "utf8"));
      if (pretty) return pretty;
    } catch {
      // fall through to os-module values
    }
  }
  return `${os.type()} ${os.release()}`.trim();
}

function detectShell(): { name: string; version: string } {
  const shellPath = process.env.SHELL ?? process.env.ComSpec;
  const name = shellPath ? basename(shellPath) : "unknown";
  if (!shellPath) return { name, version: "" };
  const versionOutput = runCommand(shellPath, ["--version"]) ?? "";
  return { name, version: versionOutput ? parseShellVersion(versionOutput) : "" };
}

function detectCpu(): string {
  try {
    const cpus = os.cpus();
    const model = cpus[0]?.model?.trim();
    if (!model) return "unknown";
    return cpus.length > 0 ? `${model} (${cpus.length} cores)` : model;
  } catch {
    return "unknown";
  }
}

function detectGpus(): string[] {
  if (process.platform === "linux") {
    const lspci = runCommand("sh", ["-c", "lspci 2>/dev/null | grep -iE 'vga|3d|display'"]);
    return lspci ? parseGpuLines(lspci) : [];
  }
  if (process.platform === "darwin") {
    const profiler = runCommand("sh", [
      "-c",
      "system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/{print $2}'",
    ]);
    return profiler ? parseGpuLines(profiler) : [];
  }
  return [];
}

let cachedHost: HostContext | undefined;

/** Build host machine context, gathering host details once per process. */
export function getHostContext(): HostContext {
  if (cachedHost) return cachedHost;

  const uname =
    runCommand("uname", ["-a"]) ?? `${os.type()} ${os.release()} ${os.arch()}`.trim();
  cachedHost = {
    uname,
    os: detectOsName(),
    arch: os.arch(),
    hostname: os.hostname(),
    cpu: detectCpu(),
    memory: formatBytes(os.totalmem()),
    shell: detectShell(),
    gpu: detectGpus(),
    env: sanitizeEnvironment(),
    remote: detectRemoteConnection(),
  };
  return cachedHost;
}

const gitCache = new Map<string, GitContext>();

/** Determine git status and remotes for a working directory, cached per directory. */
export function getGitContext(cwd: string): GitContext {
  const cached = gitCache.get(cwd);
  if (cached) return cached;

  let result: GitContext = { isGit: false, remotes: [] };
  const insideWorkTree = runCommand("git", ["rev-parse", "--is-inside-work-tree"], cwd);
  if (insideWorkTree === "true") {
    const remotesRaw = runCommand("git", ["remote", "-v"], cwd) ?? "";
    result = { isGit: true, remotes: parseGitRemotes(remotesRaw) };
  }

  gitCache.set(cwd, result);
  return result;
}

/**
 * Discover append-system-prompt source files in project and global scope.
 * Mirrors Pi's `APPEND_SYSTEM.md` lookup so contributing sources can be
 * attributed to their origin path.
 */
export async function discoverAppendSources(input: {
  cwd: string;
  agentDir: string;
}): Promise<AppendSource[]> {
  const candidatePaths = [
    join(input.cwd, ".pi", APPEND_SYSTEM_FILE),
    join(input.agentDir, APPEND_SYSTEM_FILE),
  ];
  const sources: AppendSource[] = [];

  for (const path of candidatePaths) {
    if (!existsSync(path)) continue;
    try {
      sources.push({ source: path, content: await readFile(path, "utf8") });
    } catch {
      // ignore unreadable append sources
    }
  }

  return sources;
}
