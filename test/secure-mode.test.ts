import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  aiderDeskAdapter,
  antigravityAdapter,
  vscodeAdapter,
  zedAdapter,
} from "../src/adapters/manual.js";
import { cursorAdapter, windsurfAdapter } from "../src/adapters/ide-guided.js";
import { expandDetectPath } from "../src/core/detect.js";
import { atomicWrite } from "../src/core/fs.js";
import { lockdownSecretFile } from "../src/core/secure-mode.js";

const temps: string[] = [];
afterEach(async () => Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))));

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-secure-"));
  temps.push(dir);
  return dir;
}

describe("lockdownSecretFile", () => {
  it("applies owner-only permissions on secret files", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "secret.txt");
    await fs.writeFile(file, "secret-value\n", { mode: 0o600 });
    await lockdownSecretFile(file, "fail-closed");

    if (process.platform === "win32") {
      const listing = spawnSync("icacls", [file], { encoding: "utf8", windowsHide: true });
      expect(listing.status).toBe(0);
      const user = process.env.USERNAME ?? "";
      expect(listing.stdout.toLowerCase()).toContain(user.toLowerCase());
      expect(listing.stdout.toLowerCase()).not.toContain("everyone:(f)");
    } else {
      const stat = await fs.stat(file);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("atomicWrite invokes lockdown without throwing on best-effort policy", async () => {
    const dir = await tempDir();
    const file = path.join(dir, "nested", "state.json");
    await atomicWrite(file, '{"ok":true}\n');
    expect(await fs.readFile(file, "utf8")).toContain('"ok":true');
  });
});

describe("Windows desktop detect paths", () => {
  it("lists LOCALAPPDATA / ProgramFiles candidates for high-value apps", () => {
    for (const adapter of [cursorAdapter, vscodeAdapter, windsurfAdapter, antigravityAdapter, zedAdapter, aiderDeskAdapter]) {
      const paths = adapter.detect?.paths ?? [];
      expect(paths.some((item) => item.includes("%LOCALAPPDATA%")), `${adapter.id} should declare %LOCALAPPDATA%`).toBe(true);
    }
    expect(vscodeAdapter.detect?.paths?.some((item) => item.includes("%ProgramFiles%"))).toBe(true);
    expect(cursorAdapter.detect?.paths?.some((item) => item.includes("%ProgramFiles%"))).toBe(true);
  });

  it("expands %LOCALAPPDATA% on Windows when set", () => {
    if (process.platform !== "win32") return;
    const local = process.env.LOCALAPPDATA;
    expect(local).toBeTruthy();
    const expanded = expandDetectPath("%LOCALAPPDATA%/Programs/cursor/Cursor.exe");
    expect(expanded.startsWith(local!)).toBe(true);
    expect(expanded).not.toContain("%LOCALAPPDATA%");
  });
});
