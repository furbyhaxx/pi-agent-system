import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  detectRemoteConnection,
  formatBytes,
  parseGitRemotes,
  parseGpuLines,
  parseOsReleaseName,
  parseShellVersion,
  sanitizeEnvironment,
} from "../src/environment.ts";

void describe("formatBytes", () => {
  void it("formats binary sizes with appropriate units", () => {
    assert.equal(formatBytes(0), "unknown");
    assert.equal(formatBytes(512), "512 B");
    assert.equal(formatBytes(1024), "1 KiB");
    assert.equal(formatBytes(16 * 1024 ** 3), "16 GiB");
  });
});

void describe("parseOsReleaseName", () => {
  void it("extracts the quoted PRETTY_NAME value", () => {
    const content = 'NAME="Debian"\nPRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID=debian\n';
    assert.equal(parseOsReleaseName(content), "Debian GNU/Linux 12 (bookworm)");
  });

  void it("returns undefined when PRETTY_NAME is absent", () => {
    assert.equal(parseOsReleaseName("ID=debian\n"), undefined);
  });
});

void describe("parseShellVersion", () => {
  void it("extracts a version number from --version output", () => {
    assert.equal(parseShellVersion("GNU bash, version 5.2.15(1)-release"), "5.2.15");
    assert.equal(parseShellVersion("zsh 5.9 (x86_64-pc-linux-gnu)"), "5.9");
  });

  void it("falls back to the first line when no version is present", () => {
    assert.equal(parseShellVersion("custom shell\nsecond line"), "custom shell");
  });
});

void describe("sanitizeEnvironment", () => {
  void it("keeps non-secret values and redacts obvious secret values", () => {
    assert.deepEqual(
      sanitizeEnvironment({
        PATH: "/usr/bin:/bin",
        SSH_CLIENT: "203.0.113.10 55555 22",
        OPENAI_API_KEY: "sk-test-secret-value",
        NORMAL: "plain-value",
      }),
      {
        NORMAL: "plain-value",
        OPENAI_API_KEY: "[redacted 20 chars]",
        PATH: "/usr/bin:/bin",
        SSH_CLIENT: "203.0.113.10 55555 22",
      },
    );
  });
});

void describe("detectRemoteConnection", () => {
  void it("derives SSH remote facts and bind guidance", () => {
    assert.deepEqual(
      detectRemoteConnection({ SSH_CONNECTION: "203.0.113.10 55555 192.0.2.5 22" }),
      {
        connected: true,
        viaSsh: true,
        sshClient: undefined,
        sshConnection: "203.0.113.10 55555 192.0.2.5 22",
        remoteAddress: "203.0.113.10",
        hostAddress: "192.0.2.5",
        recommendedBindAddress: "0.0.0.0",
        hint: "The user appears to be connected over SSH. When starting servers the user should reach from their remote client, bind to 0.0.0.0 or 192.0.2.5 instead of localhost.",
      },
    );
  });

  void it("reports local sessions when SSH variables are absent", () => {
    assert.deepEqual(detectRemoteConnection({}), {
      connected: false,
      viaSsh: false,
      sshClient: undefined,
      sshConnection: undefined,
      remoteAddress: undefined,
      hostAddress: undefined,
      recommendedBindAddress: undefined,
      hint: undefined,
    });
  });
});

void describe("parseGpuLines", () => {
  void it("returns all unique GPU descriptions", () => {
    assert.deepEqual(
      parseGpuLines([
        "00:02.0 VGA compatible controller: Intel Corporation Integrated Graphics",
        "01:00.0 3D controller: NVIDIA Corporation AD107M",
        "01:00.0 3D controller: NVIDIA Corporation AD107M",
      ].join("\n")),
      ["Intel Corporation Integrated Graphics", "NVIDIA Corporation AD107M"],
    );
  });
});

void describe("parseGitRemotes", () => {
  void it("deduplicates fetch and push remote entries by name", () => {
    const output = [
      "origin\thttps://example.com/repo.git (fetch)",
      "origin\thttps://example.com/repo.git (push)",
      "upstream\thttps://example.com/upstream.git (fetch)",
      "upstream\thttps://example.com/upstream.git (push)",
    ].join("\n");

    assert.deepEqual(parseGitRemotes(output), [
      { name: "origin", url: "https://example.com/repo.git" },
      { name: "upstream", url: "https://example.com/upstream.git" },
    ]);
  });

  void it("returns an empty list for empty output", () => {
    assert.deepEqual(parseGitRemotes(""), []);
  });
});
