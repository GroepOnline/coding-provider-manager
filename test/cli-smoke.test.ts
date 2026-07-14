import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliJs = path.join(root, "dist", "cli.js");

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cliJs, ...args], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

describe("CLI smoke", () => {
  beforeAll(() => {
    if (!fs.existsSync(cliJs)) {
      const build = spawnSync("npm", ["run", "build"], {
        cwd: root,
        encoding: "utf8",
        shell: true,
        env: process.env,
      });
      expect(build.status, build.stderr || build.stdout).toBe(0);
    }
    expect(fs.existsSync(cliJs)).toBe(true);
  });

  it("prints --version", () => {
    const result = runCli("--version");
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("prints agent manifest JSON", () => {
    const result = runCli("agent", "manifest");
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(result.stdout) as {
      protocol?: string;
      agentCompatible?: boolean;
      methods?: string[];
    };
    expect(manifest).toMatchObject({
      agentCompatible: true,
      interactiveRequired: false,
      secretsReturned: false,
    });
    expect(Array.isArray(manifest.methods)).toBe(true);
    expect(manifest.methods!.length).toBeGreaterThan(0);
  });
});
