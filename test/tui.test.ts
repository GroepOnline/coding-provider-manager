import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDashboardSnapshot } from "../src/tui/index.js";
import { adapters } from "../src/adapters/index.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

describe("TUI dashboard model", () => {
  it("builds a secret-free snapshot for interactive and agent surfaces", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-tui-"));
    homes.push(home);
    const snapshot = await buildDashboardSnapshot(home);
    expect(snapshot.providers.length).toBeGreaterThanOrEqual(9);
    expect(snapshot.tools.total).toBe(adapters.length);
    expect(snapshot.tools.total).toBeGreaterThanOrEqual(45);
    expect(JSON.stringify(snapshot)).not.toMatch(/api[_-]?key/i);
  });
});
