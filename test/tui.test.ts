import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adapters } from "../src/adapters/index.js";

vi.mock("../src/accounts/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/accounts/index.js")>();
  return {
    ...actual,
    accountDriverSummaries: () =>
      actual.accountDrivers.map((driver) => ({
        id: driver.id,
        displayName: driver.displayName,
        command: driver.command,
        installed: false,
        supportsUsage: driver.supportsUsage,
        supportsNext: true,
      })),
    listDriverAccounts: vi.fn(async () => []),
  };
});

vi.mock("../src/core/detect.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/detect.js")>();
  return {
    ...actual,
    commandExists: () => false,
    detectAdapters: (items: typeof adapters) =>
      items.map((adapter) => ({
        id: adapter.id,
        displayName: adapter.displayName,
        command: adapter.command,
        detectedAt: undefined,
        surfaces: adapter.surfaces ?? [],
        providerInjection: adapter.providerInjection ?? "automatic",
        authFlowIds: adapter.authFlowIds ?? [],
        installed: false,
      })),
  };
});

import { buildDashboardSnapshot } from "../src/tui/index.js";

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
    expect(snapshot.tools.installed).toBe(0);
    expect(snapshot.accounts.every((item) => item.installed === false)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/sk-[A-Za-z0-9]/);
  });
});
